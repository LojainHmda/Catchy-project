import { describe, it, expect, beforeEach } from 'vitest';
import { correctPosSale, cancelPosSale } from './posSaleCorrection.js';

// ---- minimal, faithful in-memory Firestore Admin SDK fake ----
// Only implements what correctPosSale actually uses: collection().doc(id), and
// a runTransaction whose tx.get/set/update operate on a single in-memory store
// (so writes made via tx.set/update are only visible once the callback
// resolves — close enough to real transaction semantics for this suite, which
// never depends on mid-transaction isolation from a second concurrent writer).
function createFakeDb(seed = {}) {
  const store = new Map(); // "collection/id" -> data object
  for (const [path, data] of Object.entries(seed)) store.set(path, structuredClone(data));

  function ref(collectionName, id) {
    return { id, path: `${collectionName}/${id}` };
  }

  function collection(name) {
    return {
      doc: (id) => ref(name, id ?? `auto-${Math.random().toString(36).slice(2)}`),
    };
  }

  async function runTransaction(fn) {
    const pendingWrites = new Map();
    const tx = {
      get: async (r) => {
        const data = pendingWrites.has(r.path) ? pendingWrites.get(r.path) : store.get(r.path);
        return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
      },
      set: (r, data) => pendingWrites.set(r.path, structuredClone(data)),
      update: (r, patch) => {
        const current = pendingWrites.has(r.path) ? pendingWrites.get(r.path) : store.get(r.path);
        pendingWrites.set(r.path, { ...(current ?? {}), ...structuredClone(patch) });
      },
    };
    const result = await fn(tx);
    for (const [path, data] of pendingWrites) store.set(path, data);
    return result;
  }

  return {
    collection,
    runTransaction,
    _get: (collectionName, id) => store.get(`${collectionName}/${id}`),
    _set: (collectionName, id, data) => store.set(`${collectionName}/${id}`, structuredClone(data)),
  };
}

function baseOrder(overrides = {}) {
  return {
    source: 'pos',
    registerSessionId: 'session-1',
    status: 'completed',
    items: [
      { productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, lineTotal: 200, size: 'M', colorId: null, colorName: null },
    ],
    subtotal: 200,
    discount: null,
    total: 200,
    itemCount: 2,
    payment: { method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 },
    ...overrides,
  };
}

function baseProduct(overrides = {}) {
  return { name: 'T-Shirt', price: 100, sizeStock: { S: 5, M: 10, L: 5 }, stock: 20, ...overrides };
}

describe('correctPosSale — permissions', () => {
  it('REGRESSION: rejects a cashier (non-admin) attempting to correct a sale — authorization failure', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'cashier-1',
      actorName: 'Cashier',
      actorRole: 'cashier',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    // Nothing should have been written.
    expect(db._get('orders', 'order-1').total).toBe(200);
  });

  it('allows an admin to correct a sale', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
  });
});

describe('correctPosSale — separating sources (Feature 1 safety)', () => {
  it('refuses to correct an order whose source is not "pos" (e.g. a website order)', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({ source: 'web' }),
      'products/prod-1': baseProduct(),
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_POS_SALE');
  });
});

describe('correctPosSale — correcting a wrong price (never trusts a client-submitted total)', () => {
  it('REGRESSION: recomputes subtotal/total from the corrected line items server-side, not from a client-sent total', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      // Wrong price was 100; correct price is 80. Quantity unchanged.
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      reason: 'Cashier rang up the wrong price',
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.total).toBe(160); // server-computed: 80 * 2, not trusted from the client
    const stored = db._get('orders', 'order-1');
    expect(stored.total).toBe(160);
    expect(stored.subtotal).toBe(160);
    expect(stored.items[0].price).toBe(80);
  });

  it('stock is unchanged when only the price is corrected (quantity unchanged)', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    const product = db._get('products', 'prod-1');
    expect(product.sizeStock.M).toBe(10); // untouched — same quantity as the original sale
  });
});

describe('correctPosSale — stock adjustments', () => {
  it('REGRESSION: increasing quantity consumes additional stock', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 5, size: 'M' }], // was 2, now 5 (+3)
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    const product = db._get('products', 'prod-1');
    expect(product.sizeStock.M).toBe(7); // 10 - 3 additional consumed
  });

  it('REGRESSION: decreasing quantity restores stock', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 1, size: 'M' }], // was 2, now 1 (-1)
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    const product = db._get('products', 'prod-1');
    expect(product.sizeStock.M).toBe(11); // 10 + 1 restored
  });

  it('rejects increasing quantity beyond available stock, and writes nothing', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder(),
      'products/prod-1': baseProduct({ sizeStock: { S: 5, M: 1, L: 5 } }), // only 1 left
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 5, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('OUT_OF_STOCK');
    // Nothing committed — order and product both unchanged.
    expect(db._get('orders', 'order-1').total).toBe(200);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(1);
  });

  it('removing a line item entirely restores its stock', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        items: [
          { productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, lineTotal: 200, size: 'M' },
          { productId: 'prod-2', name: 'Hat', price: 50, quantity: 1, lineTotal: 50, size: null },
        ],
        subtotal: 250,
        total: 250,
        itemCount: 3,
        payment: { method: 'cash', cashAmount: 250, cardAmount: 0, changeGiven: 0 },
      }),
      'products/prod-1': baseProduct(),
      'products/prod-2': { name: 'Hat', stock: 3 },
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, size: 'M' }], // Hat line removed entirely
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    expect(db._get('products', 'prod-2').stock).toBe(4); // 3 + 1 restored
  });

  it('a deleted product with a give-back-only delta does not fail the correction', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        items: [
          { productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, lineTotal: 200, size: 'M' },
          { productId: 'prod-deleted', name: 'Discontinued Item', price: 30, quantity: 1, lineTotal: 30, size: null },
        ],
        subtotal: 230,
        total: 230,
        itemCount: 3,
        payment: { method: 'cash', cashAmount: 230, cardAmount: 0, changeGiven: 0 },
      }),
      'products/prod-1': baseProduct(),
      // prod-deleted intentionally absent — simulates a permanently-deleted product
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, size: 'M' }], // deleted-product line removed
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.total).toBe(200);
  });

  it('rejects increasing quantity on a deleted product (cannot verify/consume stock that does not exist)', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        items: [{ productId: 'prod-deleted', name: 'Discontinued Item', price: 30, quantity: 1, lineTotal: 30, size: null }],
        subtotal: 30,
        total: 30,
        itemCount: 1,
        payment: { method: 'cash', cashAmount: 30, cardAmount: 0, changeGiven: 0 },
      }),
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-deleted', name: 'Discontinued Item', price: 30, quantity: 3 }], // increase on a deleted product
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('PRODUCT_MISSING');
  });
});

describe('correctPosSale — payment / balance reconciliation (never invents a refund or payment)', () => {
  it('REGRESSION: reducing the total below what was paid computes a negative balanceDue (refund owed), without touching order.payment', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 1, size: 'M' }], // total now 100, but 200 was paid
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.balanceDue).toBe(-100); // refund owed
    const stored = db._get('orders', 'order-1');
    expect(stored.payment).toEqual({ method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 }); // untouched — historical truth
  });

  it('REGRESSION: increasing the total above what was paid computes a positive balanceDue (additional payment due)', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 4, size: 'M' }], // total now 400, but 200 was paid
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.balanceDue).toBe(200); // additional payment due
  });

  it('balanceDue is 0 when the corrected total exactly matches what was paid', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, size: 'M' }], // unchanged -> still 200
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.balanceDue).toBe(0);
  });
});

describe('correctPosSale — register sessions are never silently rewritten', () => {
  it('does not write to the register_sessions collection at all, whether open or closed', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder(),
      'products/prod-1': baseProduct(),
      'register_sessions/session-1': { status: 'closed', cashTotal: 200, cardTotal: 0 },
    });

    await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    // Session totals are byte-for-byte unchanged — no silent rewrite of closed-session history.
    expect(db._get('register_sessions', 'session-1')).toEqual({ status: 'closed', cashTotal: 200, cardTotal: 0 });
  });
});

describe('correctPosSale — duplicate submissions / idempotency', () => {
  it('REGRESSION: retrying the exact same correction (same idempotencyKey) is a safe no-op, not double-applied', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const input = {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 5, size: 'M' }], // +3 stock consumption
      discount: null,
      idempotencyKey: 'retry-key',
    };

    const first = await correctPosSale(db, input);
    const second = await correctPosSale(db, input); // simulates a client retry after e.g. a dropped response

    expect(first.ok).toBe(true);
    expect(first.alreadyApplied).toBe(false);
    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);

    // Stock was only consumed ONCE, not twice.
    const product = db._get('products', 'prod-1');
    expect(product.sizeStock.M).toBe(7); // 10 - 3, not 10 - 6

    // Audit trail has exactly one entry, not two.
    expect(db._get('orders', 'order-1').corrections).toHaveLength(1);
  });

  it('a genuinely new correction (different idempotencyKey) after an earlier one is applied normally', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });
    const second = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 1, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-2',
    });

    expect(second.ok).toBe(true);
    expect(second.alreadyApplied).toBe(false);
    expect(db._get('orders', 'order-1').corrections).toHaveLength(2);
  });
});

describe('correctPosSale — audit trail', () => {
  it('REGRESSION: records who corrected it, when, the reason, and before/after snapshots', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    await correctPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Jane Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      reason: 'Price was rung up wrong',
      idempotencyKey: 'key-1',
    });

    const stored = db._get('orders', 'order-1');
    expect(stored.corrections).toHaveLength(1);
    const entry = stored.corrections[0];
    expect(entry.correctedByUid).toBe('admin-1');
    expect(entry.correctedByName).toBe('Jane Admin');
    expect(entry.reason).toBe('Price was rung up wrong');
    expect(entry.before.total).toBe(200);
    expect(entry.after.total).toBe(160);
    expect(stored.correctionCount).toBe(1);
  });
});

describe('correctPosSale — misc validation', () => {
  it('rejects a correction with no items', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });
    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [],
      discount: null,
      idempotencyKey: 'key-1',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('EMPTY_ITEMS');
  });

  it('rejects correcting a non-existent order', async () => {
    const db = createFakeDb({});
    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'does-not-exist',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 1, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ORDER_NOT_FOUND');
  });

  it('REGRESSION: refuses to correct an already-cancelled sale (cancellation is terminal)', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        status: 'cancelled',
        cancellation: { cancelledAt: new Date(), cancelledByUid: 'admin-1', cancelledByName: 'Admin', reason: 'Duplicate sale' },
      }),
      'products/prod-1': baseProduct(),
    });

    const result = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 80, quantity: 2, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('SALE_CANCELLED');
    // Nothing should have changed — no stock write, no new correction entry.
    expect(db._get('orders', 'order-1').total).toBe(200);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(10);
  });
});

describe('cancelPosSale — permissions', () => {
  it('REGRESSION: rejects a cashier (non-admin) attempting to cancel a sale — authorization failure', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await cancelPosSale(db, {
      actorUid: 'cashier-1',
      actorName: 'Cashier',
      actorRole: 'cashier',
      orderId: 'order-1',
      reason: 'Customer changed their mind',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('FORBIDDEN');
    // Nothing should have been written — sale and stock both untouched.
    expect(db._get('orders', 'order-1').status).toBe('completed');
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(10);
  });

  it('allows an admin to cancel a sale', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer changed their mind',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(true);
  });
});

describe('cancelPosSale — separating sources (Feature 1 safety)', () => {
  it('refuses to cancel an order whose source is not "pos" (e.g. a website order)', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder({ source: 'web' }) });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Should not apply to web orders',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_POS_SALE');
  });
});

describe('cancelPosSale — restoring stock', () => {
  it('REGRESSION: cancelling a completed sale restores every line\'s stock in full', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        items: [
          { productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, lineTotal: 200, size: 'M' },
          { productId: 'prod-2', name: 'Hat', price: 50, quantity: 1, lineTotal: 50, size: null },
        ],
        subtotal: 250,
        total: 250,
        itemCount: 3,
        payment: { method: 'cash', cashAmount: 250, cardAmount: 0, changeGiven: 0 },
      }),
      'products/prod-1': baseProduct(), // sizeStock.M = 10
      'products/prod-2': { name: 'Hat', stock: 3 },
    });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer returned everything',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.alreadyCancelled).toBe(false);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(12); // 10 + 2 restored
    expect(db._get('products', 'prod-2').stock).toBe(4); // 3 + 1 restored

    const order = db._get('orders', 'order-1');
    expect(order.status).toBe('cancelled');
    // The historical sale record itself is preserved, not wiped out.
    expect(order.items).toHaveLength(2);
    expect(order.total).toBe(250);
  });

  it('a deleted product line is skipped gracefully (give-back-only) rather than failing the cancellation', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({
        items: [
          { productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 2, lineTotal: 200, size: 'M' },
          { productId: 'prod-deleted', name: 'Discontinued Item', price: 30, quantity: 1, lineTotal: 30, size: null },
        ],
        subtotal: 230,
        total: 230,
        itemCount: 3,
        payment: { method: 'cash', cashAmount: 230, cardAmount: 0, changeGiven: 0 },
      }),
      'products/prod-1': baseProduct(),
      // prod-deleted intentionally absent — simulates a permanently-deleted product
    });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Return',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(true);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(12);
    expect(db._get('orders', 'order-1').status).toBe('cancelled');
  });
});

describe('cancelPosSale — interaction with a prior correction (Feature 4 safety)', () => {
  it("REGRESSION: cancelling after a prior quantity correction restores stock based on the sale's *current* (corrected) items, not the original pre-correction amounts", async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    // First, correct the sale: quantity 2 -> 5 (net +3 consumed; M goes 10 -> 7).
    const correction = await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 5, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });
    expect(correction.ok).toBe(true);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(7);

    // Now cancel the (corrected) sale — must give back 5 (the *current* item
    // quantity), not the original 2. The fixture's seed (M=10) stands in for
    // "stock after the original 2-unit sale already decremented it" (the same
    // convention every other correction test in this file uses — e.g. "stock
    // is unchanged when only the price is corrected" also starts from M=10 for
    // a qty=2 sale) — so the *true* pre-sale baseline is 10 + 2 = 12, and
    // giving back all 5 currently-sold units from the post-correction 7 lands
    // there: 7 + 5 = 12.
    const cancellation = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Entire corrected sale returned',
      idempotencyKey: 'cancel-key-1',
    });

    expect(cancellation.ok).toBe(true);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(12); // 7 + 5 restored = the true pre-sale baseline
    const order = db._get('orders', 'order-1');
    expect(order.status).toBe('cancelled');
    expect(order.correctionCount).toBe(1); // the earlier correction's own audit entry is preserved
    expect(order.corrections).toHaveLength(1);
  });
});

describe('cancelPosSale — duplicate cancellation is prevented', () => {
  it('REGRESSION: cancelling twice (same idempotencyKey) only restores stock once', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const input = {
      actorUid: 'admin-1',
      actorName: 'Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Duplicate sale rung up by mistake',
      idempotencyKey: 'cancel-retry-key',
    };

    const first = await cancelPosSale(db, input);
    const second = await cancelPosSale(db, input); // simulates a client retry after e.g. a dropped response

    expect(first.ok).toBe(true);
    expect(first.alreadyCancelled).toBe(false);
    expect(second.ok).toBe(true);
    expect(second.alreadyCancelled).toBe(true);

    // Stock was only restored ONCE, not twice: the base order's qty=2 gives
    // back 2 (fixture seed M=10 -> 12), never 2*2=4 (which would wrongly land at 14).
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(12);
  });

  it('REGRESSION: cancelling twice with a *different* idempotencyKey is still a safe no-op — status alone gates stock restoration', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const first = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'First attempt',
      idempotencyKey: 'key-a',
    });
    const second = await cancelPosSale(db, {
      actorUid: 'admin-2',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Second, independent attempt — different admin, different key',
      idempotencyKey: 'key-b',
    });

    expect(first.alreadyCancelled).toBe(false);
    expect(second.ok).toBe(true);
    expect(second.alreadyCancelled).toBe(true);
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(12); // still only restored once (10 + 2, not + 4)

    // The audit record reflects the *first* (actually-applied) cancellation, not the second.
    const order = db._get('orders', 'order-1');
    expect(order.cancellation.cancelledByUid).toBe('admin-1');
  });

  it('cancelling an order that was never a POS sale is rejected even if its status happens to already be "cancelled"', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder({ source: 'web', status: 'cancelled' }) });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Should not apply',
      idempotencyKey: 'key-1',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_POS_SALE');
  });
});

describe('cancelPosSale — payment / refund reconciliation (never falsifies payment history)', () => {
  it('REGRESSION: a fully-paid cash sale shows the full amount as a refund due, without touching order.payment', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer return',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.ok).toBe(true);
    expect(result.refundDue).toBe(-200); // the full 200 originally collected is now owed back
    const stored = db._get('orders', 'order-1');
    expect(stored.balanceDue).toBe(-200);
    expect(stored.payment).toEqual({ method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 }); // untouched
  });

  it('a split cash+card payment is refunded in full across both, still without touching order.payment', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({ payment: { method: 'split', cashAmount: 120, cardAmount: 80, changeGiven: 0 } }),
      'products/prod-1': baseProduct(),
    });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer return',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.refundDue).toBe(-200);
    expect(db._get('orders', 'order-1').payment).toEqual({ method: 'split', cashAmount: 120, cardAmount: 80, changeGiven: 0 });
  });

  it('cancelling a sale that still had an outstanding balance from a prior correction refunds only what was actually collected', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    // Correct the sale upward (total now 400, but only 200 was ever collected — balanceDue +200).
    await correctPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      items: [{ productId: 'prod-1', name: 'T-Shirt', price: 100, quantity: 4, size: 'M' }],
      discount: null,
      idempotencyKey: 'key-1',
    });
    expect(db._get('orders', 'order-1').balanceDue).toBe(200);

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer no longer wants any of it',
      idempotencyKey: 'cancel-key-1',
    });

    // Voiding the sale means only the 200 actually collected is owed back — not 400.
    expect(result.refundDue).toBe(-200);
  });
});

describe('cancelPosSale — register sessions are never silently rewritten', () => {
  it('does not write to an OPEN register session', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder(),
      'products/prod-1': baseProduct(),
      'register_sessions/session-1': { status: 'open', cashTotal: 200, cardTotal: 0 },
    });

    await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Return',
      idempotencyKey: 'cancel-key-1',
    });

    expect(db._get('register_sessions', 'session-1')).toEqual({ status: 'open', cashTotal: 200, cardTotal: 0 });
  });

  it('does not write to a CLOSED register session', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder(),
      'products/prod-1': baseProduct(),
      'register_sessions/session-1': { status: 'closed', cashTotal: 200, cardTotal: 0, cashVarianceAtClose: 0 },
    });

    await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Return',
      idempotencyKey: 'cancel-key-1',
    });

    // Session totals are byte-for-byte unchanged — no silent rewrite of closed-session history.
    expect(db._get('register_sessions', 'session-1')).toEqual({
      status: 'closed',
      cashTotal: 200,
      cardTotal: 0,
      cashVarianceAtClose: 0,
    });
  });
});

describe('cancelPosSale — reason and audit trail', () => {
  it('REGRESSION: rejects cancellation with no reason', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const blank = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: '   ',
      idempotencyKey: 'cancel-key-1',
    });
    const missing = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'order-1',
      idempotencyKey: 'cancel-key-2',
    });

    expect(blank.ok).toBe(false);
    expect(blank.code).toBe('REASON_REQUIRED');
    expect(missing.ok).toBe(false);
    expect(missing.code).toBe('REASON_REQUIRED');
    // Nothing committed.
    expect(db._get('orders', 'order-1').status).toBe('completed');
  });

  it('REGRESSION: records who cancelled it, when, and the reason', async () => {
    const db = createFakeDb({ 'orders/order-1': baseOrder(), 'products/prod-1': baseProduct() });

    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorName: 'Jane Admin',
      actorRole: 'admin',
      orderId: 'order-1',
      reason: 'Customer returned the whole purchase',
      idempotencyKey: 'cancel-key-1',
    });

    expect(result.cancelledByUid).toBe('admin-1');
    expect(result.cancelledByName).toBe('Jane Admin');
    expect(result.reason).toBe('Customer returned the whole purchase');
    expect(result.cancelledAt).toBeInstanceOf(Date);

    const stored = db._get('orders', 'order-1');
    expect(stored.cancellation.cancelledByUid).toBe('admin-1');
    expect(stored.cancellation.cancelledByName).toBe('Jane Admin');
    expect(stored.cancellation.reason).toBe('Customer returned the whole purchase');
    expect(stored.cancellation.cancelledAt).toBeInstanceOf(Date);
    // The original sale record (items/total/payment) is preserved, not erased.
    expect(stored.items).toEqual(baseOrder().items);
    expect(stored.total).toBe(200);
    expect(stored.payment).toEqual({ method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 });
  });
});

describe('cancelPosSale — misc validation', () => {
  it('rejects cancelling a non-existent order', async () => {
    const db = createFakeDb({});
    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: 'does-not-exist',
      reason: 'n/a',
      idempotencyKey: 'cancel-key-1',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ORDER_NOT_FOUND');
  });

  it('rejects a cancellation with no order specified', async () => {
    const db = createFakeDb({});
    const result = await cancelPosSale(db, {
      actorUid: 'admin-1',
      actorRole: 'admin',
      orderId: '',
      reason: 'n/a',
      idempotencyKey: 'cancel-key-1',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_ORDER');
  });
});

// ── Shared stock writes for color-variant products (also used by web order cancellation) ──
describe('computeStockWrites — color-variant products are written back safely', () => {
  function containsUndefined(value) {
    if (value === undefined) return true;
    if (Array.isArray(value)) return value.some(containsUndefined);
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).some(containsUndefined);
    return false;
  }

  // Variants WITHOUT nameAr/hex — the parsed form has those keys as undefined, which
  // the real Admin SDK rejects (verified offline). The stored objects must be written back instead.
  const bareVariantProduct = () => ({
    name: 'Dress',
    price: 100,
    colorVariants: [
      { id: 'red', name: 'Red', images: ['a.jpg'], sizeStock: { M: 1 }, order: 1 },
      { id: 'blue', name: 'Blue', images: [], sizeStock: { M: 5 } },
    ],
    sizeStock: { M: 6 },
    stock: 6,
  });
  const redLine = (quantity) => ({ productId: 'prod-v', name: 'Dress (Red / M)', price: 100, quantity, lineTotal: 100 * quantity, size: 'M', colorId: 'red', colorName: 'Red' });

  it('cancelPosSale restores into the color and writes no undefined, keeping every stored field', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({ items: [redLine(2)], subtotal: 200, total: 200, itemCount: 2, payment: { method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 } }),
      'products/prod-v': bareVariantProduct(),
    });
    const result = await cancelPosSale(db, { actorUid: 'admin-1', actorName: 'Admin', actorRole: 'admin', orderId: 'order-1', reason: 'void' });
    expect(result.ok).toBe(true);
    const product = db._get('products', 'prod-v');
    expect(containsUndefined(product)).toBe(false);
    expect(product.colorVariants[0]).toEqual({ id: 'red', name: 'Red', images: ['a.jpg'], sizeStock: { M: 3 }, order: 1 });
    expect(product.colorVariants[1]).toEqual({ id: 'blue', name: 'Blue', images: [], sizeStock: { M: 5 } });
    expect(product).toMatchObject({ sizeStock: { M: 8 }, stock: 8 });
  });

  it('correctPosSale (quantity down) behaves the same way', async () => {
    const db = createFakeDb({
      'orders/order-1': baseOrder({ items: [redLine(2)], subtotal: 200, total: 200, itemCount: 2, payment: { method: 'cash', cashAmount: 200, cardAmount: 0, changeGiven: 0 } }),
      'products/prod-v': bareVariantProduct(),
    });
    const result = await correctPosSale(db, {
      actorUid: 'admin-1', actorName: 'Admin', actorRole: 'admin', orderId: 'order-1',
      items: [{ productId: 'prod-v', name: 'Dress (Red / M)', price: 100, quantity: 1, size: 'M', colorId: 'red', colorName: 'Red' }],
      discount: null, reason: 'one returned',
    });
    expect(result.ok).toBe(true);
    const product = db._get('products', 'prod-v');
    expect(containsUndefined(product)).toBe(false);
    expect(product.colorVariants[0].sizeStock).toEqual({ M: 2 });
    expect(product.colorVariants[0].order).toBe(1);
    expect(product.stock).toBe(7);
  });

  it('only the changed sizeStock differs; every other stored variant field is kept (the old code dropped unknown fields and short image URLs)', async () => {
    const full = { ...bareVariantProduct(), colorVariants: bareVariantProduct().colorVariants.map((v) => ({ ...v, nameAr: 'ع', hex: '#000' })) };
    const db = createFakeDb({
      'orders/order-1': baseOrder({ items: [redLine(1)], subtotal: 100, total: 100, itemCount: 1, payment: { method: 'cash', cashAmount: 100, cardAmount: 0, changeGiven: 0 } }),
      'products/prod-v': full,
    });
    await cancelPosSale(db, { actorUid: 'admin-1', actorName: 'Admin', actorRole: 'admin', orderId: 'order-1', reason: 'void' });
    const product = db._get('products', 'prod-v');
    expect(product.colorVariants[0]).toEqual({ ...full.colorVariants[0], sizeStock: { M: 2 } });
    expect(product.colorVariants[1]).toEqual(full.colorVariants[1]);
  });
});

describe('missing products / colours / sizes are never re-created on a give-back', () => {
  const sizedSale = (quantity) =>
    baseOrder({
      items: [{ productId: 'prod-1', name: 'T-Shirt (M)', price: 100, quantity, lineTotal: 100 * quantity, size: 'M', colorId: null, colorName: null }],
      subtotal: 100 * quantity, total: 100 * quantity, itemCount: quantity,
      payment: { method: 'cash', cashAmount: 100 * quantity, cardAmount: 0, changeGiven: 0 },
    });
  const colourSale = (quantity = 1) =>
    baseOrder({
      items: [{ productId: 'prod-v', name: 'Dress (Blue / S)', price: 120, quantity, lineTotal: 120 * quantity, size: 'S', colorId: 'blue', colorName: 'Blue' }],
      subtotal: 120 * quantity, total: 120 * quantity, itemCount: quantity,
      payment: { method: 'card', cashAmount: 0, cardAmount: 120 * quantity, changeGiven: 0 },
    });
  // The blue colour was removed after the sale.
  const colourProduct = () => ({ name: 'Dress', price: 120, colorVariants: [{ id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#f00', images: [], sizeStock: { S: 3 } }], sizeStock: { S: 3 }, stock: 3 });
  const admin = { actorUid: 'admin-1', actorName: 'Admin', actorRole: 'admin' };

  it('cancelPosSale: a removed size is skipped (size_missing), NOT re-created, and the sale is still cancelled', async () => {
    const product = baseProduct({ sizeStock: { S: 5, L: 5 }, stock: 10 }); // size M was removed
    const db = createFakeDb({ 'orders/order-1': sizedSale(1), 'products/prod-1': product });
    const result = await cancelPosSale(db, { ...admin, orderId: 'order-1', reason: 'void' });
    expect(result).toMatchObject({ ok: true, alreadyCancelled: false });
    expect(result.skippedLines).toEqual([{ productId: 'prod-1', name: 'T-Shirt (M)', colorId: null, size: 'M', quantity: 1, reason: 'size_missing' }]);
    expect(db._get('products', 'prod-1')).toEqual(product); // untouched — no "M" key appears
    const order = db._get('orders', 'order-1');
    expect(order.status).toBe('cancelled');
    expect(order.cancellation.skippedLines).toEqual(result.skippedLines);
  });

  it('cancelPosSale: a removed colour is skipped (variant_missing) — no failure, the other colour is untouched', async () => {
    const db = createFakeDb({ 'orders/order-1': colourSale(), 'products/prod-v': colourProduct() });
    const result = await cancelPosSale(db, { ...admin, orderId: 'order-1', reason: 'void' });
    expect(result.ok).toBe(true);
    expect(result.skippedLines.map((l) => l.reason)).toEqual(['variant_missing']);
    expect(db._get('products', 'prod-v')).toEqual(colourProduct());
  });

  it('cancelPosSale: a deleted product is reported as product_missing (not silently ignored)', async () => {
    const db = createFakeDb({ 'orders/order-1': sizedSale(2) });
    const result = await cancelPosSale(db, { ...admin, orderId: 'order-1', reason: 'void' });
    expect(result.ok).toBe(true);
    expect(result.skippedLines).toEqual([expect.objectContaining({ productId: 'prod-1', quantity: 2, reason: 'product_missing' })]);
    expect(db._get('products', 'prod-1')).toBeUndefined();
  });

  it('correctPosSale: quantity down on a removed size succeeds, re-creates nothing and records the skip', async () => {
    const product = baseProduct({ sizeStock: { S: 5, L: 5 }, stock: 10 });
    const db = createFakeDb({ 'orders/order-1': sizedSale(2), 'products/prod-1': product });
    const result = await correctPosSale(db, {
      ...admin, orderId: 'order-1', discount: null, reason: 'one back',
      items: [{ productId: 'prod-1', name: 'T-Shirt (M)', price: 100, quantity: 1, size: 'M' }],
    });
    expect(result.ok).toBe(true);
    expect(result.skippedLines).toEqual([expect.objectContaining({ size: 'M', quantity: 1, reason: 'size_missing' })]);
    expect(db._get('products', 'prod-1')).toEqual(product);
    expect(db._get('orders', 'order-1').corrections.at(-1).skippedLines).toEqual(result.skippedLines);
  });

  it('correctPosSale: taking more stock from a removed colour is refused — never taken from another colour', async () => {
    const db = createFakeDb({ 'orders/order-1': colourSale(1), 'products/prod-v': colourProduct() });
    const result = await correctPosSale(db, {
      ...admin, orderId: 'order-1', discount: null,
      items: [{ productId: 'prod-v', name: 'Dress (Blue / S)', price: 120, quantity: 2, size: 'S', colorId: 'blue', colorName: 'Blue' }],
    });
    expect(result).toMatchObject({ ok: false, code: 'OUT_OF_STOCK' });
    expect(db._get('products', 'prod-v')).toEqual(colourProduct());
    expect(db._get('orders', 'order-1').items[0].quantity).toBe(1);
  });

  it('correctPosSale: adding a line for a colour product without choosing a colour is refused (no aggregate-only write)', async () => {
    const db = createFakeDb({ 'orders/order-1': sizedSale(1), 'products/prod-1': baseProduct(), 'products/prod-v': colourProduct() });
    const result = await correctPosSale(db, {
      ...admin, orderId: 'order-1', discount: null,
      items: [
        { productId: 'prod-1', name: 'T-Shirt (M)', price: 100, quantity: 1, size: 'M' },
        { productId: 'prod-v', name: 'Dress', price: 120, quantity: 1, size: 'S' },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: 'OUT_OF_STOCK' });
    expect(db._get('products', 'prod-v')).toEqual(colourProduct());
  });

  it('a normal cancellation keeps the existing record shape (no skippedLines field when nothing was skipped)', async () => {
    const db = createFakeDb({ 'orders/order-1': sizedSale(1), 'products/prod-1': baseProduct() });
    const result = await cancelPosSale(db, { ...admin, orderId: 'order-1', reason: 'void' });
    expect(result.skippedLines).toEqual([]);
    expect(db._get('orders', 'order-1').cancellation).not.toHaveProperty('skippedLines');
    expect(db._get('products', 'prod-1').sizeStock.M).toBe(11);
  });
});
