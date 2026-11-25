import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { OrderLineItem, OrderRecord } from '../../types/order';

// Editing the items of an order that has an admin web discount (a fixed ILS amount):
// the STORED discount is taken off the new subtotal inside the same guarded
// transaction — never re-applied on top of the previous total. Firestore is an
// in-memory map (same harness as orderStateGuards.test.ts).
const fx = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  writes: [] as { path: string; patch: Record<string, unknown> }[],
}));

vi.mock('../../firebase', () => {
  const snap = (path: string) => ({ exists: () => fx.store.has(path), data: () => fx.store.get(path), id: path.split('/')[1] });
  const write = (path: string, patch: Record<string, unknown>) => {
    fx.writes.push({ path, patch });
    fx.store.set(path, { ...(fx.store.get(path) ?? {}), ...patch });
  };
  return {
    db: {},
    doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
    getDoc: async (ref: { path: string }) => snap(ref.path),
    updateDoc: async (ref: { path: string }, patch: Record<string, unknown>) => write(ref.path, patch),
    runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
      run({ get: async (ref: { path: string }) => snap(ref.path), update: (ref: { path: string }, patch: Record<string, unknown>) => write(ref.path, patch) }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), addDoc: vi.fn(),
  };
});

import { saveOrderItems } from './orderService';

const line = (quantity: number): OrderLineItem => ({ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity, image: '', lineTotal: 100 * quantity, size: 'M' });
const storedItems = [{ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 2, size: 'M' }];

function screenOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'o1', userId: 'u1', isGuest: false, customerEmail: null, customerName: 'Lina', customerPhone: null,
    deliveryAddress: null, deliveryZone: null, status: 'pending', subtotal: 200, shippingCost: 20, total: 220,
    itemCount: 2, createdAt: new Date(), items: [line(2)], source: 'web', ...overrides,
  };
}

function seed(webDiscount: Record<string, unknown> | null, total: number) {
  fx.store = new Map<string, Record<string, unknown>>([
    ['orders/o1', { status: 'pending', items: storedItems, subtotal: 200, shippingCost: 20, total, ...(webDiscount ? { webDiscount } : {}) }],
    ['products/skirt', { name: 'Skirt', sizeStock: { M: 5 }, stock: 5 }],
  ]);
  fx.writes = [];
}

const orderWrite = () => fx.writes.find((w) => w.path === 'orders/o1')!.patch;

beforeEach(() => seed(null, 220));

describe('saveOrderItems with an admin web discount', () => {
  it('no discount: exactly the previous totals (subtotal + shipping), no discount field written', async () => {
    const result = await saveOrderItems(screenOrder(), [line(3)]);
    expect(result).toMatchObject({ subtotal: 300, total: 320, webDiscount: null });
    expect(orderWrite()).toMatchObject({ subtotal: 300, total: 320 });
    expect(Object.keys(orderWrite()).some((k) => k.startsWith('webDiscount'))).toBe(false);
  });

  it('a fixed 20 ILS stays 20 when items change: 300 − 20 + 20 = 300 (not 220 − 20 − 20)', async () => {
    seed({ amount: 20, reason: 'Loyal customer' }, 200);
    const result = await saveOrderItems(screenOrder({ total: 200 }), [line(3)]);
    expect(result).toMatchObject({ subtotal: 300, total: 300, webDiscount: { amount: 20, reason: 'Loyal customer' } });
    expect(orderWrite()).toMatchObject({ subtotal: 300, total: 300 });
    // Nothing about the discount itself is rewritten when the amount still fits.
    expect(Object.keys(orderWrite()).some((k) => k.startsWith('webDiscount'))).toBe(false);
  });

  it('safety net: capped at the subtotal if items drop below the fixed amount', async () => {
    seed({ amount: 150, reason: 'Gift' }, 70);
    const result = await saveOrderItems(screenOrder({ total: 70 }), [line(1)]);
    expect(result).toMatchObject({ subtotal: 100, total: 20, webDiscount: { amount: 100 } });
    expect(orderWrite()).toMatchObject({ 'webDiscount.amount': 100 });
  });

  it('uses the STORED discount, not the one the screen had loaded', async () => {
    seed({ amount: 50, reason: 'Changed elsewhere' }, 170);
    const stale = screenOrder({ total: 200, webDiscount: { amount: 20, reason: 'old', appliedAt: null, appliedByUid: null, appliedByName: null } });
    const result = await saveOrderItems(stale, [line(3)]);
    expect(result.total).toBe(270); // 300 − 50 + 20
  });
});
