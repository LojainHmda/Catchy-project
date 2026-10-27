// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { processPosSale } from './posSale.js';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';

const colour = {
  name: 'Dress',
  price: 200,
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#c00', images: ['https://img.example.test/red.jpg'], sizeStock: { S: 4, M: 4 } },
    { id: 'navy', name: 'Navy', images: [], sizeStock: { S: 4, M: 4 }, order: 2 }, // no nameAr / hex
  ],
  sizeStock: { S: 8, M: 8 },
  stock: 16,
};

const openSession = { cashierUid: 'cashier-1', status: 'open', salesCount: 0, cashTotal: 0, cardTotal: 0, discountTotal: 0, grossTotal: 0, openingCashFloat: 100 };

const seed = () =>
  createFakeAdminFirestore({
    'register_sessions/s1': openSession,
    'register_sessions/closed': { ...openSession, status: 'closed' },
    'register_sessions/other': { ...openSession, cashierUid: 'cashier-2' },
    'products/plain': { name: 'Scarf', price: 50, stock: 10 },
    'products/sized': { name: 'Skirt', price: 100, sizeStock: { S: 5, M: 5 }, stock: 10 },
    'products/colour': colour,
  });
const sale = (overrides = {}) => ({ cashierUid: 'cashier-1', cashierName: 'Cashier', registerSessionId: 's1', payment: { method: 'card' }, ...overrides });
const line = (productId, quantity, extra = {}) => ({ productId, name: productId, quantity, ...extra });
const productsOf = (db) => Object.fromEntries(db._list('products').map(({ id, ...data }) => [id, data]));

describe('processPosSale', () => {
  it('completes a sale: exact stock, a completed POS order, session totals', async () => {
    const db = seed();
    const result = await processPosSale(db, sale({
      items: [line('plain', 1), line('sized', 1, { size: 'S' })],
      payment: { method: 'cash', cashAmount: 200 },
    }));
    expect(result).toMatchObject({ ok: true, total: 150, itemCount: 2, changeGiven: 50 });
    expect(db._get('products', 'plain').stock).toBe(9);
    expect(db._get('products', 'sized')).toMatchObject({ sizeStock: { S: 4, M: 5 }, stock: 9 });
    const [order] = db._list('orders');
    expect(order).toMatchObject({ source: 'pos', status: 'completed', registerSessionId: 's1', total: 150 });
    expect(db._get('register_sessions', 's1')).toMatchObject({ salesCount: 1, grossTotal: 150 });
  });

  it('REGRESSION: sells a colour product whose colour has no nameAr/hex; nothing undefined is written, stored fields kept', async () => {
    const db = seed();
    const result = await processPosSale(db, sale({ items: [line('colour', 1, { colorId: 'navy', colorName: 'Navy', size: 'M' })] }));
    expect(result.ok).toBe(true);
    const product = db._get('products', 'colour');
    expect(containsUndefined(product)).toBe(false);
    expect(product.colorVariants[1]).toEqual({ ...colour.colorVariants[1], sizeStock: { S: 4, M: 3 } });
    expect(product.colorVariants[0]).toEqual(colour.colorVariants[0]);
    expect(product).toMatchObject({ sizeStock: { S: 8, M: 7 }, stock: 15 });
  });

  it.each([
    ['cash below the total', sale({ items: [line('plain', 1)], payment: { method: 'cash', cashAmount: 10 } }), 'PAYMENT_INSUFFICIENT'],
    ['out of stock', sale({ items: [line('plain', 999)] }), 'OUT_OF_STOCK'],
    ['a deleted product', sale({ items: [line('nope', 1)] }), 'PRODUCT_MISSING'],
    ['a colour that no longer exists', sale({ items: [line('colour', 1, { colorId: 'purple', size: 'S' })] }), 'OUT_OF_STOCK'],
    ['a size that no longer exists', sale({ items: [line('sized', 1, { size: 'XL' })] }), 'OUT_OF_STOCK'],
    ["another cashier's session", sale({ registerSessionId: 'other', items: [line('plain', 1)] }), 'SESSION_FORBIDDEN'],
    ['a closed session', sale({ registerSessionId: 'closed', items: [line('plain', 1)] }), 'SESSION_CLOSED'],
    ['an unknown session', sale({ registerSessionId: 'missing', items: [line('plain', 1)] }), 'SESSION_NOT_FOUND'],
  ])('refuses %s (%s) and writes nothing', async (_label, input, code) => {
    const db = seed();
    const before = productsOf(db);
    const sessionsBefore = db._list('register_sessions');
    const result = await processPosSale(db, input);
    expect(result).toMatchObject({ ok: false, code });
    expect(productsOf(db)).toEqual(before);
    expect(db._list('register_sessions')).toEqual(sessionsBefore);
    expect(db._list('orders')).toHaveLength(0);
  });
});
