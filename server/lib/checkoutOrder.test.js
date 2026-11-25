// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { processGuestCheckout } from './checkoutOrder.js';
import { createFakeAdminFirestore, containsUndefined } from './testing/fakeAdminFirestore.js';

// Burqin (Jenin region, starting price 20).
const delivery = {
  customerName: 'Test Guest',
  customerPhone: '0590000999',
  deliveryLocationId: 'jenin-025',
  deliveryAddress: 'Test Street 1',
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

  it.each([
    ['other first two digits', '0791234567', 'The first two digits of the mobile number must be 05.'],
    ['no leading 0', '5912345678', 'The first two digits of the mobile number must be 05.'],
    ['+970 country code (never rewritten to 05…)', '+970591234567', 'The first two digits of the mobile number must be 05.'],
    ['00970 country code', '00970591234567', 'The first two digits of the mobile number must be 05.'],
    ['05 but too short', '059123456', 'Please enter a 10-digit mobile number starting with 05.'],
  ])('a mobile number that is not 05 + 8 digits is refused: %s', async (_label, customerPhone, message) => {
    const db = seed();
    const before = productsOf(db);
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, customerPhone } });
    expect(result).toMatchObject({ ok: false, code: 'DELIVERY_INVALID', field: 'customerPhone', message });
    expect(productsOf(db)).toEqual(before);
    expect(db._list('orders')).toHaveLength(0);
    expect(db._attempts()).toBe(0);
  });

  it('a 05 number is stored exactly as entered (separators removed only)', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, customerPhone: '059-123-4567' } });
    expect(result.ok).toBe(true);
    expect(db._list('orders')[0].customerPhone).toBe('0591234567');
  });
});

describe('processGuestCheckout — delivery place and price', () => {
  it('stores the chosen place as a snapshot with its starting price; no old zone field', async () => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery });
    expect(result).toMatchObject({ ok: true, total: 70 });
    const [order] = db._list('orders');
    expect(order).toMatchObject({
      deliveryAddress: 'Test Street 1',
      deliveryLocation: { id: 'jenin-025', name: 'برقين', regionId: 'jenin', regionName: 'جنين', regionNameEn: 'Jenin', price: 20 },
      shippingCost: 20,
      total: 70,
    });
    expect(order).not.toHaveProperty('deliveryZone');
    expect(containsUndefined(order)).toBe(false);
  });

  it('charges the admin price: the region price, or the place\'s own price', async () => {
    const db = seed();
    db._set('site_settings', 'delivery_prices', { regionPrices: { jenin: 25 } });
    await processGuestCheckout(db, { items: [item('plain', 1)], delivery });
    db._set('site_settings', 'delivery_prices', { regionPrices: { jenin: 25 }, locationPrices: { 'jenin-025': 12 } });
    await processGuestCheckout(db, { items: [item('plain', 1)], delivery });
    const [first, second] = db._list('orders');
    expect(first).toMatchObject({ shippingCost: 25, total: 75, deliveryLocation: { price: 25 } });
    expect(second).toMatchObject({ shippingCost: 12, total: 62, deliveryLocation: { price: 12 } });
  });

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['missing', undefined],
  ])('accepts the order with NO street / house details (%s) and stores null', async (_label, deliveryAddress) => {
    const db = seed();
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, deliveryAddress } });
    expect(result.ok).toBe(true);
    expect(db._list('orders')[0].deliveryAddress).toBeNull();
  });

  it('refuses, writing nothing, when the price changed after the customer saw it', async () => {
    const db = seed();
    db._set('site_settings', 'delivery_prices', { regionPrices: { jenin: 30 } });
    const before = productsOf(db);
    const refused = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, expectedShippingCost: 20 } });
    expect(refused).toMatchObject({ ok: false, code: 'DELIVERY_PRICE_CHANGED', shippingCost: 30 });
    expect(productsOf(db)).toEqual(before);
    expect(db._list('orders')).toHaveLength(0);
    const accepted = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, expectedShippingCost: 30 } });
    expect(accepted).toMatchObject({ ok: true, total: 80 });
  });

  it.each([
    ['no place', { deliveryLocationId: '' }],
    ['an unknown place id', { deliveryLocationId: 'nowhere-001' }],
    ['an old-checkout zone instead of a place', { deliveryLocationId: undefined, deliveryZone: 'west_bank' }],
  ])('refuses %s before anything is read or written', async (_label, overrides) => {
    const db = seed();
    const before = productsOf(db);
    const result = await processGuestCheckout(db, { items: [item('plain', 1)], delivery: { ...delivery, ...overrides } });
    expect(result).toMatchObject({ ok: false, code: 'DELIVERY_INVALID' });
    expect(productsOf(db)).toEqual(before);
    expect(db._list('orders')).toHaveLength(0);
    expect(db._attempts()).toBe(0);
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
