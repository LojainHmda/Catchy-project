// Anonymous visitor tracking (browser side). Sends small events to /api/analytics/collect;
// the server does all storage (see server/lib/analytics.js and docs/visitor-analytics.md).
//
// Identity, all in localStorage, no personal data:
//   visitor id  random id per browser (not linked to the account; cleared with site data)
//   session     shared by every tab of the browser; a new one starts after 30 min idle
// Page views count only when the pathname changes in a tab, so React re-renders, StrictMode
// double effects and catalog filter/query changes never add views.
// Live presence: at most one presence update per session every 2 minutes, only while a tab
// is visible and the visitor was active in the last 30 minutes; a "leave" is sent when the
// last open tab of the browser closes or navigates away.

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const PRESENCE_EVERY_MS = 2 * 60 * 1000;
export const TAB_ALIVE_MS = 45 * 1000;
export const STORE_TIME_ZONE = 'Asia/Hebron';

const KEY = {
  visitor: 'catchy.an.vid',
  session: 'catchy.an.session',
  day: 'catchy.an.day',
  presence: 'catchy.an.presenceAt',
  tab: 'catchy.an.tab.',
};

export type CollectBody = {
  v: 1;
  kind: 'pageview' | 'heartbeat' | 'leave';
  sid: string;
  seq: number;
  vid?: string;
  path?: string;
  newSession?: boolean;
  newDay?: boolean;
  presence?: boolean;
  src?: SourceInfo;
};

export type SourceInfo = { ref: string; utm: string; gclid: boolean; fbclid: boolean };

type Session = { id: string; last: number; seq: number };

export type TrackerDeps = {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { keys(): string[] };
  now: () => number;
  send: (body: CollectBody, opts: { beacon: boolean }) => void;
  newId: () => string;
  referrer: () => string;
  search: () => string;
  timeZone?: string;
  tabId?: string;
};

export function dayKey(ms: number, timeZone = STORE_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Storefront paths only; admin and POS screens are not visitor traffic. */
export function isTrackedPath(pathname: string): boolean {
  return !/^\/(admin|pos)(\/|$)/.test(pathname);
}

/** Referrer host + campaign hints only — never the full referring or landing URL. */
export function sourceInfo(referrer: string, search: string): SourceInfo {
  let ref = '';
  if (referrer) {
    try {
      const u = new URL(referrer);
      ref = u.protocol === 'android-app:' ? u.hostname || u.pathname.replace(/^\/\//, '').split('/')[0] : u.hostname;
    } catch {
      ref = '?';
    }
  }
  const params = new URLSearchParams(search);
  return {
    ref: ref.toLowerCase().slice(0, 80),
    utm: (params.get('utm_source') ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40),
    gclid: params.has('gclid'),
    fbclid: params.has('fbclid'),
  };
}

export function createTracker(deps: TrackerDeps) {
  const tz = deps.timeZone ?? STORE_TIME_ZONE;
  const tabId = deps.tabId ?? deps.newId();
  let lastPath: string | null = null;
  let lastInteraction = deps.now();

  const read = (k: string) => {
    try { return deps.storage.getItem(k); } catch { return null; }
  };
  const write = (k: string, v: string) => {
    try { deps.storage.setItem(k, v); } catch { /* storage unavailable */ }
  };
  const visitorId = () => {
    let id = read(KEY.visitor);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = deps.newId();
      write(KEY.visitor, id);
    }
    return id;
  };
  const readSession = (): Session | null => {
    try {
      const s = JSON.parse(read(KEY.session) ?? 'null');
      return s && typeof s.id === 'string' && typeof s.last === 'number' ? { id: s.id, last: s.last, seq: Number(s.seq) || 0 } : null;
    } catch {
      return null;
    }
  };
  const saveSession = (s: Session) => write(KEY.session, JSON.stringify(s));
  const presenceDue = (now: number) => now - Number(read(KEY.presence) ?? 0) >= PRESENCE_EVERY_MS;

  return {
    tabId,

    /** Call on every route change; counts a view only when the pathname changed in this tab. */
    pageView(pathname: string) {
      if (!isTrackedPath(pathname) || pathname === lastPath) return false;
      lastPath = pathname;
      const now = deps.now();
      lastInteraction = now;
      let session = readSession();
      const newSession = !session || now - session.last > SESSION_IDLE_MS;
      if (newSession) session = { id: deps.newId(), last: now, seq: 0 };
      const s = session!;
      s.last = now;
      const today = dayKey(now, tz);
      const newDay = read(KEY.day) !== today;
      if (newDay) write(KEY.day, today);
      const presence = newSession || presenceDue(now);
      if (presence) {
        s.seq += 1;
        write(KEY.presence, String(now));
      }
      saveSession(s);
      deps.send(
        {
          v: 1, kind: 'pageview', sid: s.id, seq: s.seq, vid: visitorId(), path: pathname, newSession, newDay, presence,
          ...(newSession ? { src: sourceInfo(deps.referrer(), deps.search()) } : {}),
        },
        { beacon: false }
      );
      return true;
    },

    /** Any user input in this tab (throttled by the caller). */
    interaction() {
      lastInteraction = deps.now();
    },

    /** Periodic, only while the tab is visible: keeps the session live without a write per tick. */
    heartbeat() {
      const now = deps.now();
      write(KEY.tab + tabId, String(now));
      if (now - lastInteraction > SESSION_IDLE_MS) return false; // idle tab: let the session expire
      const s = readSession();
      if (!s || now - s.last > SESSION_IDLE_MS) return false;
      s.last = now;
      if (!presenceDue(now)) {
        saveSession(s);
        return false;
      }
      s.seq += 1;
      saveSession(s);
      write(KEY.presence, String(now));
      deps.send({ v: 1, kind: 'heartbeat', sid: s.id, seq: s.seq }, { beacon: false });
      return true;
    },

    /** Local-only "this tab is open" ping (no network). */
    tabPing() {
      write(KEY.tab + tabId, String(deps.now()));
    },

    /** pagehide: end live presence unless another tab of this browser is still open. */
    leave() {
      try { deps.storage.removeItem(KEY.tab + tabId); } catch { /* ignore */ }
      const now = deps.now();
      const otherTabOpen = deps.storage.keys().some((k) => {
        if (!k.startsWith(KEY.tab)) return false;
        const t = Number(read(k));
        if (now - t > TAB_ALIVE_MS * 4) {
          try { deps.storage.removeItem(k); } catch { /* ignore */ }
          return false;
        }
        return now - t <= TAB_ALIVE_MS;
      });
      const s = readSession();
      if (otherTabOpen || !s) return false;
      // A refresh re-sends presence at once; the server ignores this leave if that newer
      // presence (higher seq) arrives first.
      try { deps.storage.removeItem(KEY.presence); } catch { /* ignore */ }
      deps.send({ v: 1, kind: 'leave', sid: s.id, seq: s.seq }, { beacon: true });
      return true;
    },
  };
}

export type Tracker = ReturnType<typeof createTracker>;

/** Browsers that ask not to be tracked (Global Privacy Control / Do Not Track) are skipped. */
export function trackingAllowed(nav: Partial<Navigator> & { globalPrivacyControl?: boolean } = navigator): boolean {
  return !(nav.globalPrivacyControl === true || nav.doNotTrack === '1');
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const ENDPOINT = '/api/analytics/collect';

function sendToServer(body: CollectBody, { beacon }: { beacon: boolean }) {
  const json = JSON.stringify(body);
  try {
    if (beacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => undefined);
  } catch {
    /* analytics must never break the page */
  }
}

/** The browser tracker (one per tab). */
export function createBrowserTracker(): Tracker {
  const ls = window.localStorage;
  return createTracker({
    storage: {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => {
        try { return Object.keys(ls); } catch { return []; }
      },
    },
    now: () => Date.now(),
    send: sendToServer,
    newId: randomId,
    referrer: () => document.referrer,
    search: () => window.location.search,
  });
}
