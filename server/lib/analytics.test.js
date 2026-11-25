import { describe, it, expect, vi } from 'vitest';
import {
  classifySource,
  createFirestoreAnalyticsStore,
  createRateLimiter,
  dailyIncrement,
  dayKey,
  daysBetween,
  handleCollect,
  handleLive,
  handleSummary,
  hllEntry,
  hllEstimate,
  normalizePage,
  parseCollect,
  summarize,
  validateRange,
} from './analytics.js';

const VID = 'visitor-0001-aaaa';
const SID = 'session-0001-bbbb';
const pageview = (extra = {}) => ({ v: 1, kind: 'pageview', vid: VID, sid: SID, seq: 1, path: '/', newSession: false, newDay: false, presence: false, ...extra });

describe('classifySource — channel per session start', () => {
  const c = (src, own = 'catchy-ps.com') => classifySource(src, own).channel;
  const src = (ref = '', extra = {}) => ({ ref, utm: '', gclid: false, fbclid: false, ...extra });

  it('recognises Google, Instagram and Facebook referrers (web and app)', () => {
    expect(c(src('www.google.com'))).toBe('google');
    expect(c(src('google.com.eg'))).toBe('google');
    expect(c(src('com.google.android.googlequicksearchbox'))).toBe('google');
    expect(c(src('l.instagram.com'))).toBe('instagram');
    expect(c(src('com.instagram.android'))).toBe('instagram');
    expect(c(src('m.facebook.com'))).toBe('facebook');
    expect(c(src('l.facebook.com'))).toBe('facebook');
    expect(c(src('fb.me'))).toBe('facebook');
  });

  it('uses utm_source and click ids when there is no recognisable referrer', () => {
    expect(c(src('', { utm: 'ig' }))).toBe('instagram');
    expect(c(src('', { utm: 'instagram_story' }))).toBe('instagram');
    expect(c(src('', { utm: 'fb' }))).toBe('facebook');
    expect(c(src('', { utm: 'google' }))).toBe('google');
    expect(c(src('', { gclid: true }))).toBe('google');
    expect(c(src('', { fbclid: true }))).toBe('facebook');
  });

  it('a referrer host wins over a click id (Instagram links also carry fbclid)', () => {
    expect(c(src('l.instagram.com', { fbclid: true }))).toBe('instagram');
  });

  it('direct = no referrer and no campaign; own site counts as direct', () => {
    expect(c(src(''))).toBe('direct');
    expect(c(src('catchy-ps.com'))).toBe('direct');
    expect(c(src('www.catchy-ps.com'))).toBe('direct');
    expect(c(src('127.0.0.1'), '127.0.0.1:3000')).toBe('direct');
  });

  it('other sites are referrals and keep only their host', () => {
    expect(classifySource(src('wa.me'), 'catchy-ps.com')).toEqual({ channel: 'referral', host: 'wa.me' });
    expect(classifySource(src('www.tiktok.com'), 'catchy-ps.com')).toEqual({ channel: 'referral', host: 'tiktok.com' });
    expect(c(src('', { utm: 'newsletter' }))).toBe('referral');
  });

  it('unreadable or missing source information is unknown, never guessed', () => {
    expect(c(src('?'))).toBe('unknown');
    expect(c(src('<script>'))).toBe('unknown');
    expect(c(undefined)).toBe('unknown');
  });
});

describe('normalizePage — stored page keys, never raw URLs', () => {
  it('maps storefront routes and keeps only product ids', () => {
    expect(normalizePage('/')).toEqual({ page: 'home', productId: null });
    expect(normalizePage('/catalog')).toEqual({ page: 'catalog', productId: null });
    expect(normalizePage('/catalog/')).toEqual({ page: 'catalog', productId: null });
    expect(normalizePage('/product/abc_DEF-123')).toEqual({ page: 'product', productId: 'abc_DEF-123' });
    expect(normalizePage('/coordinate/look1')).toEqual({ page: 'coordinate', productId: null });
    expect(normalizePage('/cart')).toEqual({ page: 'cart', productId: null });
  });

  it('drops order ids, query strings and fragments', () => {
    expect(normalizePage('/orders/ORDER-SECRET-1')).toEqual({ page: 'order-detail', productId: null });
    expect(normalizePage('/orders/confirmation/ORDER-SECRET-1')).toEqual({ page: 'order-confirmation', productId: null });
    expect(normalizePage('/catalog?email=a@b.c#x')).toEqual({ page: 'catalog', productId: null });
  });

  it('admin and POS screens are not visitor traffic', () => {
    expect(normalizePage('/admin')).toBeNull();
    expect(normalizePage('/admin/analytics')).toBeNull();
    expect(normalizePage('/pos/close')).toBeNull();
  });

  it('rejects malformed paths and odd product ids', () => {
    expect(normalizePage('catalog')).toBeNull();
    expect(normalizePage(42)).toBeNull();
    expect(normalizePage('/product/a.b')).toEqual({ page: 'other', productId: null });
    expect(normalizePage('/something/else')).toEqual({ page: 'other', productId: null });
  });
});

describe('parseCollect — input validation', () => {
  it('accepts a valid page view and drops source info unless a session starts', () => {
    const e = parseCollect(pageview({ path: '/product/p1', src: { ref: 'l.instagram.com' } }));
    expect(e).toMatchObject({ kind: 'pageview', page: 'product', productId: 'p1', newSession: false });
    expect(e.src).toBeUndefined();
    expect(parseCollect(pageview({ newSession: true, src: { ref: 'x.com' } })).src).toEqual({ ref: 'x.com' });
  });

  it('rejects wrong versions, kinds, ids and admin paths', () => {
    expect(parseCollect(null)).toBeNull();
    expect(parseCollect(pageview({ v: 2 }))).toBeNull();
    expect(parseCollect(pageview({ kind: 'click' }))).toBeNull();
    expect(parseCollect(pageview({ sid: 'short' }))).toBeNull();
    expect(parseCollect(pageview({ vid: 'bad id with spaces' }))).toBeNull();
    expect(parseCollect(pageview({ path: '/admin/orders' }))).toBeNull();
  });

  it('heartbeat and leave need only a session id and seq', () => {
    expect(parseCollect({ v: 1, kind: 'heartbeat', sid: SID, seq: 4 })).toEqual({ kind: 'heartbeat', sid: SID, seq: 4 });
    expect(parseCollect({ v: 1, kind: 'leave', sid: SID, seq: -3 })).toEqual({ kind: 'leave', sid: SID, seq: 0 });
  });
});

describe('dailyIncrement — what one page view adds (dedup flags from the browser)', () => {
  it('a page view inside an existing session adds only a page view', () => {
    const { inc } = dailyIncrement(parseCollect(pageview({ path: '/catalog' })), 'catchy-ps.com');
    expect(inc).toMatchObject({ pageViews: 1, pages: { catalog: 1 }, sessions: 0, visitors: 0, sources: {}, referrers: {} });
  });

  it('first visit of the day counts a visitor; a new session counts a session and its source', () => {
    const { inc } = dailyIncrement(parseCollect(pageview({ path: '/product/p9', newDay: true, newSession: true, src: { ref: 'wa.me' } })), 'catchy-ps.com');
    expect(inc).toMatchObject({ pageViews: 1, visitors: 1, sessions: 1, products: { p9: 1 }, sources: { referral: 1 }, referrers: { 'wa~me': 1 } });
  });

  it('the visitor sketch entry is stable for one browser and differs between browsers', () => {
    expect(hllEntry(VID)).toBe(hllEntry(VID));
    expect(hllEntry(VID)).not.toBe(hllEntry('visitor-0002-cccc'));
    expect(hllEntry(VID)).toMatch(/^\d+:\d+$/);
  });
});

describe('hllEstimate — unique visitors across days', () => {
  const ids = (n, prefix = 'v') => Array.from({ length: n }, (_, i) => `${prefix}-${i}-xxxxxxxx`);

  it('is exact or within 3% for small numbers', () => {
    expect(hllEstimate([])).toBe(0);
    expect(hllEstimate(ids(1).map(hllEntry))).toBe(1);
    const e = hllEstimate(ids(100).map(hllEntry));
    expect(Math.abs(e - 100)).toBeLessThanOrEqual(3);
  });

  it('stays within 6% for thousands of visitors', () => {
    for (const n of [2000, 20000]) {
      const e = hllEstimate(ids(n, `n${n}`).map(hllEntry));
      expect(Math.abs(e - n) / n).toBeLessThan(0.06);
    }
  });

  it('a visitor returning on several days is counted once', () => {
    const day = ids(300).map(hllEntry);
    expect(Math.abs(hllEstimate([...day, ...day, ...day]) - 300)).toBeLessThanOrEqual(9);
  });
});

describe('dates', () => {
  it('dayKey uses the store time zone (Asia/Hebron)', () => {
    expect(dayKey(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-16'); // UTC+3 in summer
    expect(dayKey(new Date('2026-01-15T21:30:00Z'))).toBe('2026-01-15'); // UTC+2 in winter
  });

  it('daysBetween is inclusive and crosses month and year ends', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('validateRange rejects bad, reversed and over-long ranges', () => {
    expect(validateRange('2026-10-01', '2026-10-31').ok).toBe(true);
    expect(validateRange('2026-10-31', '2026-10-01').ok).toBe(false);
    expect(validateRange('2026/10/01', '2026-10-31').ok).toBe(false);
    expect(validateRange('2025-01-01', '2026-10-31').ok).toBe(false);
  });
});

describe('summarize — dashboard numbers from daily shards', () => {
  const shard = (day, extra) => ({ day, pageViews: 0, sessions: 0, visitors: 0, pages: {}, products: {}, sources: {}, referrers: {}, hll: [], ...extra });
  const a = hllEntry('visitor-a-xxxxxxxx');
  const b = hllEntry('visitor-b-xxxxxxxx');

  it('empty range: zeros for every day and hasData=false (nothing invented)', () => {
    const s = summarize([], '2026-10-01', '2026-10-03');
    expect(s.hasData).toBe(false);
    expect(s.days.map((d) => d.pageViews)).toEqual([0, 0, 0]);
    expect(s.totals).toMatchObject({ pageViews: 0, uniqueVisitors: 0, sessions: 0 });
    expect(s.sources.every((x) => x.sessions === 0)).toBe(true);
  });

  it('single day: exact visitor counter, shards added together', () => {
    const s = summarize([shard('2026-10-05', { pageViews: 3, visitors: 1, sessions: 1, hll: [a] }), shard('2026-10-05', { pageViews: 2, visitors: 1, sessions: 1, hll: [b] })], '2026-10-05', '2026-10-05');
    expect(s.totals).toMatchObject({ pageViews: 5, uniqueVisitors: 2, uniqueVisitorsApproximate: false, sessions: 2 });
  });

  it('multi-day: visitors seen on two days count once and are marked approximate', () => {
    const s = summarize([
      shard('2026-10-05', { pageViews: 2, visitors: 2, hll: [a, b] }),
      shard('2026-10-06', { pageViews: 1, visitors: 1, hll: [a] }),
    ], '2026-10-05', '2026-10-06');
    expect(s.totals.uniqueVisitors).toBe(2);
    expect(s.totals.uniqueVisitorsApproximate).toBe(true);
    expect(s.days.map((d) => d.visitors)).toEqual([2, 1]);
  });

  it('ranks products and pages, totals sources and decodes referrer hosts', () => {
    const s = summarize([
      shard('2026-10-05', { pageViews: 6, pages: { product: 4, home: 2 }, products: { p1: 1, p2: 3 }, sources: { google: 1, referral: 1 }, referrers: { 'wa~me': 1 } }),
      shard('2026-10-06', { pageViews: 2, pages: { product: 2 }, products: { p1: 2 }, sources: { instagram: 2 } }),
    ], '2026-10-05', '2026-10-06', { trackingSince: '2026-10-05' });
    expect(s.topProducts.map((p) => [p.id, p.views])).toEqual([['p1', 3], ['p2', 3]]);
    expect(s.topPages).toEqual([{ page: 'product', views: 6 }, { page: 'home', views: 2 }]);
    expect(s.sources.find((x) => x.channel === 'instagram').sessions).toBe(2);
    expect(s.referrers).toEqual([{ host: 'wa.me', sessions: 1 }]);
    expect(s.totals.productViews).toBe(6);
    expect(s.productTrend.days.map((d) => d.byProduct.p1)).toEqual([1, 2]);
    expect(s.trackingSince).toBe('2026-10-05');
  });

  it('groups months and ignores docs outside the range', () => {
    const s = summarize([shard('2026-09-30', { pageViews: 1, hll: [a] }), shard('2026-10-01', { pageViews: 1, hll: [a] }), shard('2026-11-01', { pageViews: 9 })], '2026-09-30', '2026-10-01');
    expect(s.months).toEqual([
      expect.objectContaining({ month: '2026-09', days: 1, pageViews: 1, uniqueVisitors: 1 }),
      expect.objectContaining({ month: '2026-10', days: 1, pageViews: 1, uniqueVisitors: 1 }),
    ]);
    expect(s.totals.pageViews).toBe(2);
  });
});

describe('createRateLimiter', () => {
  it('allows `limit` hits per window per key', () => {
    let t = 0;
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect([allow('ip'), allow('ip'), allow('ip'), allow('other')]).toEqual([true, true, false, true]);
    t = 1000;
    expect(allow('ip')).toBe(true);
  });
});

describe('handleCollect — public endpoint', () => {
  const headers = { host: 'catchy-ps.com', origin: 'https://catchy-ps.com', 'user-agent': 'Mozilla/5.0 (iPhone) Safari/604.1' };
  const makeStore = () => ({ recordPageView: vi.fn(async () => {}), touchPresence: vi.fn(async () => {}), leavePresence: vi.fn(async () => {}) });
  const allowAll = () => true;

  it('records a valid page view once and answers 204', async () => {
    const store = makeStore();
    const r = await handleCollect(async () => store, { body: pageview({ path: '/catalog' }), headers, ip: '1.2.3.4' }, { limiter: allowAll });
    expect(r.status).toBe(204);
    expect(store.recordPageView).toHaveBeenCalledTimes(1);
    expect(store.recordPageView.mock.calls[0][0]).toMatchObject({ page: 'catalog', sid: SID });
    expect(store.recordPageView.mock.calls[0][2]).toBe('catchy-ps.com');
  });

  it('routes heartbeats and leaves to presence', async () => {
    const store = makeStore();
    await handleCollect(async () => store, { body: { v: 1, kind: 'heartbeat', sid: SID, seq: 2 }, headers }, { limiter: allowAll });
    await handleCollect(async () => store, { body: { v: 1, kind: 'leave', sid: SID, seq: 2 }, headers }, { limiter: allowAll });
    expect(store.touchPresence).toHaveBeenCalledWith(SID, 2, expect.any(Date));
    expect(store.leavePresence).toHaveBeenCalledWith(SID, 2);
  });

  it('REGRESSION: accepts HTTP/2 requests, which carry :authority instead of Host', async () => {
    const store = makeStore();
    const h2 = { ':authority': '127.0.0.1:3000', origin: 'https://127.0.0.1:3000', 'user-agent': headers['user-agent'] };
    expect((await handleCollect(async () => store, { body: pageview(), headers: h2 }, { limiter: allowAll })).status).toBe(204);
    expect(store.recordPageView).toHaveBeenCalledTimes(1);
    expect(store.recordPageView.mock.calls[0][2]).toBe('127.0.0.1:3000');
  });

  it('refuses other origins (403) and silently ignores bots, bad input and rate-limited clients', async () => {
    const store = makeStore();
    expect((await handleCollect(async () => store, { body: pageview(), headers: { ...headers, origin: 'https://evil.example' } }, { limiter: allowAll })).status).toBe(403);
    expect((await handleCollect(async () => store, { body: pageview(), headers: { ...headers, 'user-agent': 'Googlebot/2.1' } }, { limiter: allowAll })).status).toBe(204);
    expect((await handleCollect(async () => store, { body: { nope: 1 }, headers }, { limiter: allowAll })).status).toBe(204);
    expect((await handleCollect(async () => store, { body: pageview(), headers }, { limiter: () => false })).status).toBe(204);
    expect(store.recordPageView).not.toHaveBeenCalled();
  });

  it('a storage failure never breaks the visitor (still 204)', async () => {
    const store = { ...makeStore(), recordPageView: vi.fn(async () => { throw new Error('down'); }) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleCollect(async () => store, { body: pageview(), headers }, { limiter: allowAll })).status).toBe(204);
    spy.mockRestore();
  });
});

describe('owner-only handlers — authorization is checked before any data is read', () => {
  const store = { countLive: vi.fn(async () => 3), readDaily: vi.fn(async () => []), firstDay: vi.fn(async () => null), productNames: vi.fn(async () => ({})) };
  const getStore = vi.fn(async () => store);

  it('denied or missing auth returns its status and never touches the store', async () => {
    for (const auth of [{ ok: false, status: 403, message: 'This account is not an admin.' }, { ok: false, status: 401, message: 'Missing token' }, undefined]) {
      const live = await handleLive(getStore, auth);
      const sum = await handleSummary(getStore, auth, { from: '2026-10-01', to: '2026-10-02' });
      expect([live.status, sum.status]).toEqual([auth?.status ?? 401, auth?.status ?? 401]);
      expect(live.body.ok).toBe(false);
    }
    expect(getStore).not.toHaveBeenCalled();
  });

  it('an owner gets the live count (marked approximate) and the summary', async () => {
    const owner = { ok: true, uid: 'u', email: 'owner@x' };
    const live = await handleLive(getStore, owner, { now: new Date('2026-10-28T10:00:00Z') });
    expect(live).toEqual({ status: 200, body: { ok: true, live: 3, windowMinutes: 5, approximate: true, at: '2026-10-28T10:00:00.000Z' } });
    const sum = await handleSummary(getStore, owner, { from: '2026-10-01', to: '2026-10-02' });
    expect(sum.status).toBe(200);
    expect(sum.body).toMatchObject({ ok: true, hasData: false, trackingSince: null });
  });

  it('rejects an invalid range with 400', async () => {
    const r = await handleSummary(getStore, { ok: true }, { from: '2026-10-05', to: '2026-10-01' });
    expect(r.status).toBe(400);
  });
});

describe('Firestore store — live presence leave is ignored when newer presence exists', () => {
  function fakeDb(initial) {
    const docs = new Map(initial);
    const ref = (id) => ({ id });
    return {
      docs,
      collection: () => ({ doc: (id) => ref(id) }),
      runTransaction: async (fn) => fn({
        get: async (r) => ({ exists: docs.has(r.id), get: (f) => docs.get(r.id)?.[f] }),
        delete: (r) => docs.delete(r.id),
      }),
    };
  }

  it('deletes only when the stored seq is not newer than the leave', async () => {
    const crypto = await import('node:crypto');
    const id = crypto.createHash('sha256').update(`p:${SID}`).digest('hex').slice(0, 32);
    const db = fakeDb([[id, { seq: 5 }]]);
    const store = await createFirestoreAnalyticsStore(db);
    await store.leavePresence(SID, 4); // a refresh already sent presence seq 5
    expect(db.docs.has(id)).toBe(true);
    await store.leavePresence(SID, 5);
    expect(db.docs.has(id)).toBe(false);
  });
});
