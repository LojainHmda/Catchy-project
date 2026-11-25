import { describe, it, expect, beforeEach, vi } from 'vitest';

// subscribeAnnouncement against a stand-in Firestore listener the test drives by hand.
const fx = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  error: null as null | ((error: unknown) => void),
}));

vi.mock('../firebase', () => ({
  db: {},
  doc: () => ({ path: 'site_settings/site' }),
  setDoc: vi.fn(),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void, error: (e: unknown) => void) => {
    fx.next = next;
    fx.error = error;
    return () => {};
  },
}));

import { ANNOUNCEMENT_DEFAULTS, subscribeAnnouncement } from './announcementBanner';

const missing = (fromCache: boolean) => ({ exists: () => false, data: () => undefined, metadata: { fromCache } });
const saved = (data: Record<string, unknown>, fromCache = false) => ({ exists: () => true, data: () => data, metadata: { fromCache } });

beforeEach(() => {
  fx.next = null;
  fx.error = null;
});

describe('subscribeAnnouncement', () => {
  it('maps the saved settings', () => {
    const cb = vi.fn();
    subscribeAnnouncement(cb);
    fx.next!(saved({ announcementEnabled: false, announcementTextAr: 'نص', announcementTextEn: 'Text' }));
    expect(cb).toHaveBeenCalledWith({ enabled: false, textAr: 'نص', textEn: 'Text' });
  });

  it('admin panel behaviour is unchanged: defaults on error and for an empty document', () => {
    const cb = vi.fn();
    subscribeAnnouncement(cb);
    fx.next!(missing(true));
    fx.error!(new Error('offline'));
    expect(cb.mock.calls).toEqual([[ANNOUNCEMENT_DEFAULTS], [ANNOUNCEMENT_DEFAULTS]]);
  });

  it('storefront (serverConfirmed): an empty answer from the local cache is ignored until the server answers', () => {
    const cb = vi.fn();
    subscribeAnnouncement(cb, { serverConfirmed: true });
    fx.next!(missing(true));
    expect(cb).not.toHaveBeenCalled();
    fx.next!(missing(false)); // the server confirms: never configured → defaults
    expect(cb).toHaveBeenCalledWith(ANNOUNCEMENT_DEFAULTS);
    fx.next!(saved({ announcementEnabled: false }, true)); // a cached COPY of a real document is fine
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('storefront (onError): a failed load goes to the caller instead of delivering the default (on) settings', () => {
    const cb = vi.fn();
    const onError = vi.fn();
    subscribeAnnouncement(cb, { serverConfirmed: true, onError });
    fx.error!(new Error('permission-denied'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();
  });
});
