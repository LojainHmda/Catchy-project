import { describe, it, expect } from 'vitest';
import {
  WEB_CANCELLABLE_STATUSES,
  cancelWebOrder,
  normalizeStoredStatus,
  restoreSkipReason,
  serializeCancellation,
} from './webOrderCancel.js';

// ---- In-memory Admin SDK fake with OPTIMISTIC concurrency control ----
// Every document has a version. A transaction records the version of each doc
// it reads; at commit, if any of them changed (another transaction committed
// in between), the whole callback is retried from scratch — like Firestore's
// retry-on-contention. `tx.get` yields to the event loop so two transactions
// started together genuinely interleave.
//
// What this CAN show: the callback is retry-safe (no state leaks between
// attempts) and two interleaved cancels restore stock exactly once.
// What it CANNOT show: the real Admin SDK's server-side locking, timeouts,
// cross-process contention or network failures. Those are Firestore's
// documented guarantees and are not reproduced here.
function createFakeDb(seed = {}) {
  const store = new Map();
  const versions = new Map();
  let attempts = 0;
  for (const [path, data] of Object.entries(seed)) {
    store.set(path, structuredClone(data));
    versions.set(path, 1);
  }
  const ref = (collectionName, id) => ({ id, path: `${collectionName}/${id}` });

  async function runTransaction(fn, { beforeCommit } = {}) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      attempts += 1;
      const readVersions = new Map();
      const pendingWrites = new Map();
      const tx = {
        get: async (r) => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (!readVersions.has(r.path)) readVersions.set(r.path, versions.get(r.path) ?? 0);
          const data = pendingWrites.has(r.path) ? pendingWrites.get(r.path) : store.get(r.path);
          return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
        },
        update: (r, patch) => {
          const current = pendingWrites.has(r.path) ? pendingWrites.get(r.path) : store.get(r.path);
          pendingWrites.set(r.path, { ...(current ?? {}), ...structuredClone(patch) });
        },
        set: (r, data) => {
          pendingWrites.set(r.path, structuredClone(data));
        },
      };
      const result = await fn(tx);
      if (beforeCommit && attempt === 0) await beforeCommit();
      const conflict = [...readVersions].some(([path, version]) => (versions.get(path) ?? 0) !== version);
      if (conflict) continue; // retry the whole callback against fresh data
      for (const [path, data] of pendingWrites) {
        store.set(path, data);
        versions.set(path, (versions.get(path) ?? 0) + 1);
      }
      return result;
    }
    throw new Error('TRANSACTION_ABORTED');
  }

  let autoId = 0;
  return {
    // doc() without an id generates one, like the Admin SDK.
    collection: (name) => ({ doc: (id) => ref(name, id ?? `auto-${(autoId += 1)}`) }),
    runTransaction,
    _get: (collectionName, id) => store.get(`${collectionName}/${id}`),
    _list: (collectionName) =>
      [...store.entries()].filter(([path]) => path.startsWith(`${collectionName}/`)).map(([, data]) => data),
    _set: (collectionName, id, data) => {
      store.set(`${collectionName}/${id}`, structuredClone(data));
      versions.set(`${collectionName}/${id}`, (versions.get(`${collectionName}/${id}`) ?? 0) + 1);
    },
    _attempts: () => attempts,
  };
}

const actor = { actorUid: 'owner-1', actorName: 'owner@example.com' };

function webOrder(overrides = {}) {
  return {
    userId: 'customer-1',
    isGuest: false,
    status: 'pending',
    items: [{ productId: 'sized', name: 'Skirt (M)', price: 100, quantity: 2, size: 'M' }],
    subtotal: 200,
    shippingCost: 20,
    total: 220,
    ...overrides,
  };
}

const sizedProduct = { name: 'Skirt', sizeStock: { S: 1, M: 3 }, stock: 4 };
const plainProduct = { name: 'Scarf', stock: 5 };
const variantProduct = {
  name: 'Dress',
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#f00', images: ['https://img.example.com/red.jpg'], sizeStock: { S: 1, M: 0 } },
    { id: 'blue', name: 'Blue', nameAr: 'أزرق', hex: '#00f', images: ['https://img.example.com/blue.jpg'], sizeStock: { S: 2, M: 2 } },
  ],
  sizeStock: { S: 3, M: 2 },
  stock: 5,
};
const redM = (quantity = 2) => ({ productId: 'variant', name: 'Dress (Red / M)', price: 150, quantity, size: 'M', colorId: 'red', colorName: 'Red' });

function containsUndefined(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).some(containsUndefined);
  return false;
}

describe('cancelWebOrder — restoring stock exactly', () => {
  it('restores a sized product to the exact size taken at checkout', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': sizedProduct });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'Customer changed mind' });
    expect(result).toMatchObject({ ok: true, alreadyCancelled: false, replayed: false });
    expect(db._get('products', 'sized')).toMatchObject({ sizeStock: { S: 1, M: 5 }, stock: 6 });
    expect(db._get('orders', 'o1').status).toBe('cancelled');
  });

  it('restores into the right color variant and re-aggregates totals', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [redM()] }), 'products/variant': variantProduct });
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    const product = db._get('products', 'variant');
    expect(product.colorVariants.find((v) => v.id === 'red').sizeStock).toEqual({ S: 1, M: 2 });
    expect(product.colorVariants.find((v) => v.id === 'blue').sizeStock).toEqual({ S: 2, M: 2 });
    expect(product).toMatchObject({ sizeStock: { S: 3, M: 4 }, stock: 7 });
  });

  it('restores a size-less product and merges repeated lines', async () => {
    const db = createFakeDb({
      'orders/o1': webOrder({ items: [{ productId: 'plain', name: 'Scarf', price: 30, quantity: 1 }, { productId: 'plain', name: 'Scarf', price: 30, quantity: 2 }] }),
      'products/plain': plainProduct,
    });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(db._get('products', 'plain').stock).toBe(8);
    expect(result.cancellation.restoredLines).toHaveLength(2);
  });

  it('always restocks pending/processing, and asks for shipped orders', async () => {
    const processing = createFakeDb({ 'orders/o1': webOrder({ status: 'processing' }), 'products/sized': sizedProduct });
    expect((await cancelWebOrder(processing, { ...actor, orderId: 'o1', reason: 'x', restock: false })).cancellation.restockApplied).toBe(true);
    expect(processing._get('products', 'sized').sizeStock.M).toBe(5);

    const back = createFakeDb({ 'orders/o1': webOrder({ status: 'shipped' }), 'products/sized': sizedProduct });
    await cancelWebOrder(back, { ...actor, orderId: 'o1', reason: 'Refused', restock: true });
    expect(back._get('products', 'sized').sizeStock.M).toBe(5);

    const lost = createFakeDb({ 'orders/o1': webOrder({ status: 'shipped' }), 'products/sized': sizedProduct });
    const result = await cancelWebOrder(lost, { ...actor, orderId: 'o1', reason: 'Lost', restock: false });
    expect(lost._get('products', 'sized').sizeStock.M).toBe(3);
    expect(result.cancellation).toMatchObject({ restockApplied: false, restoredLines: [] });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ reason: 'not_restocked', quantity: 2 })]);
  });
});

describe('cancelWebOrder — removed or changed variants are skipped, never guessed (V3, V4, R2)', () => {
  it('a deleted color is skipped with variant_missing; other lines are still restored', async () => {
    const withoutRed = { ...variantProduct, colorVariants: [variantProduct.colorVariants[1]] };
    const db = createFakeDb({
      'orders/o1': webOrder({ items: [redM(), { productId: 'sized', name: 'Skirt (M)', price: 100, quantity: 1, size: 'M' }] }),
      'products/variant': withoutRed,
      'products/sized': sizedProduct,
    });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.ok).toBe(true);
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ productId: 'variant', colorId: 'red', reason: 'variant_missing' })]);
    expect(result.cancellation.restoredLines).toEqual([expect.objectContaining({ productId: 'sized' })]);
    expect(db._get('products', 'variant')).toEqual(withoutRed); // untouched
    expect(db._get('products', 'sized').sizeStock.M).toBe(4);
  });

  it('a size removed from a color is skipped with size_missing and is NOT re-created', async () => {
    const noM = { ...variantProduct, colorVariants: [{ ...variantProduct.colorVariants[0], sizeStock: { S: 1 } }, variantProduct.colorVariants[1]] };
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [redM()] }), 'products/variant': noM });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ reason: 'size_missing' })]);
    expect(db._get('products', 'variant').colorVariants[0].sizeStock).toEqual({ S: 1 });
  });

  it('a size removed from a sized product is skipped and not re-created', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [{ productId: 'sized', name: 'Skirt (XL)', price: 100, quantity: 1, size: 'XL' }] }), 'products/sized': sizedProduct });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ size: 'XL', reason: 'size_missing' })]);
    expect(db._get('products', 'sized')).toEqual(sizedProduct);
  });

  it('R2: a line without a color on a product that now has colors is skipped (no aggregate-only write)', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [{ productId: 'variant', name: 'Dress (M)', price: 150, quantity: 1, size: 'M' }] }), 'products/variant': variantProduct });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ reason: 'variant_missing' })]);
    expect(db._get('products', 'variant')).toEqual(variantProduct);
  });

  it('a line with a color on a product that no longer has colors is skipped', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [redM()] }), 'products/variant': { name: 'Dress', sizeStock: { M: 4 }, stock: 4 } });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ reason: 'variant_missing' })]);
    expect(db._get('products', 'variant').sizeStock).toEqual({ M: 4 });
  });

  it('a sized line on a product that no longer has sizes is skipped', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': { name: 'Skirt', stock: 9 } });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines).toEqual([expect.objectContaining({ reason: 'size_missing' })]);
    expect(db._get('products', 'sized').stock).toBe(9);
  });

  it('coordinate sets and deleted products are skipped with their own reasons', async () => {
    const db = createFakeDb({
      'orders/o1': webOrder({
        items: [
          { productId: 'coord:look-1', name: 'Set', price: 250, quantity: 1, size: 'S / M', itemSizes: { a: 'S' } },
          { productId: 'gone', name: 'Old top', price: 50, quantity: 2, size: 'L' },
        ],
      }),
    });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.skippedLines.map((l) => l.reason).sort()).toEqual(['coordinate_set', 'product_missing']);
  });

  it('audit is accurate when nothing could be restored: restockApplied with zero restored lines, no product writes', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [{ productId: 'gone', name: 'Old', price: 1, quantity: 1 }] }) });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation).toMatchObject({ restockApplied: true, restoredLines: [] });
    expect(result.cancellation.skippedLines).toHaveLength(1);
    expect(db._get('products', 'gone')).toBeUndefined();
  });

  it('restoreSkipReason is consistent with the shared inventory parser', () => {
    expect(restoreSkipReason({ productId: 'v', colorId: 'red', size: 'M' }, variantProduct)).toBeNull();
    expect(restoreSkipReason({ productId: 'v', colorId: 'red', size: null }, variantProduct)).toBe('size_missing');
    expect(restoreSkipReason({ productId: 'p' }, plainProduct)).toBeNull();
    expect(restoreSkipReason({ productId: 'x' }, null)).toBe('product_missing');
    // A variant without a name is ignored by the parser, so it is not a valid target.
    expect(restoreSkipReason({ productId: 'v', colorId: 'n', size: 'M' }, { colorVariants: [{ id: 'n', sizeStock: { M: 1 } }] })).toBe('variant_missing');
  });
});

describe('cancelWebOrder — undefined variant fields are never written (V2)', () => {
  it('restores a variant product whose variants lack nameAr/hex, preserving every stored field', async () => {
    const bare = {
      name: 'Top',
      colorVariants: [
        { id: 'red', name: 'Red', images: ['a.jpg'], sizeStock: { M: 1 }, order: 2 },
        { id: 'blue', name: 'Blue', images: [], sizeStock: { M: 3 } },
      ],
      sizeStock: { M: 4 },
      stock: 4,
    };
    const db = createFakeDb({ 'orders/o1': webOrder({ items: [{ productId: 'top', name: 'Top', price: 1, quantity: 2, size: 'M', colorId: 'red' }] }), 'products/top': bare });
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    const product = db._get('products', 'top');
    expect(containsUndefined(product)).toBe(false);
    expect(product.colorVariants[0]).toEqual({ id: 'red', name: 'Red', images: ['a.jpg'], sizeStock: { M: 3 }, order: 2 });
    expect(product.colorVariants[1]).toEqual(bare.colorVariants[1]);
    expect(product).toMatchObject({ sizeStock: { M: 6 }, stock: 6 });
  });
});

describe('cancelWebOrder — never restores stock twice (V1)', () => {
  it('two simultaneous cancels: exactly one restores, the other is a no-op (with retry on conflict)', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': sizedProduct });
    const [a, b] = await Promise.all([
      cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'first', idempotencyKey: 'ka' }),
      cancelWebOrder(db, { actorUid: 'owner-2', actorName: 'other@example.com', orderId: 'o1', reason: 'second', idempotencyKey: 'kb' }),
    ]);
    expect([a.alreadyCancelled, b.alreadyCancelled].sort()).toEqual([false, true]);
    expect(db._get('products', 'sized').sizeStock.M).toBe(5); // +2 once, not +4
    expect(db._attempts()).toBeGreaterThan(2); // the loser really was retried
  });

  it('a retried attempt rebuilds its audit from scratch (no duplicated lines)', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': sizedProduct });
    // Another writer changes the product between the first attempt's read and its commit → conflict → retry.
    const contended = {
      ...db,
      runTransaction: (fn) =>
        db.runTransaction(fn, {
          beforeCommit: async () => db._set('products', 'sized', { ...sizedProduct, sizeStock: { S: 1, M: 10 }, stock: 11 }),
        }),
    };
    const result = await cancelWebOrder(contended, { ...actor, orderId: 'o1', reason: 'x' });
    expect(db._attempts()).toBe(2);
    expect(result.cancellation.restoredLines).toHaveLength(1);
    expect(db._get('products', 'sized').sizeStock.M).toBe(12); // restored onto the fresh value, once
  });

  it('a retry with the same key is reported as this attempt succeeding (replayed), not "already cancelled"', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': sizedProduct });
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x', idempotencyKey: 'k1' });
    const replay = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x', idempotencyKey: 'k1' });
    expect(replay).toMatchObject({ ok: true, replayed: true, alreadyCancelled: false });
    const other = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'y', idempotencyKey: 'k2' });
    expect(other).toMatchObject({ ok: true, replayed: false, alreadyCancelled: true });
    expect(db._get('products', 'sized').sizeStock.M).toBe(5);
  });

  it('an order whose status was changed after cancellation is refused (PREVIOUSLY_CANCELLED) and nothing is written', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'products/sized': sizedProduct });
    await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'first' });
    // An older screen (before status changes were transactional) sets it back to shipped.
    db._set('orders', 'o1', { ...db._get('orders', 'o1'), status: 'shipped' });
    const before = structuredClone(db._get('orders', 'o1'));

    const again = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'second', restock: true });
    expect(again).toMatchObject({ ok: false, code: 'PREVIOUSLY_CANCELLED' });
    expect(db._get('products', 'sized').sizeStock.M).toBe(5); // restored once only
    expect(db._get('orders', 'o1')).toEqual(before);
  });

  it('an order cancelled the old status-only way is a no-op and never restocked', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ status: 'cancelled' }), 'products/sized': sizedProduct });
    expect(await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' })).toMatchObject({ ok: true, alreadyCancelled: true });
    expect(db._get('products', 'sized').sizeStock.M).toBe(3);
  });
});

describe('cancelWebOrder — audit trail and response format (V5)', () => {
  it('records who/when/why/previous status; returns ISO timestamps on every path', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder({ status: 'processing' }), 'products/sized': sizedProduct });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: '  Customer asked  ', idempotencyKey: 'abc' });
    const stored = db._get('orders', 'o1');
    expect(stored.cancellation).toMatchObject({
      cancelledByUid: 'owner-1', cancelledByName: 'owner@example.com', reason: 'Customer asked',
      previousStatus: 'processing', restockApplied: true, idempotencyKey: 'abc',
    });
    expect(stored.cancellation.cancelledAt).toBeInstanceOf(Date); // stored as a timestamp
    expect(stored).toMatchObject({ statusUpdatedByUid: 'owner-1', total: 220 });
    expect(typeof result.cancellation.cancelledAt).toBe('string');
    expect(new Date(result.cancellation.cancelledAt).toISOString()).toBe(result.cancellation.cancelledAt);

    const again = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(typeof again.cancellation.cancelledAt).toBe('string');
  });

  it('serializeCancellation converts Firestore Timestamps too', () => {
    const ts = { toDate: () => new Date('2026-10-24T10:00:00.000Z') };
    expect(serializeCancellation({ cancelledAt: ts, reason: 'x' })).toEqual({ cancelledAt: '2026-10-24T10:00:00.000Z', reason: 'x' });
    expect(serializeCancellation(null)).toBeNull();
  });
});

describe('cancelWebOrder — statuses and refusals (V9)', () => {
  it('normalises case/whitespace the same way as the client', async () => {
    expect(normalizeStoredStatus(' Processing ')).toBe('processing');
    expect(normalizeStoredStatus(undefined)).toBe('pending');
    const db = createFakeDb({ 'orders/o1': webOrder({ status: ' Processing ' }), 'products/sized': sizedProduct });
    const result = await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' });
    expect(result.cancellation.previousStatus).toBe('processing');
  });

  it.each(['delivered', 'completed', 'refunded', 'Weird'])('refuses status %s without writing', async (status) => {
    const db = createFakeDb({ 'orders/o1': webOrder({ status }), 'products/sized': sizedProduct });
    expect(await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: 'x' })).toMatchObject({ ok: false, code: 'NOT_CANCELLABLE' });
    expect(db._get('orders', 'o1').status).toBe(status);
    expect(db._get('products', 'sized').sizeStock.M).toBe(3);
  });

  it('only pending, processing and shipped are cancellable', () => {
    expect(WEB_CANCELLABLE_STATUSES).toEqual(['pending', 'processing', 'shipped']);
  });

  it('refuses POS sales and invalid input', async () => {
    const db = createFakeDb({ 'orders/o1': webOrder(), 'orders/pos': webOrder({ source: 'pos', status: 'completed' }), 'products/sized': sizedProduct });
    expect(await cancelWebOrder(db, { ...actor, orderId: 'pos', reason: 'x' })).toMatchObject({ code: 'IS_POS_SALE' });
    expect(await cancelWebOrder(db, { ...actor, orderId: 'o1', reason: ' ' })).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(await cancelWebOrder(db, { ...actor, orderId: '', reason: 'x' })).toMatchObject({ code: 'MISSING_ORDER' });
    expect(await cancelWebOrder(db, { actorUid: '', orderId: 'o1', reason: 'x' })).toMatchObject({ code: 'FORBIDDEN' });
    expect(await cancelWebOrder(db, { ...actor, orderId: 'nope', reason: 'x' })).toMatchObject({ code: 'ORDER_NOT_FOUND' });
    expect(db._get('orders', 'o1').status).toBe('pending');
  });
});
