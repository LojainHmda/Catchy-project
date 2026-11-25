// Visitor analytics: anonymous page-view tracking, live sessions and the owner-only summary.
//
// Data model (all written by the server's Admin SDK only — the Firestore rules have no
// match for these collections, so browsers can neither read nor write them):
//   analytics_daily/{YYYY-MM-DD}_{shard}  daily counters, one write per page view
//     day, shard, pageViews, sessions, visitors, pages{key:n}, products{id:n},
//     sources{channel:n}, referrers{host:n}, hll[] (unique-visitor sketch entries)
//   analytics_presence/{sessionHash}      live sessions: lastSeen, seq, expiresAt
//
// Counting method (see docs/visitor-analytics.md):
//   - visitor  = one browser (random id in localStorage); clearing storage, private windows
//                and other devices count as new visitors.
//   - session  = activity from one browser with no gap longer than 30 minutes (all tabs share it).
//   - page view = one change of page (pathname) in a tab; filter/query changes do not count.
//   - unique visitors for a single day are an exact count of browser ids that reported their
//     first visit that day; for longer ranges they are estimated with a HyperLogLog sketch
//     (4096 registers, typically within ±2%, near-exact for small numbers).
//   - live visitors = sessions that sent a page view or heartbeat in the last 5 minutes.
import crypto from 'node:crypto';

export const STORE_TIME_ZONE = 'Asia/Hebron';
export const DAILY_COLLECTION = 'analytics_daily';
export const PRESENCE_COLLECTION = 'analytics_presence';
export const SHARDS = 4;
export const LIVE_WINDOW_MS = 5 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;
const PRESENCE_EXPIRES_MS = 24 * 60 * 60 * 1000;
const HLL_BITS = 12;
const HLL_REGISTERS = 1 << HLL_BITS;
const TOP_LIMIT = 20;

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|curl\/|wget|python|go-http|java\/|monitor|uptime/i;

export const CHANNELS = ['google', 'instagram', 'facebook', 'direct', 'referral', 'unknown'];

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Calendar day (YYYY-MM-DD) of `date` in the store's time zone. */
export function dayKey(date, timeZone = STORE_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Every day key from `from` to `to` inclusive (both YYYY-MM-DD). */
export function daysBetween(from, to) {
  const out = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function validateRange(from, to) {
  if (!DAY_RE.test(String(from)) || !DAY_RE.test(String(to))) return { ok: false, message: 'from/to must be YYYY-MM-DD.' };
  if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) return { ok: false, message: 'Invalid date.' };
  if (from > to) return { ok: false, message: '"from" must not be after "to".' };
  if (daysBetween(from, to).length > MAX_RANGE_DAYS) return { ok: false, message: `Range is limited to ${MAX_RANGE_DAYS} days.` };
  return { ok: true };
}

/**
 * Storefront path → stored page key (never the raw URL). Order ids and other route
 * parameters are dropped except product ids, which are kept for product-view counts.
 * Admin and POS screens are not visitor traffic and return null (not tracked).
 */
export function normalizePage(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.length > 300) return null;
  const path = rawPath.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'admin' || parts[0] === 'pos') return null;
  if (parts.length === 0) return { page: 'home', productId: null };
  if (parts[0] === 'catalog' && parts.length === 1) return { page: 'catalog', productId: null };
  if (parts[0] === 'product' && parts.length === 2) {
    let id = parts[1];
    try { id = decodeURIComponent(id); } catch { /* keep raw */ }
    return PRODUCT_ID_RE.test(id) ? { page: 'product', productId: id } : { page: 'other', productId: null };
  }
  if (parts[0] === 'coordinate' && parts.length === 2) return { page: 'coordinate', productId: null };
  if (parts[0] === 'cart' && parts.length === 1) return { page: 'cart', productId: null };
  if (parts[0] === 'login' && parts.length === 1) return { page: 'login', productId: null };
  if (parts[0] === 'orders') {
    if (parts.length === 1) return { page: 'orders', productId: null };
    if (parts[1] === 'confirmation') return { page: 'order-confirmation', productId: null };
    return { page: 'order-detail', productId: null };
  }
  return { page: 'other', productId: null };
}

function hostMatches(host, domains) {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Traffic channel for a session start. `src` comes from the browser and only holds the
 * referrer's host name, the utm_source value and whether Google/Facebook click ids were
 * present — never the full referring or landing URL.
 *   google / instagram / facebook: referrer host, utm_source or click id identifies them
 *   direct:   no referrer and no campaign tag (also visits whose app hides the referrer)
 *   referral: any other referring site (host kept, e.g. wa.me)
 *   unknown:  a referrer was present but could not be read
 */
export function classifySource(src, ownHost = '') {
  if (!src || typeof src !== 'object') return { channel: 'unknown', host: null };
  const rawRef = typeof src.ref === 'string' ? src.ref.trim().toLowerCase() : '';
  const utm = typeof src.utm === 'string' ? src.utm.trim().toLowerCase().slice(0, 40) : '';
  const own = String(ownHost).toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  if (rawRef === '?') return { channel: 'unknown', host: null };
  const host = rawRef.replace(/^www\./, '');
  const validHost = HOST_RE.test(host) && host.length <= 80 ? host : '';
  if (rawRef && !validHost && !/^[a-z0-9.]+$/.test(rawRef)) return { channel: 'unknown', host: null };
  // App referrers arrive as package names (android-app://com.instagram.android → com.instagram.android).
  const ref = validHost || rawRef;
  const isOwn = own && ref && (ref === own || ref.endsWith(`.${own}`));

  if (ref && !isOwn) {
    if (/(^|\.)google\.[a-z.]+$/.test(ref) || ref.startsWith('com.google.android')) return { channel: 'google', host: null };
    if (hostMatches(ref, ['instagram.com']) || ref.startsWith('com.instagram')) return { channel: 'instagram', host: null };
    if (hostMatches(ref, ['facebook.com', 'fb.com', 'fb.me', 'messenger.com']) || ref.startsWith('com.facebook')) return { channel: 'facebook', host: null };
  }
  if (utm) {
    if (utm.includes('google')) return { channel: 'google', host: null };
    if (utm === 'ig' || utm.includes('instagram')) return { channel: 'instagram', host: null };
    if (utm === 'fb' || utm.includes('facebook') || utm === 'meta') return { channel: 'facebook', host: null };
  }
  if (src.gclid === true) return { channel: 'google', host: null };
  if (src.fbclid === true) return { channel: 'facebook', host: null };
  if (ref && !isOwn) return { channel: 'referral', host: validHost || null };
  if (utm) return { channel: 'referral', host: null };
  return { channel: 'direct', host: null };
}

export function isBotUserAgent(ua) {
  return !ua || BOT_RE.test(String(ua));
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** HyperLogLog entry "register:rank" for one visitor id (the id itself is never stored). */
export function hllEntry(visitorId) {
  const h = sha(`v:${visitorId}`);
  const register = ((h[0] << 8) | h[1]) >>> (16 - HLL_BITS);
  const rest = h.readUInt32BE(2);
  const rank = Math.clz32(rest) + 1;
  return `${register}:${rank}`;
}

/** Estimated distinct visitors from a set of "register:rank" entries. */
export function hllEstimate(entries) {
  const registers = new Uint8Array(HLL_REGISTERS);
  for (const e of entries) {
    const [r, k] = String(e).split(':').map(Number);
    if (Number.isInteger(r) && r >= 0 && r < HLL_REGISTERS && Number.isInteger(k) && k > registers[r]) registers[r] = k;
  }
  let sum = 0;
  let zeros = 0;
  for (const v of registers) { sum += 2 ** -v; if (v === 0) zeros += 1; }
  const m = HLL_REGISTERS;
  const alpha = 0.7213 / (1 + 1.079 / m);
  const raw = (alpha * m * m) / sum;
  if (raw <= 2.5 * m && zeros > 0) return Math.round(m * Math.log(m / zeros)); // linear counting (small ranges)
  return Math.round(raw);
}

const encodeHost = (h) => h.replace(/\./g, '~');
const decodeHost = (h) => h.replace(/~/g, '.');

export function shardFor(visitorId) {
  return sha(`s:${visitorId}`)[0] % SHARDS;
}

/** Validated collect request, or null when it must be ignored. */
export function parseCollect(body) {
  if (!body || typeof body !== 'object' || body.v !== 1) return null;
  const kind = body.kind;
  if (!['pageview', 'heartbeat', 'leave'].includes(kind)) return null;
  if (!ID_RE.test(String(body.sid ?? ''))) return null;
  const seq = Number.isInteger(body.seq) && body.seq >= 0 && body.seq < 1e9 ? body.seq : 0;
  if (kind !== 'pageview') return { kind, sid: body.sid, seq };
  if (!ID_RE.test(String(body.vid ?? ''))) return null;
  const page = normalizePage(body.path);
  if (!page) return null;
  return {
    kind, sid: body.sid, vid: body.vid, seq, page: page.page, productId: page.productId,
    newSession: body.newSession === true, newDay: body.newDay === true, presence: body.presence === true,
    src: body.newSession === true ? body.src : undefined,
  };
}

/** The increments one page view adds to its daily shard (plain data; the store applies them). */
export function dailyIncrement(event, ownHost) {
  const inc = { pageViews: 1, pages: { [event.page]: 1 }, products: {}, sources: {}, referrers: {}, sessions: 0, visitors: 0 };
  if (event.productId) inc.products[event.productId] = 1;
  if (event.newDay) inc.visitors = 1;
  if (event.newSession) {
    inc.sessions = 1;
    const { channel, host } = classifySource(event.src, ownHost);
    inc.sources[channel] = 1;
    if (host) inc.referrers[encodeHost(host)] = 1;
  }
  return { inc, hll: hllEntry(event.vid) };
}

const addMap = (target, src) => {
  for (const [k, v] of Object.entries(src || {})) if (typeof v === 'number') target[k] = (target[k] ?? 0) + v;
};
const top = (map, n = TOP_LIMIT) => Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

/**
 * Dashboard summary from the daily shard docs of [from, to]. Never invents data: days
 * without a document are reported as 0 and `hasData` tells the UI to show an empty state.
 */
export function summarize(docs, from, to, { trackingSince = null } = {}) {
  const days = new Map(daysBetween(from, to).map((d) => [d, { day: d, pageViews: 0, sessions: 0, visitors: 0, productViews: 0, hll: new Set(), products: {} }]));
  const pages = {};
  const products = {};
  const sources = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
  const referrers = {};
  for (const d of docs) {
    const day = days.get(d.day);
    if (!day) continue;
    day.pageViews += d.pageViews ?? 0;
    day.sessions += d.sessions ?? 0;
    day.visitors += d.visitors ?? 0;
    for (const e of d.hll ?? []) day.hll.add(e);
    addMap(day.products, d.products);
    addMap(pages, d.pages);
    addMap(products, d.products);
    addMap(sources, d.sources);
    for (const [h, v] of Object.entries(d.referrers ?? {})) referrers[decodeHost(h)] = (referrers[decodeHost(h)] ?? 0) + v;
  }
  const dayList = [...days.values()];
  for (const d of dayList) d.productViews = Object.values(d.products).reduce((a, b) => a + b, 0);
  const allHll = new Set(dayList.flatMap((d) => [...d.hll]));
  const single = dayList.length === 1;
  const months = new Map();
  for (const d of dayList) {
    const key = d.day.slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, pageViews: 0, sessions: 0, productViews: 0, hll: new Set(), days: 0 });
    const m = months.get(key);
    m.pageViews += d.pageViews; m.sessions += d.sessions; m.productViews += d.productViews; m.days += 1;
    for (const e of d.hll) m.hll.add(e);
  }
  const topProductIds = top(products).map(([id]) => id);
  const trendIds = topProductIds.slice(0, 5);
  const totals = {
    pageViews: dayList.reduce((a, d) => a + d.pageViews, 0),
    sessions: dayList.reduce((a, d) => a + d.sessions, 0),
    productViews: dayList.reduce((a, d) => a + d.productViews, 0),
    // Single day: exact count of first visits that day. Longer ranges: HLL estimate (a visitor
    // returning on several days is counted once, which a sum of daily counts would not do).
    uniqueVisitors: single ? dayList[0].visitors : hllEstimate(allHll),
    uniqueVisitorsApproximate: !single,
  };
  return {
    from, to, trackingSince, hasData: totals.pageViews > 0, totals,
    days: dayList.map((d) => ({ day: d.day, pageViews: d.pageViews, sessions: d.sessions, visitors: d.visitors, productViews: d.productViews })),
    months: [...months.values()].map((m) => ({ month: m.month, days: m.days, pageViews: m.pageViews, sessions: m.sessions, productViews: m.productViews, uniqueVisitors: hllEstimate(m.hll), uniqueVisitorsApproximate: true })),
    topProducts: topProductIds.map((id) => ({ id, name: null, views: products[id] })),
    productTrend: { productIds: trendIds, days: dayList.map((d) => ({ day: d.day, total: d.productViews, byProduct: Object.fromEntries(trendIds.map((id) => [id, d.products[id] ?? 0])) })) },
    topPages: top(pages).map(([page, views]) => ({ page, views })),
    sources: CHANNELS.map((channel) => ({ channel, sessions: sources[channel] ?? 0 })),
    referrers: top(referrers, 15).map(([host, sessions]) => ({ host, sessions })),
  };
}

/** Fixed-window per-key rate limiter (in memory, per server instance). */
export function createRateLimiter({ limit = 90, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return (key) => {
    const t = now();
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) { hits.set(key, { start: t, count: 1 }); return true; }
    entry.count += 1;
    return entry.count <= limit;
  };
}

// ── Firestore store (Admin SDK) ───────────────────────────────────────────────

export async function createFirestoreAnalyticsStore(db) {
  const { FieldValue, Timestamp } = await import('firebase-admin/firestore');
  const presenceId = (sid) => sha(`p:${sid}`).toString('hex').slice(0, 32);
  const incMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, FieldValue.increment(v)]));
  // expiresAt lets a Firestore TTL policy delete old presence docs if one is enabled later.
  const presenceData = (seq, now) => ({
    lastSeen: Timestamp.fromDate(now),
    seq,
    expiresAt: Timestamp.fromDate(new Date(now.getTime() + PRESENCE_EXPIRES_MS)),
  });
  return {
    async recordPageView(event, now, ownHost) {
      const day = dayKey(now);
      const shard = shardFor(event.vid);
      const { inc, hll } = dailyIncrement(event, ownHost);
      const data = { day, shard, pageViews: FieldValue.increment(inc.pageViews), pages: incMap(inc.pages), hll: FieldValue.arrayUnion(hll), updatedAt: Timestamp.fromDate(now) };
      if (Object.keys(inc.products).length) data.products = incMap(inc.products);
      if (inc.sessions) data.sessions = FieldValue.increment(1);
      if (inc.visitors) data.visitors = FieldValue.increment(1);
      if (Object.keys(inc.sources).length) data.sources = incMap(inc.sources);
      if (Object.keys(inc.referrers).length) data.referrers = incMap(inc.referrers);
      const batch = db.batch();
      batch.set(db.collection(DAILY_COLLECTION).doc(`${day}_${shard}`), data, { merge: true });
      if (event.presence) batch.set(db.collection(PRESENCE_COLLECTION).doc(presenceId(event.sid)), presenceData(event.seq, now), { merge: true });
      await batch.commit();
    },
    async touchPresence(sid, seq, now) {
      await db.collection(PRESENCE_COLLECTION).doc(presenceId(sid)).set(presenceData(seq, now), { merge: true });
    },
    /** Ends a session's live presence unless a newer page view/heartbeat already arrived (seq). */
    async leavePresence(sid, seq) {
      const ref = db.collection(PRESENCE_COLLECTION).doc(presenceId(sid));
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && (snap.get('seq') ?? 0) <= seq) tx.delete(ref);
      });
    },
    async countLive(now) {
      const since = Timestamp.fromDate(new Date(now.getTime() - LIVE_WINDOW_MS));
      const snap = await db.collection(PRESENCE_COLLECTION).where('lastSeen', '>=', since).count().get();
      return snap.data().count;
    },
    async readDaily(from, to) {
      const snap = await db.collection(DAILY_COLLECTION).where('day', '>=', from).where('day', '<=', to).get();
      return snap.docs.map((d) => d.data());
    },
    async firstDay() {
      const snap = await db.collection(DAILY_COLLECTION).orderBy('day').limit(1).get();
      return snap.empty ? null : snap.docs[0].get('day');
    },
    async productNames(ids) {
      if (!ids.length) return {};
      const snaps = await db.getAll(...ids.map((id) => db.collection('products').doc(id)));
      return Object.fromEntries(snaps.filter((s) => s.exists).map((s) => [s.id, String(s.get('name') ?? '') || null]));
    },
  };
}

// ── Request handlers (shared by server/index.js and the Vite dev mirror) ──────

const defaultLimiter = createRateLimiter();

/**
 * Public, anonymous collect endpoint. Always answers 204 for ignored events (bots, bad
 * input, rate limit) so it leaks nothing; only same-origin browsers are accepted.
 */
export async function handleCollect(getStore, { body, headers = {}, ip = '' }, { now = new Date(), limiter = defaultLimiter } = {}) {
  // HTTP/2 has no Host header (it sends :authority) — the Vite dev server and h2 clients use it.
  const host = String(headers.host || headers[':authority'] || '');
  const origin = String(headers.origin || '');
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch { /* invalid */ }
    if (!host || originHost !== host) return { status: 403, body: { ok: false } };
  }
  if (isBotUserAgent(headers['user-agent'])) return { status: 204 };
  if (!limiter(ip || 'unknown')) return { status: 204 };
  const event = parseCollect(body);
  if (!event) return { status: 204 };
  const store = await getStore();
  if (!store) return { status: 204 };
  try {
    if (event.kind === 'pageview') await store.recordPageView(event, now, host);
    else if (event.kind === 'heartbeat') await store.touchPresence(event.sid, event.seq, now);
    else await store.leavePresence(event.sid, event.seq);
  } catch (err) {
    console.error('[analytics] collect failed:', err?.message || err);
  }
  return { status: 204 };
}

/** Owner-only: number of live sessions. `auth` is the verifyAdminRequest() result. */
export async function handleLive(getStore, auth, { now = new Date() } = {}) {
  if (!auth?.ok) return { status: auth?.status || 401, body: { ok: false, code: 'FORBIDDEN', message: auth?.message || 'Not authorized.' } };
  const store = await getStore();
  if (!store) return { status: 503, body: { ok: false, code: 'UNAVAILABLE', message: 'Analytics are temporarily unavailable.' } };
  const live = await store.countLive(now);
  return { status: 200, body: { ok: true, live, windowMinutes: LIVE_WINDOW_MS / 60_000, approximate: true, at: now.toISOString() } };
}

/** Owner-only: dashboard summary for [from, to]. */
export async function handleSummary(getStore, auth, body) {
  if (!auth?.ok) return { status: auth?.status || 401, body: { ok: false, code: 'FORBIDDEN', message: auth?.message || 'Not authorized.' } };
  const { from, to } = body || {};
  const valid = validateRange(from, to);
  if (!valid.ok) return { status: 400, body: { ok: false, code: 'BAD_RANGE', message: valid.message } };
  const store = await getStore();
  if (!store) return { status: 503, body: { ok: false, code: 'UNAVAILABLE', message: 'Analytics are temporarily unavailable.' } };
  const [docs, trackingSince] = await Promise.all([store.readDaily(from, to), store.firstDay()]);
  const summary = summarize(docs, from, to, { trackingSince });
  const names = await store.productNames(summary.topProducts.map((p) => p.id));
  summary.topProducts = summary.topProducts.map((p) => ({ ...p, name: names[p.id] ?? null }));
  return { status: 200, body: { ok: true, ...summary } };
}
