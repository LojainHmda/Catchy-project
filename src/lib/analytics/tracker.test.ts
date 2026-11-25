import { describe, it, expect, beforeEach } from 'vitest';
import { createTracker, isTrackedPath, PRESENCE_EVERY_MS, SESSION_IDLE_MS, sourceInfo, trackingAllowed, type CollectBody } from './tracker';

// Shared fake localStorage: several trackers on one storage = several tabs of one browser.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

const T0 = Date.parse('2026-10-28T09:00:00Z'); // 11:00 in Asia/Hebron
let clock = T0;
let storage = memoryStorage();
let sent: { body: CollectBody; beacon: boolean }[] = [];
let ids = 0;

function tab(referrer = '', search = '') {
  return createTracker({
    storage,
    now: () => clock,
    send: (body, { beacon }) => sent.push({ body, beacon }),
    newId: () => `id-${String(++ids).padStart(6, '0')}`,
    referrer: () => referrer,
    search: () => search,
  });
}
const views = () => sent.filter((s) => s.body.kind === 'pageview').map((s) => s.body);

beforeEach(() => {
  clock = T0;
  storage = memoryStorage();
  sent = [];
  ids = 0;
});

describe('page views and deduplication', () => {
  it('first view: new visitor, new session, presence and source', () => {
    tab('https://l.instagram.com/?u=x', '?utm_source=ig').pageView('/');
    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({ kind: 'pageview', path: '/', newSession: true, newDay: true, presence: true, seq: 1, src: { ref: 'l.instagram.com', utm: 'ig' } });
  });

  it('re-renders, StrictMode double effects and filter/query changes add no views', () => {
    const t = tab();
    t.pageView('/catalog');
    t.pageView('/catalog'); // StrictMode re-run / re-render
    t.pageView('/catalog'); // ?cats=Tops → ?cats=Dresses keeps the pathname
    expect(views()).toHaveLength(1);
  });

  it('navigating counts each page change, in the same session and day, without source or presence', () => {
    const t = tab('https://www.google.com/');
    t.pageView('/');
    clock += 10_000;
    t.pageView('/product/p1');
    clock += 10_000;
    t.pageView('/catalog');
    const [a, b, c] = views();
    expect([b.sid, c.sid]).toEqual([a.sid, a.sid]);
    expect([b.vid, c.vid]).toEqual([a.vid, a.vid]);
    expect(b).toMatchObject({ newSession: false, newDay: false, presence: false });
    expect(b.src).toBeUndefined();
  });

  it('a refresh (new tracker, same storage) is a new view in the same session and visitor', () => {
    tab().pageView('/catalog');
    clock += 5_000;
    tab().pageView('/catalog');
    const [a, b] = views();
    expect(b).toMatchObject({ sid: a.sid, vid: a.vid, newSession: false, newDay: false });
  });

  it('two tabs share one session and the visitor counts once per day', () => {
    tab().pageView('/');
    clock += 1_000;
    tab().pageView('/product/p2');
    const [a, b] = views();
    expect(b.sid).toBe(a.sid);
    expect([a.newDay, b.newDay]).toEqual([true, false]);
  });

  it('a new session starts after 30 minutes of inactivity, with its source', () => {
    const t = tab('https://wa.me/');
    t.pageView('/');
    clock += SESSION_IDLE_MS + 1;
    t.pageView('/catalog');
    const [a, b] = views();
    expect(b.sid).not.toBe(a.sid);
    expect(b).toMatchObject({ newSession: true, newDay: false, presence: true });
    expect(b.src).toBeDefined();
  });

  it('the next calendar day (store time zone) counts the visitor again', () => {
    const t = tab();
    t.pageView('/');
    clock = Date.parse('2026-10-28T22:30:00Z'); // past midnight in Asia/Hebron
    t.pageView('/catalog');
    expect(views()[1]).toMatchObject({ newDay: true, newSession: true });
  });

  it('admin and POS screens are never tracked', () => {
    const t = tab();
    t.pageView('/admin/analytics');
    t.pageView('/pos');
    expect(sent).toHaveLength(0);
    expect(isTrackedPath('/administrator')).toBe(true);
  });
});

describe('live presence', () => {
  it('heartbeats write at most once per 2 minutes per session, across tabs', () => {
    const a = tab();
    const b = tab();
    a.pageView('/');
    clock += 60_000;
    expect(b.heartbeat()).toBe(false); // presence was just sent by tab a
    clock += PRESENCE_EVERY_MS;
    expect(a.heartbeat()).toBe(true);
    expect(b.heartbeat()).toBe(false);
    const hb = sent.filter((s) => s.body.kind === 'heartbeat');
    expect(hb).toHaveLength(1);
    expect(hb[0].body.seq).toBe(2);
  });

  it('an idle tab stops heartbeating so the session expires from the live count', () => {
    const t = tab();
    t.pageView('/');
    clock += SESSION_IDLE_MS + PRESENCE_EVERY_MS;
    expect(t.heartbeat()).toBe(false);
  });

  it('user activity keeps a long read alive', () => {
    const t = tab();
    t.pageView('/product/p1');
    for (let i = 0; i < 20; i++) {
      clock += 90_000;
      t.interaction();
      t.heartbeat();
    }
    expect(sent.filter((s) => s.body.kind === 'heartbeat').length).toBeGreaterThan(5);
  });

  it('closing the last tab sends one leave beacon; closing one of two tabs sends none', () => {
    const a = tab();
    const b = tab();
    a.pageView('/');
    b.tabPing();
    a.tabPing();
    expect(a.leave()).toBe(false); // tab b still open
    expect(b.leave()).toBe(true);
    const leaves = sent.filter((s) => s.body.kind === 'leave');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ beacon: true, body: { seq: 1 } });
  });

  it('after a leave, the refreshed page sends presence again with a higher seq (server ignores the late leave)', () => {
    const t = tab();
    t.pageView('/catalog');
    t.leave();
    tab().pageView('/catalog');
    const v = views()[1];
    expect(v).toMatchObject({ presence: true, seq: 2 });
  });

  it('a tab that crashed long ago does not block the leave', () => {
    const t = tab();
    t.pageView('/');
    storage.setItem('catchy.an.tab.ghost', String(clock - 10 * 60_000));
    expect(t.leave()).toBe(true);
  });
});

describe('source info and privacy', () => {
  it('keeps only the referrer host and campaign hints, never paths or queries', () => {
    expect(sourceInfo('https://www.google.com/search?q=private+words', '?utm_source=Google&email=a@b.c&gclid=XYZ')).toEqual({ ref: 'www.google.com', utm: 'google', gclid: true, fbclid: false });
    expect(sourceInfo('', '?fbclid=1')).toEqual({ ref: '', utm: '', gclid: false, fbclid: true });
    expect(sourceInfo('not a url', '')).toMatchObject({ ref: '?' });
    expect(sourceInfo('android-app://com.instagram.android/', '').ref).toBe('com.instagram.android');
    expect(sourceInfo('', '?utm_source=<script>x').utm).toBe('scriptx');
  });

  it('respects Global Privacy Control and Do Not Track', () => {
    expect(trackingAllowed({ doNotTrack: '1' })).toBe(false);
    expect(trackingAllowed({ globalPrivacyControl: true })).toBe(false);
    expect(trackingAllowed({ doNotTrack: 'unspecified' })).toBe(true);
  });

  it('works with blocked storage (no throw, still counts the view)', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {}, keys: () => [] };
    const t = createTracker({ storage: broken, now: () => clock, send: (body, o) => sent.push({ body, beacon: o.beacon }), newId: () => `id-${String(++ids).padStart(6, '0')}`, referrer: () => '', search: () => '' });
    expect(() => t.pageView('/')).not.toThrow();
    expect(views()).toHaveLength(1);
  });
});
