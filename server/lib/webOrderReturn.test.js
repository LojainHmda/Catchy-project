// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createWebReturn, resolveWebReturn, updateWebReturn, returnableOrderLines } from './webOrderReturn.js';
import { cancelWebOrder } from './webOrderCancel.js';
import { orderHasReturns, readReturnSummary, returnLineKey } from './orderReturnState.js';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';

const actor = { actorUid: 'owner-1', actorName: 'owner@example.com' };
let keySeq = 0;
const key = () => `test-key-${(keySeq += 1)}-abcdef`;

const sizedProduct = { name: 'Skirt', sizeStock: { S: 1, M: 3 }, stock: 4 };
const variantProduct = {
  name: 'Dress',
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#f00', images: ['https://img.example.com/red.jpg'], sizeStock: { S: 1, M: 0 } },
    // no nameAr/hex on purpose: written back without undefined fields
    { id: 'blue', name: 'Blue', images: ['https://img.example.com/blue.jpg'], sizeStock: { S: 2, M: 2 } },
  ],
  sizeStock: { S: 3, M: 2 },
  stock: 5,
};
const plainProduct = { name: 'Scarf', stock: 5 };

const skirtM = (quantity = 2) => ({ productId: 'sized', name: 'Skirt (M)', price: 100, quantity, size: 'M' });
const dressRedM = (quantity = 1) => ({ productId: 'variant', name: 'Dress (Red / M)', price: 250, quantity, size: 'M', colorId: 'red', colorName: 'Red' });
const scarf = (quantity = 1) => ({ productId: 'plain', name: 'Scarf', price: 60, quantity });

function webOrder(overrides = {}) {
  return {
    userId: 'customer-1',
    isGuest: false,
    customerName: 'Test Customer',
    customerPhone: '0590000001',
    status: 'delivered',
    items: [skirtM(2)],
    subtotal: 200,
    shippingCost: 20,
    total: 220,
    ...overrides,
  };
}

function seedDb(order = webOrder(), extra = {}) {
  return createFakeAdminFirestore({
    'orders/o1': order,
    'products/sized': sizedProduct,
    'products/variant': variantProduct,
    'products/plain': plainProduct,
    ...extra,
  });
}

const intake = (db, lines, overrides = {}) =>
  createWebReturn(db, { ...actor, orderId: 'o1', lines, reason: 'wrong_size', note: 'Too big', idempotencyKey: key(), ...overrides });

describe('createWebReturn — intake into quarantine', () => {
  it('logs a delivered web order line into quarantine without touching stock or money', async () => {
    const db = seedDb();
    const before = structuredClone(db._get('orders', 'o1'));
    const result = await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }]);
    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(result.returns).toHaveLength(1);
    expect(result.returns[0]).toMatchObject({ status: 'quarantine', disposition: null, quantity: 1, restockApplied: false, productName: 'Skirt (M)' });

    expect(db._get('products', 'sized')).toEqual(sizedProduct); // stock unchanged at intake
    const order = db._get('orders', 'o1');
    expect(order.returnSummary).toMatchObject({ returnCount: 1, openCount: 1, returnedQtyByKey: { [returnLineKey({ productId: 'sized', size: 'M' })]: 1 } });
    // Status, totals and items are untouched: no refund, revenue unchanged.
    for (const field of ['status', 'subtotal', 'shippingCost', 'total', 'items']) expect(order[field]).toEqual(before[field]);
    expect(db._list('stockMovements')).toHaveLength(0);
  });

  it('accepts shipped orders too, one return document per line', async () => {
    const db = seedDb(webOrder({ status: 'shipped', items: [skirtM(2), dressRedM(1)] }));
    const result = await intake(db, [
      { productId: 'sized', size: 'M', quantity: 2 },
      { productId: 'variant', colorId: 'red', size: 'M', quantity: 1 },
    ]);
    expect(result.ok).toBe(true);
    expect(db._list('returns')).toHaveLength(2);
    expect(db._get('orders', 'o1').returnSummary.returnCount).toBe(2);
  });

  it.each([
    ['pending', webOrder({ status: 'pending' })],
    ['processing', webOrder({ status: 'processing' })],
    ['cancelled', webOrder({ status: 'cancelled' })],
    ['a cancellation record', webOrder({ status: 'delivered', cancellation: { cancelledByUid: 'x' } })],
    ['an unknown legacy status', webOrder({ status: 'Refunded' })],
    ['a missing status', webOrder({ status: undefined })],
  ])('refuses an order that is %s', async (_label, order) => {
    const db = seedDb(order);
    const result = await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }]);
    expect(result).toMatchObject({ ok: false, code: 'NOT_RETURNABLE' });
    expect(db._list('returns')).toHaveLength(0);
    expect(db._get('orders', 'o1').returnSummary).toBeUndefined();
  });

  it('accepts a recognised status with stray case/spaces (same normalisation as cancellation)', async () => {
    const db = seedDb(webOrder({ status: ' Delivered ' }));
    expect((await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).ok).toBe(true);
  });

  it('excludes POS sales', async () => {
    const db = seedDb(webOrder({ source: 'pos', status: 'completed' }));
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'IS_POS_SALE' });
  });

  it('excludes coordinate-set lines', async () => {
    const db = seedDb(webOrder({ items: [{ productId: 'coord:look', name: 'Set', price: 170, quantity: 1, size: 'M' }] }));
    expect(await intake(db, [{ productId: 'coord:look', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'COORDINATE_SET_EXCLUDED' });
    expect(returnableOrderLines(db._get('orders', 'o1')).size).toBe(0);
  });

  it('refuses a line that is not on the order (wrong size or colour)', async () => {
    const db = seedDb(webOrder({ items: [dressRedM(1)] }));
    expect(await intake(db, [{ productId: 'variant', colorId: 'blue', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'LINE_NOT_FOUND' });
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'LINE_NOT_FOUND' });
  });

  it.each([
    ['no idempotency key', { idempotencyKey: '' }],
    ['a malformed idempotency key', { idempotencyKey: 'bad key!' }],
    ['an unknown reason', { reason: 'refund_me' }],
  ])('refuses a request with %s', async (_label, overrides) => {
    const db = seedDb();
    const result = await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }], overrides);
    expect(result.ok).toBe(false);
    expect(db._list('returns')).toHaveLength(0);
  });

  it.each([[0], [-1], [1.5], ['2']])('refuses quantity %s', async (quantity) => {
    const db = seedDb();
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity }])).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });
});

describe('createWebReturn — cumulative cap per order line', () => {
  it('caps the total returned across several intakes', async () => {
    const db = seedDb(webOrder({ items: [skirtM(3)] }));
    expect((await intake(db, [{ productId: 'sized', size: 'M', quantity: 2 }])).ok).toBe(true);
    const over = await intake(db, [{ productId: 'sized', size: 'M', quantity: 2 }]);
    expect(over).toMatchObject({ ok: false, code: 'QUANTITY_EXCEEDED', remaining: 1 });
    expect((await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).ok).toBe(true);
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'QUANTITY_EXCEEDED', remaining: 0 });
    expect(db._list('returns').reduce((sum, r) => sum + r.quantity, 0)).toBe(3);
  });

  it('sums duplicate order lines of the same product/colour/size for the cap', async () => {
    const db = seedDb(webOrder({ items: [skirtM(1), skirtM(1)] }));
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 3 }])).toMatchObject({ ok: false, code: 'QUANTITY_EXCEEDED', remaining: 2 });
    expect((await intake(db, [{ productId: 'sized', size: 'M', quantity: 2 }])).ok).toBe(true);
  });

  it('merges duplicated rows in one request so they cannot dodge the cap', async () => {
    const db = seedDb(webOrder({ items: [skirtM(2)] }));
    const result = await intake(db, [
      { productId: 'sized', size: 'M', quantity: 2 },
      { productId: 'sized', size: 'M', quantity: 1 },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'QUANTITY_EXCEEDED' });
    expect(db._list('returns')).toHaveLength(0);
  });

  it('concurrent intakes cannot exceed the ordered quantity (one wins, the other is refused)', async () => {
    const db = seedDb(webOrder({ items: [skirtM(3)] }));
    const [a, b] = await Promise.all([
      intake(db, [{ productId: 'sized', size: 'M', quantity: 2 }]),
      intake(db, [{ productId: 'sized', size: 'M', quantity: 2 }]),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 'QUANTITY_EXCEEDED', remaining: 1 });
    expect(db._list('returns')).toHaveLength(1);
    expect(readReturnSummary(db._get('orders', 'o1')).returnedQtyByKey[returnLineKey({ productId: 'sized', size: 'M' })]).toBe(2);
    expect(db._attempts()).toBeGreaterThan(2); // the loser really retried against fresh data
  });

  it('a tampered negative summary can never raise the cap', async () => {
    const lineKey = returnLineKey({ productId: 'sized', size: 'M' });
    const db = seedDb(webOrder({ items: [skirtM(2)], returnSummary: { returnCount: -5, openCount: -1, returnedQtyByKey: { [lineKey]: -10 } } }));
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 3 }])).toMatchObject({ ok: false, code: 'QUANTITY_EXCEEDED', remaining: 2 });
  });
});

describe('createWebReturn — idempotency', () => {
  it('a retried request (same key) changes nothing the second time', async () => {
    const db = seedDb();
    const sameKey = key();
    const first = await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }], { idempotencyKey: sameKey });
    const second = await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }], { idempotencyKey: sameKey });
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(second.returns.map((r) => r.id)).toEqual(first.returns.map((r) => r.id));
    expect(db._list('returns')).toHaveLength(1);
    expect(db._get('orders', 'o1').returnSummary).toMatchObject({ returnCount: 1, openCount: 1 });
  });

  it('a key reused for a different order is refused', async () => {
    const db = seedDb(webOrder(), { 'orders/o2': webOrder() });
    const sameKey = key();
    expect((await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }], { idempotencyKey: sameKey })).ok).toBe(true);
    const other = await createWebReturn(db, { ...actor, orderId: 'o2', lines: [{ productId: 'sized', size: 'M', quantity: 1 }], reason: 'other', idempotencyKey: sameKey });
    expect(other).toMatchObject({ ok: false, code: 'IDEMPOTENCY_CONFLICT' });
    expect(db._get('orders', 'o2').returnSummary).toBeUndefined();
  });
});

async function oneReturn(db, line = { productId: 'sized', size: 'M', quantity: 1 }) {
  const result = await intake(db, [line]);
  expect(result.ok).toBe(true);
  return result.returns[0].id;
}

const resolve = (db, returnId, disposition, overrides = {}) =>
  resolveWebReturn(db, { ...actor, returnId, disposition, note: '', idempotencyKey: key(), ...overrides });

describe('resolveWebReturn — final disposition', () => {
  it('restocks the exact size only when resolved as sellable, and records the ledger', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    const result = await resolve(db, id, 'restocked');
    expect(result).toMatchObject({ ok: true, replayed: false });
    expect(db._get('products', 'sized')).toMatchObject({ sizeStock: { S: 1, M: 4 }, stock: 5 });
    expect(db._get('returns', id)).toMatchObject({ status: 'resolved', disposition: 'restocked', restockApplied: true, resolvedByUid: 'owner-1' });
    expect(db._get('orders', 'o1').returnSummary).toMatchObject({ returnCount: 1, openCount: 0 });

    const ledger = db._list('stockMovements');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ productId: 'sized', colorId: null, size: 'M', qtyBefore: 3, qtyChange: 1, qtyAfter: 4, reason: 'return_restock', orderId: 'o1', returnId: id, actorUid: 'owner-1' });
  });

  it('restocks into the right colour variant without writing undefined fields', async () => {
    const db = seedDb(webOrder({ items: [dressRedM(1)] }));
    const id = await oneReturn(db, { productId: 'variant', colorId: 'red', size: 'M', quantity: 1 });
    expect((await resolve(db, id, 'restocked')).ok).toBe(true);
    const product = db._get('products', 'variant');
    expect(product.colorVariants.find((v) => v.id === 'red').sizeStock).toEqual({ S: 1, M: 1 });
    expect(product.colorVariants.find((v) => v.id === 'blue').sizeStock).toEqual({ S: 2, M: 2 });
    expect(product).toMatchObject({ sizeStock: { S: 3, M: 3 }, stock: 6 });
    for (const collectionName of ['products', 'returns', 'orders', 'stockMovements']) {
      for (const doc of db._list(collectionName)) expect(containsUndefined(doc)).toBe(false);
    }
  });

  it('restocks a size-less product', async () => {
    const db = seedDb(webOrder({ items: [scarf(2)] }));
    const id = await oneReturn(db, { productId: 'plain', quantity: 2 });
    expect((await resolve(db, id, 'restocked')).ok).toBe(true);
    expect(db._get('products', 'plain').stock).toBe(7);
  });

  it('damaged: final, stock unchanged, no ledger entry', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    expect(await resolve(db, id, 'damaged', { note: 'Torn seam' })).toMatchObject({ ok: true });
    expect(db._get('products', 'sized')).toEqual(sizedProduct);
    expect(db._get('returns', id)).toMatchObject({ status: 'resolved', disposition: 'damaged', restockApplied: false, resolutionNote: 'Torn seam' });
    expect(db._list('stockMovements')).toHaveLength(0);
  });

  it('a resolution is final: a second resolve can never restock again', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    expect((await resolve(db, id, 'restocked')).ok).toBe(true);
    expect(await resolve(db, id, 'restocked')).toMatchObject({ ok: false, code: 'ALREADY_RESOLVED' });
    expect(await resolve(db, id, 'damaged')).toMatchObject({ ok: false, code: 'ALREADY_RESOLVED' });
    expect(db._get('products', 'sized').sizeStock.M).toBe(4);
    expect(db._list('stockMovements')).toHaveLength(1);
  });

  it('a retried resolution (same key) is replayed, not applied twice', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    const sameKey = key();
    expect(await resolve(db, id, 'restocked', { idempotencyKey: sameKey })).toMatchObject({ ok: true, replayed: false });
    expect(await resolve(db, id, 'restocked', { idempotencyKey: sameKey })).toMatchObject({ ok: true, replayed: true });
    expect(db._get('products', 'sized').sizeStock.M).toBe(4);
  });

  it('two concurrent resolutions restock exactly once', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    const [a, b] = await Promise.all([resolve(db, id, 'restocked'), resolve(db, id, 'restocked')]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 'ALREADY_RESOLVED' });
    expect(db._get('products', 'sized').sizeStock.M).toBe(4);
    expect(db._list('stockMovements')).toHaveLength(1);
  });

  it.each([
    ['the product was deleted', (db) => db._set('products', 'sized', undefined), 'product_missing'],
    ['the size was removed', (db) => db._set('products', 'sized', { name: 'Skirt', sizeStock: { S: 1, L: 2 }, stock: 3 }), 'size_missing'],
    ['the product now has colours', (db) => db._set('products', 'sized', variantProduct), 'variant_missing'],
  ])('never re-creates anything when %s: restock refused with the skip reason, nothing written', async (_label, mutate, skipReason) => {
    const db = seedDb();
    const id = await oneReturn(db);
    mutate(db);
    const productBefore = structuredClone(db._get('products', 'sized'));
    const result = await resolve(db, id, 'restocked');
    expect(result).toMatchObject({ ok: false, code: 'RESTOCK_NOT_POSSIBLE', skipReason });
    expect(db._get('products', 'sized')).toEqual(productBefore);
    expect(db._get('returns', id).status).toBe('quarantine');
    expect(db._list('stockMovements')).toHaveLength(0);

    // Safe outcome: manual review (note required) records the reason, stock untouched.
    expect(await resolve(db, id, 'manual_review')).toMatchObject({ ok: false, code: 'NOTE_REQUIRED' });
    expect(await resolve(db, id, 'manual_review', { note: 'Recounted by hand' })).toMatchObject({ ok: true });
    expect(db._get('returns', id)).toMatchObject({ status: 'resolved', disposition: 'manual_review', restockApplied: false, restockSkipReason: skipReason });
    expect(db._get('products', 'sized')).toEqual(productBefore);
  });

  it('refuses to restock a return whose order was later cancelled (legacy data)', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    db._set('orders', 'o1', { ...db._get('orders', 'o1'), status: 'cancelled', cancellation: { cancelledByUid: 'x' } });
    expect(await resolve(db, id, 'restocked')).toMatchObject({ ok: false, code: 'ORDER_CANCELLED' });
    expect(db._get('products', 'sized')).toEqual(sizedProduct);
  });

  it('refuses an unknown disposition or a missing key', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    expect(await resolve(db, id, 'refunded')).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await resolve(db, id, 'restocked', { idempotencyKey: '' })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await resolve(db, 'nope', 'damaged')).toMatchObject({ ok: false, code: 'RETURN_NOT_FOUND' });
  });
});

describe('updateWebReturn — inspection', () => {
  it('moves between quarantine and needs_repair and saves notes, never touching stock', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    expect(await updateWebReturn(db, { ...actor, returnId: id, status: 'needs_repair', inspectionNotes: 'Loose button' })).toMatchObject({ ok: true, changed: true });
    expect(db._get('returns', id)).toMatchObject({ status: 'needs_repair', inspectionNotes: 'Loose button' });
    expect(await updateWebReturn(db, { ...actor, returnId: id, status: 'quarantine' })).toMatchObject({ ok: true, changed: true });
    expect(db._get('returns', id).history.map((h) => h.action)).toEqual(['received', 'inspected', 'inspected']);
    expect(db._get('products', 'sized')).toEqual(sizedProduct);
  });

  it('cannot set a final state or edit a resolved return', async () => {
    const db = seedDb();
    const id = await oneReturn(db);
    expect(await updateWebReturn(db, { ...actor, returnId: id, status: 'resolved' })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    await resolve(db, id, 'damaged');
    expect(await updateWebReturn(db, { ...actor, returnId: id, inspectionNotes: 'late' })).toMatchObject({ ok: false, code: 'ALREADY_RESOLVED' });
  });
});

describe('returns block every double-restock path on the order', () => {
  it('a shipped order with a return can no longer be cancelled (stock untouched)', async () => {
    const db = seedDb(webOrder({ status: 'shipped' }));
    await oneReturn(db);
    expect(orderHasReturns(db._get('orders', 'o1'))).toBe(true);
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x', restock: true, idempotencyKey: key() });
    expect(result).toMatchObject({ ok: false, code: 'HAS_RETURNS' });
    expect(db._get('orders', 'o1').status).toBe('shipped');
    expect(db._get('products', 'sized')).toEqual(sizedProduct);
  });

  it('restocked return + attempted cancel never adds the units back twice', async () => {
    const db = seedDb(webOrder({ status: 'shipped' }));
    const id = await oneReturn(db);
    await resolve(db, id, 'restocked');
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x', restock: true, idempotencyKey: key() });
    expect(db._get('products', 'sized').sizeStock.M).toBe(4); // 3 + 1 return, nothing from the cancel
  });

  it('an order already cancelled cannot take returns', async () => {
    const db = seedDb(webOrder({ status: 'shipped' }));
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x', restock: true, idempotencyKey: key() });
    expect(await intake(db, [{ productId: 'sized', size: 'M', quantity: 1 }])).toMatchObject({ ok: false, code: 'NOT_RETURNABLE' });
  });
});
