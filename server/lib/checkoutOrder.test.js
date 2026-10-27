// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { processGuestCheckout } from './checkoutOrder.js';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';

const delivery = {
  customerName: 'Test Guest',
  customerPhone: '0590000999',
  deliveryAddress: 'Test Street 1, Test City',
  deliveryZone: 'west_bank',
  email: 'guest@example.test',
};

const plain = { name: 'Scarf', price: 50, stock: 10 };
const sized = { name: 'Skirt', price: 100, sizeStock: { S: 5, M: 5 }, stock: 10 };
// One colour WITHOUT nameAr/hex (plus an extra stored field): the parsed copy carries
// `undefined` for those — writing it back made every checkout of this product fail.
const colour = {
  name: 'Dress',
  price: 200,
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#c00', images: ['https://img.example.test/red.jpg'], sizeStock: { S: 4, M: 4 }, order: 1 },
    { id: 'navy', name: 'Navy', images: ['n.jpg'], sizeStock: { S: 4, M: 4 } },
  ],
  sizeStock: { S: 8, M: 8 },
  stock: 16,
};

const seed = () =>
  createFakeAdminFirestore({ 'products/plain': plain, 'products/sized': sized, 'products/colour': colour, 'products/last': { name: 'Last', price: 30, stock: 1 } });
const item = (id, quantity, extra = {}) => ({ id, name: id, quantity, ...extra });
const productsOf = (db) => Object.fromEntries(db._list('products').map(({ id, ...data }) => [id, data]));

describe('processGuestCheckout — placing orders', () => {
  it('places a pending guest order at server prices and takes exactly the ordered stock', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('plain', 2), item('sized', 1, { size: 'M' })], delivery });
    expect(result).toMatchObject({ ok: true, total: 2 * 50 + 100 + 20, itemCount: 3 });
    expect(db._get('products', 'plain').stock).toBe(8);
    expect(db._get('products', 'sized')).toMatchObject({ sizeStock: { S: 5, M: 4 }, stock: 9 });
    const [order] = db._list('orders');
    expect(order).toMatchObject({ status: 'pending', isGuest: true, userId: 'guest', subtotal: 200, shippingCost: 20, total: 220 });
  });

  it('REGRESSION: a colour product whose other colour has no nameAr/hex can be bought; nothing undefined is written', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('colour', 1, { colorId: 'red', colorName: 'Red', size: 'M' })], delivery });
    expect(result.ok).toBe(true);
    const product = db._get('products', 'colour');
    expect(containsUndefined(product)).toBe(false);
    expect(product.colorVariants[0]).toEqual({ ...colour.colorVariants[0], sizeStock: { S: 4, M: 3 } });
    expect(product.colorVariants[1]).toEqual(colour.colorVariants[1]); // no nameAr/hex keys added, short image kept
    expect(product).toMatchObject({ sizeStock: { S: 8, M: 7 }, stock: 15 });
  });

  it('buys the colour without nameAr/hex itself', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('colour', 2, { colorId: 'navy', colorName: 'Navy', size: 'S' })], delivery });
    expect(result.ok).toBe(true);
    expect(db._get('products', 'colour').colorVariants[1]).toEqual({ ...colour.colorVariants[1], sizeStock: { S: 2, M: 4 } });
  });
});

describe('processGuestCheckout — refusals write nothing', () => {
  it.each([
    ['out of stock', [item('plain', 999)], 'OUT_OF_STOCK'],
    ['a deleted product', [item('nope', 1)], 'PRODUCT_MISSING'],
    ['a sized product without a size', [item('sized', 1)], 'OUT_OF_STOCK'],
    ['a size that does not exist', [item('sized', 1, { size: 'XL' })], 'OUT_OF_STOCK'],
    ['a colour that does not exist', [item('colour', 1, { colorId: 'purple', size: 'S' })], 'OUT_OF_STOCK'],
    ['a colour product without a colour', [item('colour', 1, { size: 'S' })], 'OUT_OF_STOCK'],
    ['one good line plus one deleted product (all-or-nothing)', [item('plain', 1), item('nope', 1)], 'PRODUCT_MISSING'],
    ['an empty cart', [], 'EMPTY_CART'],
  ])('%s → %s', async (_label, items, code) => {
    const db = seed();
    const before = productsOf(db);
    const result = await processGuestCheckout(db, { items, delivery });
    expect(result).toMatchObject({ ok: false, code });
    expect(productsOf(db)).toEqual(before);
    expect(db._list('orders')).toHaveLength(0);
  });

  it('an invalid delivery is refused before anything is read or written', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, customerPhone: '12345' } });
    expect(result).toMatchObject({ ok: false, code: 'DELIVERY_INVALID' });
    expect(db._get('products', 'plain').stock).toBe(10);
  });
});

describe('processGuestCheckout — concurrency', () => {
  it('two buyers racing for the last unit: exactly one order, stock 1 → 0, never negative', async () => {
    const db = seed();
    const [a, b] = await Promise.all([
      processGuestCheckout(db, { items: [item('last', 1)], delivery }),
      processGuestCheckout(db, { items: [item('last', 1)], delivery }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(db._get('products', 'last').stock).toBe(0);
    expect(db._list('orders')).toHaveLength(1);
  });
});
