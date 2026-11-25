import { describe, it, expect } from 'vitest';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';
import {
  handleWebOrderDiscountRequest,
  setWebOrderDiscount,
  storedOrderSubtotal,
  validateWebDiscountRequest,
  webDiscountAmount,
} from './webOrderDiscount.js';
// The client mirror of the same rule (used for previews and for item edits).
import * as client from '../../src/lib/orders/webOrderDiscount.ts';

const NOW = new Date('2026-10-31T10:00:00Z');
const owner = { uid: 'owner-1', email: 'lojain2077@gmail.com' };

// 200 ILS of items (2 × 100) + 20 ILS shipping = 220 ILS.
function webOrder(overrides = {}) {
  return {
    source: 'web',
    status: 'pending',
    items: [{ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 2, size: 'M' }],
    subtotal: 200,
    shippingCost: 20,
    total: 220,
    itemCount: 2,
    ...overrides,
  };
}

function seed(order = webOrder()) {
  return createFakeAdminFirestore({
    'orders/o1': order,
    'products/skirt': { name: 'Skirt', sizeStock: { M: 5 }, stock: 5 },
  });
}

const apply = (db, discount, extra = {}) =>
  setWebOrderDiscount(db, { actorUid: owner.uid, actorName: owner.email, orderId: 'o1', discount, now: NOW, ...extra });

describe('fixed-amount rule', () => {
  it('rounded to 0.01, never negative, never above the items subtotal', () => {
    expect(webDiscountAmount(20, 200)).toBe(20);
    expect(webDiscountAmount(19.999, 200)).toBe(20);
    expect(webDiscountAmount(250, 200)).toBe(200);
    expect(webDiscountAmount(20, 0)).toBe(0);
    expect(webDiscountAmount(-5, 200)).toBe(0);
    expect(webDiscountAmount(undefined, 200)).toBe(0);
  });

  it('server and client compute exactly the same amounts', () => {
    for (const subtotal of [0, 0.01, 19.99, 99.9, 100, 200, 333.33, 1234.56]) {
      for (const amount of [0.01, 5, 20, 99.99, 200, 5000]) {
        expect(client.webDiscountAmount(amount, subtotal)).toBe(webDiscountAmount(amount, subtotal));
      }
    }
  });

  it('legacy orders without a stored subtotal use the items sum (same as the client)', () => {
    expect(storedOrderSubtotal({ items: [{ price: 50, quantity: 3 }] })).toBe(150);
    expect(storedOrderSubtotal({ subtotal: 120, items: [{ price: 50, quantity: 3 }] })).toBe(120);
  });
});

describe('request validation', () => {
  const ok = { orderId: 'o1', discount: { amount: 20, reason: 'Loyal customer' } };
  it('accepts a fixed amount with a reason, and null (= remove)', () => {
    expect(validateWebDiscountRequest(ok)).toEqual({ ok: true, orderId: 'o1', expectedSubtotal: null, discount: { amount: 20, reason: 'Loyal customer' } });
    expect(validateWebDiscountRequest({ ...ok, discount: { amount: 12.5, reason: ' x ' } })).toMatchObject({ ok: true, discount: { amount: 12.5, reason: 'x' } });
    expect(validateWebDiscountRequest({ orderId: 'o1', discount: null })).toMatchObject({ ok: true, discount: null });
  });

  it.each([
    [{ ...ok, orderId: '' }, 'INVALID'],
    [{ ...ok, orderId: 'a/b' }, 'INVALID'],
    [{ orderId: 'o1' }, 'INVALID'],
    // Percentage discounts are not supported in any form.
    [{ ...ok, discount: { mode: 'percent', value: 10, reason: 'x' } }, 'INVALID'],
    [{ ...ok, discount: { mode: 'amount', amount: 20, reason: 'x' } }, 'INVALID'],
    [{ ...ok, discount: { amount: 20, percent: 10, reason: 'x' } }, 'INVALID'],
    [{ ...ok, discount: { amount: '20', reason: 'x' } }, 'INVALID_VALUE'],
    [{ ...ok, discount: { amount: 0, reason: 'x' } }, 'INVALID_VALUE'],
    [{ ...ok, discount: { amount: -5, reason: 'x' } }, 'INVALID_VALUE'],
    [{ ...ok, discount: { amount: 10.005, reason: 'x' } }, 'INVALID_VALUE'],
    [{ ...ok, discount: { amount: Number.NaN, reason: 'x' } }, 'INVALID_VALUE'],
    [{ ...ok, discount: { amount: 20, reason: '   ' } }, 'REASON_REQUIRED'],
    [{ ...ok, discount: { amount: 20 } }, 'REASON_REQUIRED'],
    [{ ...ok, discount: { amount: 20, reason: 'x'.repeat(201) } }, 'INVALID'],
    [{ ...ok, expectedSubtotal: -1 }, 'INVALID'],
  ])('refuses %j → %s', (body, code) => {
    expect(validateWebDiscountRequest(body)).toMatchObject({ ok: false, code });
  });
});

describe('setWebOrderDiscount — one transaction against the stored order', () => {
  it('20 ILS on a 200 ILS order: total 220 → 200; items, prices, quantities and stock untouched', async () => {
    const db = seed();
    const result = await apply(db, { amount: 20, reason: 'Loyal customer' });
    expect(result).toMatchObject({ ok: true, subtotal: 200, shippingCost: 20, total: 200 });
    const order = db._get('orders', 'o1');
    expect(order.total).toBe(200);
    expect(order.subtotal).toBe(200);
    expect(order.items).toEqual(webOrder().items);
    expect(order.webDiscount).toEqual({ amount: 20, reason: 'Loyal customer', appliedAt: NOW, appliedByUid: 'owner-1', appliedByName: 'lojain2077@gmail.com' });
    expect(order.discount).toBeUndefined(); // the POS field is never used for web orders
    expect(db._get('products', 'skirt')).toEqual({ name: 'Skirt', sizeStock: { M: 5 }, stock: 5 });
    expect(containsUndefined(order)).toBe(false);
  });

  it('applying the same discount again never discounts twice (recomputed from the subtotal, not the total)', async () => {
    const db = seed();
    await apply(db, { amount: 20, reason: 'Loyal customer' });
    await apply(db, { amount: 20, reason: 'Loyal customer' });
    expect(db._get('orders', 'o1')).toMatchObject({ total: 200, webDiscount: { amount: 20 } });
  });

  it('changing the amount replaces it; removing it restores subtotal + shipping', async () => {
    const db = seed();
    await apply(db, { amount: 20, reason: 'A' });
    await apply(db, { amount: 35.5, reason: 'B' });
    expect(db._get('orders', 'o1')).toMatchObject({ total: 184.5, webDiscount: { amount: 35.5, reason: 'B' } });
    const removed = await apply(db, null);
    expect(removed).toMatchObject({ ok: true, unchanged: false, total: 220, webDiscount: null });
    expect(db._get('orders', 'o1')).toMatchObject({ total: 220, webDiscount: null });
  });

  it('re-saving an order whose record came from the removed percentage option stores the fixed shape', async () => {
    const db = seed(webOrder({ total: 190, webDiscount: { mode: 'percent', value: 15, amount: 30, reason: 'Old test' } }));
    await apply(db, { amount: 30, reason: 'Old test' });
    const stored = db._get('orders', 'o1').webDiscount;
    expect(stored).toEqual({ amount: 30, reason: 'Old test', appliedAt: NOW, appliedByUid: 'owner-1', appliedByName: 'lojain2077@gmail.com' });
    expect(db._get('orders', 'o1').total).toBe(190);
  });

  it('removing when there is no discount is a no-op (nothing written)', async () => {
    const db = seed();
    expect(await apply(db, null)).toMatchObject({ ok: true, unchanged: true, total: 220 });
    expect(db._get('orders', 'o1')).toEqual(webOrder());
  });

  it('more than the items subtotal is refused (shipping is never discounted); exactly the subtotal is allowed', async () => {
    const db = seed();
    expect(await apply(db, { amount: 200.01, reason: 'x' })).toMatchObject({ ok: false, code: 'EXCEEDS_SUBTOTAL' });
    expect(db._get('orders', 'o1').total).toBe(220);
    expect(await apply(db, { amount: 200, reason: 'x' })).toMatchObject({ ok: true, total: 20 });
  });

  it('POS sales are refused and their own discount is left exactly as it was', async () => {
    const pos = webOrder({ source: 'pos', status: 'completed', discount: { mode: 'percent', value: 5, amount: 10 }, total: 190 });
    const db = seed(pos);
    expect(await apply(db, { amount: 20, reason: 'x' })).toMatchObject({ ok: false, code: 'NOT_WEB_ORDER' });
    expect(db._get('orders', 'o1')).toEqual(pos);
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['delivered', { status: 'delivered' }],
    ['a cancellation record', { status: 'pending', cancellation: { cancelledByUid: 'x' } }],
  ])('refuses an order that is no longer editable (%s)', async (_label, overrides) => {
    const db = seed(webOrder(overrides));
    expect(await apply(db, { amount: 20, reason: 'x' })).toMatchObject({ ok: false, code: 'NOT_EDITABLE' });
    expect(db._get('orders', 'o1').webDiscount).toBeUndefined();
  });

  it('accepts processing and shipped orders (status is normalised like the client)', async () => {
    for (const status of ['processing', ' Shipped ']) {
      const db = seed(webOrder({ status }));
      expect(await apply(db, { amount: 5, reason: 'x' })).toMatchObject({ ok: true, total: 215 });
    }
  });

  it('refuses when the items changed since the admin loaded the order (expectedSubtotal)', async () => {
    const db = seed();
    expect(await apply(db, { amount: 20, reason: 'x' }, { expectedSubtotal: 300 })).toMatchObject({ ok: false, code: 'ORDER_CHANGED' });
    expect(db._get('orders', 'o1').total).toBe(220);
    expect(await apply(db, { amount: 20, reason: 'x' }, { expectedSubtotal: 200 })).toMatchObject({ ok: true });
  });

  it('refuses a missing order, and an order without a stored shipping cost', async () => {
    expect(await setWebOrderDiscount(seed(), { actorUid: 'u', orderId: 'nope', discount: null, now: NOW })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const db = seed(webOrder({ shippingCost: undefined }));
    expect(await apply(db, { amount: 20, reason: 'x' })).toMatchObject({ ok: false, code: 'MISSING_TOTALS' });
  });

  it('two concurrent requests both recompute from the stored subtotal (last one wins, never stacked)', async () => {
    const db = seed();
    await Promise.all([apply(db, { amount: 20, reason: 'A' }), apply(db, { amount: 30, reason: 'B' })]);
    const order = db._get('orders', 'o1');
    expect([200, 190]).toContain(order.total);
    expect(order.total).toBe(220 - order.webDiscount.amount);
  });
});

describe('HTTP handler', () => {
  const body = { orderId: 'o1', expectedSubtotal: 200, discount: { amount: 20, reason: 'Loyal customer' } };

  it('passes the auth result through (401 / 403) without touching the order', async () => {
    const db = seed();
    expect((await handleWebOrderDiscountRequest(db, { ok: false, status: 401, message: 'Missing token' }, body)).status).toBe(401);
    expect((await handleWebOrderDiscountRequest(db, { ok: false, status: 403, message: 'Not an admin' }, body)).status).toBe(403);
    expect(db._get('orders', 'o1')).toEqual(webOrder());
  });

  it('200 with the stored discount (ISO date); 400 / 404 / 409 for refusals', async () => {
    const db = seed();
    const auth = { ok: true, ...owner };
    const res = await handleWebOrderDiscountRequest(db, auth, body, { now: NOW });
    expect(res).toMatchObject({ status: 200, body: { ok: true, total: 200, webDiscount: { amount: 20, appliedAt: NOW.toISOString() } } });
    expect((await handleWebOrderDiscountRequest(db, auth, { ...body, discount: { mode: 'percent', value: 10, reason: 'x' } })).status).toBe(400);
    expect((await handleWebOrderDiscountRequest(db, auth, { ...body, orderId: 'missing' })).status).toBe(404);
    expect((await handleWebOrderDiscountRequest(db, auth, { ...body, expectedSubtotal: 150 })).status).toBe(409);
    expect(db._get('orders', 'o1')).toMatchObject({ total: 200, webDiscount: { amount: 20 } });
  });
});
