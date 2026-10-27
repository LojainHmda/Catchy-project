// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { stockMovementEntries } from './stockLedger.js';
import { cancelWebOrder } from './webOrderCancel.js';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';

const ctx = { reason: 'return_restock', actorUid: 'owner-1', actorName: 'owner@example.com', at: new Date('2026-10-25T10:00:00Z'), orderId: 'o1', returnId: 'r1' };

describe('stockMovementEntries', () => {
  it('records only the cells that changed, with before/change/after', () => {
    const before = { name: 'Skirt', sizeStock: { S: 1, M: 3 }, stock: 4 };
    const entries = stockMovementEntries('p1', before, { sizeStock: { S: 1, M: 5 }, stock: 6 }, ctx);
    expect(entries).toEqual([
      expect.objectContaining({ productId: 'p1', productName: 'Skirt', colorId: null, size: 'M', qtyBefore: 3, qtyChange: 2, qtyAfter: 5, reason: 'return_restock', orderId: 'o1', returnId: 'r1' }),
    ]);
    expect(containsUndefined(entries)).toBe(false);
  });

  it('keys colour variants by colour + size', () => {
    const before = { name: 'Dress', colorVariants: [{ id: 'red', name: 'Red', sizeStock: { M: 0 } }, { id: 'blue', name: 'Blue', sizeStock: { M: 2 } }] };
    const payload = { colorVariants: [{ id: 'red', name: 'Red', sizeStock: { M: 1 } }, { id: 'blue', name: 'Blue', sizeStock: { M: 2 } }] };
    expect(stockMovementEntries('p2', before, payload, ctx)).toEqual([
      expect.objectContaining({ colorId: 'red', size: 'M', qtyBefore: 0, qtyChange: 1, qtyAfter: 1 }),
    ]);
  });

  it('handles plain-stock products and produces nothing when nothing changed', () => {
    expect(stockMovementEntries('p3', { stock: 2 }, { stock: 4 }, ctx)).toEqual([expect.objectContaining({ colorId: null, size: null, qtyChange: 2 })]);
    expect(stockMovementEntries('p3', { stock: 2 }, { stock: 2 }, ctx)).toEqual([]);
  });

  it('refuses an unknown reason (the ledger vocabulary is closed)', () => {
    expect(() => stockMovementEntries('p1', { stock: 1 }, { stock: 2 }, { ...ctx, reason: 'whatever' })).toThrow();
  });
});

describe('web order cancellation writes the ledger in the same transaction', () => {
  it('one entry per restored cell, none when nothing is restocked', async () => {
    const db = createFakeAdminFirestore({
      'orders/o1': { status: 'pending', items: [{ productId: 'sized', name: 'Skirt (M)', price: 100, quantity: 2, size: 'M' }] },
      'orders/o2': { status: 'shipped', items: [{ productId: 'sized', name: 'Skirt (M)', price: 100, quantity: 1, size: 'M' }] },
      'products/sized': { name: 'Skirt', sizeStock: { S: 1, M: 3 }, stock: 4 },
    });
    expect((await cancelWebOrder(db, { actorUid: 'owner-1', actorName: 'o', orderId: 'o1', reason: 'x' })).ok).toBe(true);
    expect(db._list('stockMovements')).toEqual([
      expect.objectContaining({ productId: 'sized', size: 'M', qtyBefore: 3, qtyChange: 2, qtyAfter: 5, reason: 'order_cancelled', orderId: 'o1', returnId: null }),
    ]);
    // Shipped + "goods did not come back": no stock change, no ledger entry.
    expect((await cancelWebOrder(db, { actorUid: 'owner-1', actorName: 'o', orderId: 'o2', reason: 'x', restock: false })).ok).toBe(true);
    expect(db._list('stockMovements')).toHaveLength(1);
  });
});
