import { describe, it, expect, beforeEach, vi } from 'vitest';

// POST /api/admin/orders/discount runs verifyAdminRequest() (owner check) before
// handleWebOrderDiscountRequest(). Firebase Admin is stubbed like adminAuthorization.test.js:
// verifyIdToken returns whatever decoded token a test sets. A Firestore profile with role
// "admin" must NOT be enough — same owner-only rule as order cancel and returns.
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
import { handleWebOrderDiscountRequest } from './webOrderDiscount.js';
import { createFakeAdminFirestore } from './testing/fakeAdminFirestore.js';

const ORDER = { source: 'web', status: 'pending', items: [{ productId: 'p', price: 100, quantity: 2 }], subtotal: 200, shippingCost: 20, total: 220 };
const body = { orderId: 'o1', expectedSubtotal: 200, discount: { amount: 20, reason: 'Loyal customer' } };
const withToken = (email) => {
  verifyIdToken.mockResolvedValueOnce({ uid: `uid-${email}`, email, aud: 'kartacagenai' });
  return { headers: { authorization: 'Bearer t' } };
};
let db;

beforeEach(() => {
  verifyIdToken.mockReset();
  db = createFakeAdminFirestore({ 'orders/o1': ORDER });
});

describe('web order discount authorization (server-side, not UI)', () => {
  it('no token → 401, order unchanged', async () => {
    const auth = await verifyAdminRequest({ headers: {} });
    expect((await handleWebOrderDiscountRequest(db, auth, body)).status).toBe(401);
    expect(db._get('orders', 'o1')).toEqual(ORDER);
  });

  it('an invalid/expired token → 401', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has expired.'));
    const auth = await verifyAdminRequest({ headers: { authorization: 'Bearer old' } });
    expect((await handleWebOrderDiscountRequest(db, auth, body)).status).toBe(401);
    expect(db._get('orders', 'o1')).toEqual(ORDER);
  });

  it('a customer, a cashier and a staff account with profile role "admin" → 403, order unchanged', async () => {
    for (const email of ['customer@example.test', 'cashier@example.test', 'staff-admin@example.test']) {
      const auth = await verifyAdminRequest(withToken(email));
      expect((await handleWebOrderDiscountRequest(db, auth, body)).status).toBe(403);
      expect((await handleWebOrderDiscountRequest(db, auth, { orderId: 'o1', discount: null })).status).toBe(403);
    }
    expect(db._get('orders', 'o1')).toEqual(ORDER);
  });

  it('the owner accounts → 200 and the discount is saved', async () => {
    for (const email of ['lojain2077@gmail.com', 'marei.eyad@gmail.com', 'admin@gmail.com']) {
      db = createFakeAdminFirestore({ 'orders/o1': ORDER });
      const auth = await verifyAdminRequest(withToken(email));
      const res = await handleWebOrderDiscountRequest(db, auth, body);
      expect(res.status).toBe(200);
      expect(db._get('orders', 'o1')).toMatchObject({ total: 200, webDiscount: { amount: 20, appliedByName: email } });
    }
  });
});
