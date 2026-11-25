import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CartLineItem } from '../../types/order';

// Signed-in checkout (placeOrderFromCart) against an in-memory Firestore. The real
// web SDK rejects `undefined` anywhere in a write; this fake rejects it the same way,
// so a regression (order kept, stock never deducted) shows up here.
const fx = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  orders: [] as Record<string, unknown>[],
  stockWrites: [] as { path: string; patch: Record<string, unknown> }[],
  serverReads: [] as string[],
}));

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).some(containsUndefined);
  return false;
}

vi.mock('../../firebase', () => ({
  db: {},
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id }),
  getDoc: async (ref: { path: string; id: string }) => ({
    id: ref.id,
    exists: () => fx.store.has(ref.path),
    data: () => fx.store.get(ref.path),
  }),
  // Delivery prices are read straight from the server when the order is placed.
  getDocFromServer: async (ref: { path: string; id: string }) => {
    fx.serverReads.push(ref.path);
    return { id: ref.id, exists: () => fx.store.has(ref.path), data: () => fx.store.get(ref.path) };
  },
  onSnapshot: vi.fn(), setDoc: vi.fn(),
  addDoc: async (_col: unknown, data: Record<string, unknown>) => {
    if (containsUndefined(data)) throw new Error('Unsupported field value: undefined');
    fx.orders.push(data);
    return { id: `order-${fx.orders.length}` };
  },
  updateDoc: async (ref: { path: string }, patch: Record<string, unknown>) => {
    if (containsUndefined(patch)) throw new Error('Function updateDoc() called with invalid data. Unsupported field value: undefined');
    fx.stockWrites.push({ path: ref.path, patch });
    fx.store.set(ref.path, { ...(fx.store.get(ref.path) ?? {}), ...patch });
  },
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  runTransaction: vi.fn(), getDocs: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
}));

import { placeOrderFromCart } from './orderService';

// Burqin (Jenin region, starting price 20).
const delivery = { customerName: 'Customer', customerPhone: '0590000001', deliveryLocationId: 'jenin-025', deliveryAddress: 'Test Street 1', email: null };
const customer = { uid: 'cust-1', email: 'customer@example.test', displayName: 'Customer', delivery };
const withDelivery = (overrides: Partial<typeof delivery> & { expectedShippingCost?: number | null }) => ({ ...customer, delivery: { ...delivery, ...overrides } });

const cartLine = (id: string, quantity: number, extra: Partial<CartLineItem> = {}): CartLineItem => ({
  id, name: id, price: 0, quantity, image: '', stock: 99, lineKey: `${id}|${extra.colorId ?? ''}|${extra.size ?? ''}`, ...extra,
});

const dress = () => ({
  name: 'Dress',
  price: 200,
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#c00', images: ['https://img.example.test/r.jpg'], sizeStock: { S: 4 } },
    { id: 'navy', name: 'Navy', images: ['n.jpg'], sizeStock: { S: 4 }, order: 2 }, // no nameAr / hex
  ],
  sizeStock: { S: 8 },
  stock: 8,
});

beforeEach(() => {
  fx.store = new Map<string, Record<string, unknown>>([
    ['products/dress', dress()],
    ['products/scarf', { name: 'Scarf', price: 50, stock: 3 }],
  ]);
  fx.orders = [];
  fx.stockWrites = [];
  fx.serverReads = [];
});

describe('placeOrderFromCart (signed-in checkout)', () => {
  it('REGRESSION: a colour without nameAr/hex is bought AND its stock deducted (previously the order was kept with no deduction)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await placeOrderFromCart([cartLine('dress', 1, { colorId: 'navy', colorName: 'Navy', size: 'S' })], customer);
    expect(result.orderId).toBe('order-1');
    expect(warn).not.toHaveBeenCalled(); // the stock write no longer fails
    const product = fx.store.get('products/dress')!;
    expect(product.colorVariants).toEqual([dress().colorVariants[0], { ...dress().colorVariants[1], sizeStock: { S: 3 } }]);
    expect(product).toMatchObject({ sizeStock: { S: 7 }, stock: 7 });
    warn.mockRestore();
  });

  it('charges the product price stored in Firestore (sale price), not the cart price', async () => {
    await placeOrderFromCart([cartLine('scarf', 2, { price: 1 })], customer);
    expect(fx.orders[0]).toMatchObject({ subtotal: 100, shippingCost: 20, total: 120, status: 'pending', userId: 'cust-1' });
    expect(fx.store.get('products/scarf')!.stock).toBe(1);
  });

  it.each([
    ['more than in stock', [cartLine('scarf', 4)], 'OUT_OF_STOCK'],
    ['a deleted product', [cartLine('nope', 1)], 'PRODUCT_MISSING'],
    ['a colour that no longer exists', [cartLine('dress', 1, { colorId: 'blue', size: 'S' })], 'OUT_OF_STOCK'],
    ['a colour product without a colour', [cartLine('dress', 1, { size: 'S' })], 'OUT_OF_STOCK'],
  ])('refuses %s before any order or stock write', async (_label, cart, code) => {
    await expect(placeOrderFromCart(cart, customer)).rejects.toMatchObject({ code });
    expect(fx.orders).toEqual([]);
    expect(fx.stockWrites).toEqual([]);
  });
});

describe('placeOrderFromCart — delivery place and price', () => {
  it('stores the chosen place as a snapshot with its starting price (no saved prices yet)', async () => {
    await placeOrderFromCart([cartLine('scarf', 1)], customer);
    expect(fx.serverReads).toEqual(['site_settings/delivery_prices']);
    expect(fx.orders[0]).toMatchObject({
      deliveryAddress: 'Test Street 1',
      deliveryLocation: { id: 'jenin-025', name: 'برقين', regionId: 'jenin', regionName: 'جنين', regionNameEn: 'Jenin', price: 20 },
      subtotal: 50,
      shippingCost: 20,
      total: 70,
    });
    expect(fx.orders[0]).not.toHaveProperty('deliveryZone');
  });

  it('charges the price set in Admin: the region price, or the place\'s own price', async () => {
    fx.store.set('site_settings/delivery_prices', { regionPrices: { jenin: 25 } });
    await placeOrderFromCart([cartLine('scarf', 1)], customer);
    expect(fx.orders[0]).toMatchObject({ shippingCost: 25, total: 75, deliveryLocation: { price: 25 } });

    fx.store.set('site_settings/delivery_prices', { regionPrices: { jenin: 25 }, locationPrices: { 'jenin-025': 12 } });
    await placeOrderFromCart([cartLine('scarf', 1)], customer);
    expect(fx.orders[1]).toMatchObject({ shippingCost: 12, total: 62, deliveryLocation: { price: 12 } });
  });

  it('places the order WITHOUT street or house details (stored as null)', async () => {
    await placeOrderFromCart([cartLine('scarf', 1)], withDelivery({ deliveryAddress: '   ' }));
    expect(fx.orders[0]).toMatchObject({ deliveryAddress: null, deliveryLocation: { id: 'jenin-025' } });
  });

  it('refuses, writing nothing, when the price changed after the customer saw it', async () => {
    fx.store.set('site_settings/delivery_prices', { regionPrices: { jenin: 30 } });
    await expect(placeOrderFromCart([cartLine('scarf', 1)], withDelivery({ expectedShippingCost: 20 }))).rejects.toMatchObject({ code: 'DELIVERY_PRICE_CHANGED' });
    expect(fx.orders).toEqual([]);
    expect(fx.stockWrites).toEqual([]);
    await placeOrderFromCart([cartLine('scarf', 1)], withDelivery({ expectedShippingCost: 30 }));
    expect(fx.orders[0]).toMatchObject({ shippingCost: 30 });
  });

  it.each([
    ['other first two digits', '0791234567'],
    ['no leading 0', '5912345678'],
    ['+970 country code', '+970591234567'],
    ['too short', '059123456'],
  ])('refuses a mobile number that is not 05 + 8 digits (%s) before anything is read or written', async (_label, customerPhone) => {
    await expect(placeOrderFromCart([cartLine('scarf', 1)], withDelivery({ customerPhone }))).rejects.toMatchObject({ code: 'DELIVERY_INVALID' });
    expect(fx.orders).toEqual([]);
    expect(fx.stockWrites).toEqual([]);
    expect(fx.serverReads).toEqual([]);
  });

  it.each([
    ['no place', { deliveryLocationId: '' }],
    ['an unknown place id', { deliveryLocationId: 'nowhere-001' }],
    ['an old zone id', { deliveryLocationId: 'west_bank' }],
  ])('refuses %s before anything is written', async (_label, overrides) => {
    await expect(placeOrderFromCart([cartLine('scarf', 1)], withDelivery(overrides))).rejects.toMatchObject({ code: 'DELIVERY_INVALID' });
    expect(fx.orders).toEqual([]);
    expect(fx.stockWrites).toEqual([]);
  });
});
