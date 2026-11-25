import { describe, it, expect, beforeEach, vi } from 'vitest';

// The analytics routes run verifyAdminRequest() (owner check) before handleLive/handleSummary.
// Firebase Admin is stubbed exactly like adminAuthorization.test.js: verifyIdToken returns
// whatever decoded token a test sets. A Firestore profile with role "admin" must NOT be
// enough — analytics follow the same owner-only rule as order cancel and returns.
const verifyIdToken = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: () => false };
});
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn((_opts, name) => ({ name })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  cert: vi.fn(),
  applicationDefault: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({ verifyIdToken })) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'admin' }) }) }) }) })),
}));

import { verifyAdminRequest } from './cloudinaryAdmin.js';
import { handleLive, handleSummary } from './analytics.js';

const store = { countLive: vi.fn(async () => 7), readDaily: vi.fn(async () => []), firstDay: vi.fn(async () => null), productNames: vi.fn(async () => ({})) };
const getStore = vi.fn(async () => store);
const withToken = (email) => {
  verifyIdToken.mockResolvedValueOnce({ uid: 'u1', email, aud: 'kartacagenai' });
  return { headers: { authorization: 'Bearer t' } };
};
const range = { from: '2026-10-01', to: '2026-10-07' };

beforeEach(() => {
  verifyIdToken.mockReset();
  getStore.mockClear();
});

describe('analytics authorization (server-side, not UI)', () => {
  it('no token → 401, nothing read', async () => {
    const auth = await verifyAdminRequest({ headers: {} });
    expect((await handleLive(getStore, auth)).status).toBe(401);
    expect((await handleSummary(getStore, auth, range)).status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });

  it('an invalid/expired token → 401', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has expired.'));
    const auth = await verifyAdminRequest({ headers: { authorization: 'Bearer old' } });
    expect((await handleSummary(getStore, auth, range)).status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });

  it('a customer, a cashier and a staff account with profile role "admin" → 403', async () => {
    for (const email of ['customer@example.test', 'cashier@example.test', 'staff-admin@example.test']) {
      const auth = await verifyAdminRequest(withToken(email));
      expect((await handleLive(getStore, auth)).status).toBe(403);
      const auth2 = await verifyAdminRequest(withToken(email));
      expect((await handleSummary(getStore, auth2, range)).status).toBe(403);
    }
    expect(getStore).not.toHaveBeenCalled();
  });

  it('the store owner accounts are allowed', async () => {
    for (const email of ['lojain2077@gmail.com', 'admin@gmail.com', 'ops-kartacagenai@example.com']) {
      const auth = await verifyAdminRequest(withToken(email));
      expect(await handleLive(getStore, auth)).toMatchObject({ status: 200, body: { ok: true, live: 7 } });
    }
  });
});
