import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrderLineItem, OrderRecord } from '../../types/order';

// Client-side current-state guards (V1). Firestore is an in-memory map; the
// transaction mock runs the callback once against the CURRENT stored doc.
// This proves every guarded write re-checks stored state instead of trusting
// the screen. It cannot prove the web SDK's own transaction retry/contention
// behaviour (Firestore's guarantee; not reproduced here).
const fx = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writes: [] as { path: string; patch: Record<string, unknown>; via: 'tx' | 'updateDoc' }[],
}));

vi.mock('../../firebase', () => {
  const snap = (path: string) => ({ exists: () => fx.store.has(path), data: () => fx.store.get(path), id: path.split('/')[1] });
  const write = (path: string, patch: Record<string, unknown>, via: 'tx' | 'updateDoc') => {
    fx.writes.push({ path, patch, via });
    fx.store.set(path, { ...(fx.store.get(path) ?? {}), ...patch });
  };
  return {
    db: {},
    doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
    getDoc: async (ref: { path: string }) => snap(ref.path),
    updateDoc: async (ref: { path: string }, patch: Record<string, unknown>) => write(ref.path, patch, 'updateDoc'),
    runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
      run({
        get: async (ref: { path: string }) => snap(ref.path),
        update: (ref: { path: string }, patch: Record<string, unknown>) => write(ref.path, patch, 'tx'),
      }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), addDoc: vi.fn(),
  };
});

import { saveOrderItems, updateOrderCustomerDetails, updateOrderStatus } from './orderService';
import { checkoutErrorCode } from './orderErrors';
import { hasCancellationRecord, isUnrecognizedOrderStatus, normalizeOrderStatus } from './orderUtils';
import { canCancelWebOrder } from './orderListFilters';

const actor = { uid: 'owner-1', name: 'Owner' };
const line = (quantity: number): OrderLineItem => ({ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity, image: '', lineTotal: 100 * quantity, size: 'M' });

function stored(overrides: Record<string, unknown> = {}) {
  return { status: 'pending', items: [{ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 2, size: 'M' }], shippingCost: 20, ...overrides };
}

function screenOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'o1', userId: 'u1', isGuest: false, customerEmail: null, customerName: 'Lina', customerPhone: null,
    deliveryAddress: null, deliveryZone: null, status: 'pending', subtotal: 200, shippingCost: 20, total: 220,
    itemCount: 2, createdAt: new Date(), items: [line(2)], source: 'web', ...overrides,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (error) {
    return checkoutErrorCode(error);
  }
}

beforeEach(() => {
  fx.store = new Map<string, Record<string, unknown>>([
    ['orders/o1', stored()],
    ['products/skirt', { name: 'Skirt', sizeStock: { M: 5 }, stock: 5 }],
  ]);
  fx.writes = [];
});

describe('updateOrderStatus — validated against the stored order, inside a transaction', () => {
  it('writes the change with attribution when the stored state allows it', async () => {
    await updateOrderStatus('o1', 'processing', actor);
    expect(fx.writes).toEqual([
      { path: 'orders/o1', via: 'tx', patch: expect.objectContaining({ status: 'processing', statusUpdatedByUid: 'owner-1', statusUpdatedByName: 'Owner' }) },
    ]);
  });

  it('refuses when the order was cancelled after the screen loaded it (stale screen)', async () => {
    fx.store.set('orders/o1', stored({ status: 'cancelled', cancellation: { cancelledByUid: 'owner-2' } }));
    expect(await codeOf(updateOrderStatus('o1', 'shipped', actor))).toBe('ORDER_CHANGED');
    expect(fx.writes).toEqual([]);
  });

  it('refuses an order that carries a cancellation record even if its status was changed afterwards', async () => {
    fx.store.set('orders/o1', stored({ status: 'shipped', cancellation: { cancelledByUid: 'owner-2' } }));
    expect(await codeOf(updateOrderStatus('o1', 'delivered', actor))).toBe('ORDER_CHANGED');
    expect(fx.writes).toEqual([]);
  });

  it.each([
    ['a POS sale', { source: 'pos', status: 'completed' }, 'delivered'],
    ['a completed order', { status: 'completed' }, 'delivered'],
    ['setting cancelled by hand', {}, 'cancelled'],
    ['a deleted order', null, 'processing'],
  ])('refuses %s', async (_label, overrides, target) => {
    if (overrides === null) fx.store.delete('orders/o1');
    else fx.store.set('orders/o1', stored(overrides as Record<string, unknown>));
    expect(await codeOf(updateOrderStatus('o1', target as never, actor))).toBe('ORDER_CHANGED');
    expect(fx.writes).toEqual([]);
  });

  it('accepts differently-cased stored statuses (" Pending ")', async () => {
    fx.store.set('orders/o1', stored({ status: ' Pending ' }));
    await updateOrderStatus('o1', 'processing', actor);
    expect(fx.writes).toHaveLength(1);
  });
});

describe('saveOrderItems — no item edits or stock changes on orders cancelled/changed elsewhere', () => {
  it('cancelled since loaded: refused before any order or product write', async () => {
    fx.store.set('orders/o1', stored({ status: 'cancelled', cancellation: { cancelledByUid: 'owner-2' } }));
    expect(await codeOf(saveOrderItems(screenOrder(), [line(1)]))).toBe('ORDER_NOT_EDITABLE');
    expect(fx.writes).toEqual([]);
    expect(fx.store.get('products/skirt')).toMatchObject({ stock: 5 });
  });

  it('items changed by someone else since loaded: refused (the stock deltas would be wrong)', async () => {
    fx.store.set('orders/o1', stored({ items: [{ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 3, size: 'M' }] }));
    expect(await codeOf(saveOrderItems(screenOrder(), [line(1)]))).toBe('ORDER_CHANGED');
    expect(fx.writes).toEqual([]);
  });

  it('still editable and unchanged: writes the items in a transaction, then adjusts stock', async () => {
    const result = await saveOrderItems(screenOrder(), [line(1)]);
    expect(result).toMatchObject({ subtotal: 100, total: 120, itemCount: 1 });
    expect(fx.writes[0]).toMatchObject({ path: 'orders/o1', via: 'tx' });
    expect(fx.store.get('products/skirt')).toMatchObject({ sizeStock: { M: 6 }, stock: 6 }); // one returned to stock
  });
});

describe('updateOrderCustomerDetails — same guard', () => {
  it('refuses a cancelled order and writes nothing', async () => {
    fx.store.set('orders/o1', stored({ status: 'cancelled' }));
    expect(await codeOf(updateOrderCustomerDetails('o1', { customerName: 'X' }))).toBe('ORDER_NOT_EDITABLE');
    expect(fx.writes).toEqual([]);
  });

  it('updates an editable order', async () => {
    await updateOrderCustomerDetails('o1', { customerName: '  Lina H  ' });
    expect(fx.writes[0]).toMatchObject({ via: 'tx', patch: { customerName: 'Lina H' } });
  });
});

describe('status helpers (V9) and cancel eligibility', () => {
  it('normalises case/whitespace and flags unrecognised legacy statuses', () => {
    expect(normalizeOrderStatus(' Shipped ')).toBe('shipped');
    expect(isUnrecognizedOrderStatus(' Pending ')).toBe(false);
    expect(isUnrecognizedOrderStatus(undefined)).toBe(false);
    expect(isUnrecognizedOrderStatus('refunded')).toBe(true);
    expect(normalizeOrderStatus('refunded')).toBe('pending'); // display only — never used to cancel
  });

  it('detects a cancellation record', () => {
    expect(hasCancellationRecord({ cancelledByUid: 'x' })).toBe(true);
    expect(hasCancellationRecord({ cancelledByUid: '' })).toBe(false);
    expect(hasCancellationRecord(null)).toBe(false);
  });

  it('never offers cancellation for unrecognised statuses or orders already carrying a cancellation record', () => {
    const base = { status: 'pending' as const, source: 'web' as const };
    expect(canCancelWebOrder(base)).toBe(true);
    expect(canCancelWebOrder({ ...base, statusUnrecognized: true })).toBe(false);
    expect(
      canCancelWebOrder({
        ...base,
        status: 'shipped',
        cancellation: { cancelledAt: null, cancelledByUid: 'x', cancelledByName: null, reason: null, registerSessionStatusAtCancellation: null },
      })
    ).toBe(false);
  });
});

describe('returns shelf — stored returnSummary blocks double-restock paths inside the transaction', () => {
  const returned = (overrides: Record<string, unknown> = {}) =>
    stored({ status: 'shipped', returnSummary: { returnCount: 1, openCount: 1, returnedQtyByKey: { 'skirt|~||~|M': 1 } }, ...overrides });

  it('a backward status move is refused even if the screen never saw the return', async () => {
    fx.store.set('orders/o1', returned());
    expect(await codeOf(updateOrderStatus('o1', 'processing', actor))).toBe('ORDER_CHANGED');
    expect(await codeOf(updateOrderStatus('o1', 'pending', actor))).toBe('ORDER_CHANGED');
    expect(fx.writes).toEqual([]);
  });

  it('moving forward (shipped → delivered) is still allowed', async () => {
    fx.store.set('orders/o1', returned());
    await updateOrderStatus('o1', 'delivered', actor);
    expect(fx.writes).toHaveLength(1);
  });

  it('item edits are refused before any order or product write', async () => {
    fx.store.set('orders/o1', returned());
    expect(await codeOf(saveOrderItems(screenOrder({ status: 'shipped' }), [line(1)]))).toBe('ORDER_NOT_EDITABLE');
    expect(fx.writes).toEqual([]);
    expect(fx.store.get('products/skirt')).toMatchObject({ stock: 5 });
  });

  it('customer details (no stock effect) can still be corrected', async () => {
    fx.store.set('orders/o1', returned());
    await updateOrderCustomerDetails('o1', { customerName: 'New name' });
    expect(fx.writes).toHaveLength(1);
  });
});

describe('saveOrderItems — stock goes to EXACTLY the line\'s colour/size; removed ones are never re-created', () => {
  const colourStored = (items: unknown[]) => stored({ status: 'processing', items });
  const blueLine = (quantity: number): OrderLineItem => ({
    productId: 'dress', name: 'Dress (Blue / S)', price: 120, quantity, image: '', lineTotal: 120 * quantity, size: 'S', colorId: 'blue', colorName: 'Blue',
  });
  // The blue colour was removed after the order; red has no nameAr/hex and an extra stored field.
  const dressWithoutBlue = () => ({
    name: 'Dress',
    colorVariants: [{ id: 'red', name: 'Red', images: ['r.jpg'], sizeStock: { S: 3 }, order: 1 }],
    sizeStock: { S: 3 },
    stock: 3,
  });

  it('quantity down on a removed size: the order is saved, the size is NOT re-created, the skip is reported', async () => {
    fx.store.set('products/skirt', { name: 'Skirt', sizeStock: { S: 4 }, stock: 4 }); // size M removed
    const result = await saveOrderItems(screenOrder(), [line(1)]);
    expect(result.itemCount).toBe(1);
    expect(fx.store.get('products/skirt')).toEqual({ name: 'Skirt', sizeStock: { S: 4 }, stock: 4 });
    expect(result.stockSkipped).toEqual([{ productId: 'skirt', colorId: null, size: 'M', quantity: 1, reason: 'size_missing' }]);
  });

  it('removing a line of a deleted product: saved, nothing re-created, reported as product_missing', async () => {
    fx.store.delete('products/skirt');
    const result = await saveOrderItems(screenOrder(), []);
    expect(fx.store.has('products/skirt')).toBe(false);
    expect(result.stockSkipped).toEqual([expect.objectContaining({ productId: 'skirt', quantity: 2, reason: 'product_missing' })]);
  });

  it('quantity UP on a removed colour is refused before ANY write — never taken from another colour', async () => {
    fx.store.set('orders/o1', colourStored([{ productId: 'dress', name: 'Dress (Blue / S)', price: 120, quantity: 1, size: 'S', colorId: 'blue', colorName: 'Blue' }]));
    fx.store.set('products/dress', dressWithoutBlue());
    const order = screenOrder({ status: 'processing', items: [blueLine(1)] });
    expect(await codeOf(saveOrderItems(order, [blueLine(2)]))).toBe('OUT_OF_STOCK');
    expect(fx.writes).toEqual([]);
    expect(fx.store.get('products/dress')).toEqual(dressWithoutBlue());
  });

  it('quantity down on a removed colour: saved, the other colour is untouched, reported as variant_missing', async () => {
    fx.store.set('orders/o1', colourStored([{ productId: 'dress', name: 'Dress (Blue / S)', price: 120, quantity: 2, size: 'S', colorId: 'blue', colorName: 'Blue' }]));
    fx.store.set('products/dress', dressWithoutBlue());
    const result = await saveOrderItems(screenOrder({ status: 'processing', items: [blueLine(2)] }), [blueLine(1)]);
    expect(fx.store.get('products/dress')).toEqual(dressWithoutBlue());
    expect(result.stockSkipped).toEqual([expect.objectContaining({ colorId: 'blue', quantity: 1, reason: 'variant_missing' })]);
  });

  it('an exact colour still restores, writing the stored colour objects (no undefined, extra fields kept)', async () => {
    const redLine = (quantity: number): OrderLineItem => ({ ...blueLine(quantity), name: 'Dress (Red / S)', colorId: 'red', colorName: 'Red' });
    fx.store.set('orders/o1', colourStored([{ productId: 'dress', name: 'Dress (Red / S)', price: 120, quantity: 2, size: 'S', colorId: 'red', colorName: 'Red' }]));
    fx.store.set('products/dress', dressWithoutBlue());
    const result = await saveOrderItems(screenOrder({ status: 'processing', items: [redLine(2)] }), [redLine(1)]);
    expect(result.stockSkipped).toEqual([]);
    const dress = fx.store.get('products/dress') as Record<string, unknown>;
    expect(dress.colorVariants).toEqual([{ id: 'red', name: 'Red', images: ['r.jpg'], sizeStock: { S: 4 }, order: 1 }]);
    expect(JSON.stringify(dress)).not.toContain('undefined');
    expect(dress).toMatchObject({ sizeStock: { S: 4 }, stock: 4 });
  });
});
