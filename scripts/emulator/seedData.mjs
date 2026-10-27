// SYNTHETIC test data for the local emulators only. No real customer data:
// invented names, @example.test addresses, 0590000xxx phone numbers, local
// images from public/. Covers the Phase 1 admin features: dashboard trends and
// low stock (threshold 3), order statuses, bulk changes, reports, and every
// web-cancellation branch (sizes, colours with/without nameAr+hex, plain stock,
// removed colour, deleted product, coordinate set, legacy statuses, POS sale).
//
// Login accounts (local Auth emulator only — passwords are not used anywhere real):
//   owner    admin@gmail.com — the app's existing built-in demo-admin address. Firestore
//            rules grant owner access only to hardcoded addresses, so this generic demo
//            address is reused; it is NOT a real person's account.
//   others   *@example.test (reserved test domain).

export const SEED_PASSWORD = 'Emulator-Only-Pass-1';
const IMG = '/products/blouse2.jpeg'; // served locally by the dev server

const DAY = 24 * 60 * 60 * 1000;

export function buildSeedData(now = new Date()) {
  const at = (daysAgo, hour = 11) => {
    const d = new Date(now.getTime() - daysAgo * DAY);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const authUsers = [
    { localId: 'test-owner', email: 'admin@gmail.com', displayName: 'Test Owner', role: 'admin' },
    { localId: 'test-staff-admin', email: 'staff-admin@example.test', displayName: 'Test Staff Admin', role: 'admin' },
    { localId: 'test-cashier', email: 'cashier@example.test', displayName: 'Test Cashier', role: 'cashier' },
    { localId: 'test-customer', email: 'customer@example.test', displayName: 'Test Customer', role: 'customer' },
  ].map((u) => ({ ...u, password: SEED_PASSWORD }));

  const docs = [];
  const put = (collection, id, data) => docs.push({ collection, id, data });

  for (const u of authUsers) {
    put('users', u.localId, { email: u.email, displayName: u.displayName, role: u.role, createdAt: at(30) });
  }

  // ── Products ──
  put('products', 'test-skirt', {
    name: 'Test Linen Skirt', price: 120, visible: true, category: 'Skirts', images: [IMG],
    sizeStock: { S: 5, M: 2, L: 0 }, stock: 7, sizes: ['S', 'M', 'L'], createdAt: at(20),
  });
  put('products', 'test-dress', {
    name: 'Test Summer Dress', price: 250, visible: true, category: 'Dresses', images: [IMG], defaultColorId: 'red',
    colorVariants: [
      { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#c0392b', images: [IMG], sizeStock: { S: 3, M: 1 } },
      // No nameAr / hex on purpose: exercises the undefined-field fix (V2).
      { id: 'blue', name: 'Blue', images: [IMG], sizeStock: { S: 0, M: 6 } },
    ],
    sizeStock: { S: 3, M: 7 }, stock: 10, createdAt: at(18),
  });
  put('products', 'test-scarf', {
    name: 'Test Silk Scarf', price: 60, visible: true, category: 'Tops', images: [IMG], stock: 2, createdAt: at(15),
  });
  put('products', 'test-top-hidden', {
    name: 'Test Hidden Top', price: 80, visible: false, category: 'Tops', images: [IMG], stock: 0, createdAt: at(12),
  });
  put('coordinate_looks', 'test-look', {
    name: 'Test Summer Set', productIds: ['test-skirt', 'test-scarf'], price: 170, priceAutoSync: false,
    images: [IMG], createdAt: at(10),
  });

  // ── Orders ──
  const line = (productId, name, price, quantity, extra = {}) => ({ productId, name, price, quantity, image: IMG, ...extra });
  const webOrder = (id, { daysAgo, status, items, phone, customer = 'Test Customer A', userId = 'guest', extra = {} }) => {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const shippingCost = 20;
    put('orders', id, {
      userId, isGuest: userId === 'guest', email: userId === 'guest' ? null : 'customer@example.test',
      customerName: customer, customerPhone: phone, deliveryAddress: 'Test Street 1, Test City', deliveryZone: 'west_bank',
      status, subtotal, shippingCost, total: subtotal + shippingCost,
      itemCount: items.reduce((s, i) => s + i.quantity, 0), items, createdAt: at(daysAgo), updatedAt: at(daysAgo), ...extra,
    });
  };

  webOrder('test-o-pending', { daysAgo: 0, status: 'pending', phone: '0590000001', items: [line('test-skirt', 'Test Linen Skirt (M)', 120, 1, { size: 'M' })] });
  webOrder('test-o-processing', {
    daysAgo: 1, status: 'processing', phone: '0590000002', customer: 'Test Customer B', userId: 'test-customer',
    items: [line('test-dress', 'Test Summer Dress (Red / M)', 250, 1, { size: 'M', colorId: 'red', colorName: 'Red' })],
  });
  webOrder('test-o-blue', {
    daysAgo: 2, status: 'pending', phone: '0590000003', customer: 'Test Customer C',
    items: [line('test-dress', 'Test Summer Dress (Blue / M)', 250, 2, { size: 'M', colorId: 'blue', colorName: 'Blue' })],
  });
  webOrder('test-o-shipped', { daysAgo: 3, status: 'shipped', phone: '0590000001', items: [line('test-scarf', 'Test Silk Scarf', 60, 1)] });
  webOrder('test-o-delivered', { daysAgo: 8, status: 'delivered', phone: '0590000004', customer: 'Test Customer D', items: [line('test-skirt', 'Test Linen Skirt (S)', 120, 2, { size: 'S' })] });
  webOrder('test-o-old-period', { daysAgo: 40, status: 'delivered', phone: '0590000005', customer: 'Test Customer E', items: [line('test-scarf', 'Test Silk Scarf', 60, 3)] });
  webOrder('test-o-cancelled-old', { daysAgo: 5, status: 'cancelled', phone: '0590000006', customer: 'Test Customer F', items: [line('test-scarf', 'Test Silk Scarf', 60, 1)] });
  webOrder('test-o-legacy-status', { daysAgo: 6, status: 'Refunded', phone: '0590000007', customer: 'Test Customer G', items: [line('test-scarf', 'Test Silk Scarf', 60, 1)] });
  webOrder('test-o-mixed-case', { daysAgo: 1, status: ' Processing ', phone: '0590000008', customer: 'Test Customer H', items: [line('test-skirt', 'Test Linen Skirt (S)', 120, 1, { size: 'S' })] });
  webOrder('test-o-removed-color', {
    daysAgo: 2, status: 'pending', phone: '0590000009', customer: 'Test Customer I',
    items: [
      line('test-dress', 'Test Summer Dress (Green / S)', 250, 1, { size: 'S', colorId: 'green', colorName: 'Green' }),
      line('test-skirt', 'Test Linen Skirt (L)', 120, 1, { size: 'L' }),
    ],
  });
  webOrder('test-o-deleted-product', {
    daysAgo: 4, status: 'processing', phone: '0590000010', customer: 'Test Customer J',
    items: [line('test-deleted-product', 'Test Discontinued Belt', 40, 1), line('test-scarf', 'Test Silk Scarf', 60, 1)],
  });
  webOrder('test-o-coordinate', {
    daysAgo: 2, status: 'pending', phone: '0590000011', customer: 'Test Customer K',
    items: [line('coord:test-look', 'Test Summer Set (M / One size)', 170, 1, { size: 'M', itemSizes: { 'test-skirt': 'M' } })],
  });

  // POS sale (cash with change) inside an open register session.
  put('register_sessions', 'test-session', {
    cashierUid: 'test-cashier', cashierEmail: 'cashier@example.test', cashierName: 'Test Cashier', status: 'open',
    openedAt: at(0, 9), openingCashFloat: 200, salesCount: 1, cashTotal: 80, cardTotal: 0, discountTotal: 0, grossTotal: 80,
  });
  put('orders', 'test-o-pos', {
    userId: 'test-cashier', isGuest: false, source: 'pos', status: 'completed', registerSessionId: 'test-session',
    cashierUid: 'test-cashier', cashierName: 'Test Cashier', customerName: null, customerPhone: null,
    items: [line('test-scarf', 'Test Silk Scarf', 60, 1), line('test-skirt', 'Test Linen Skirt (S)', 120, 1, { size: 'S' })],
    subtotal: 180, discount: { mode: 'amount', value: 100, amount: 100, reason: 'Test discount' }, shippingCost: 0, total: 80,
    itemCount: 2, payment: { method: 'cash', cashAmount: 100, cardAmount: 0, changeGiven: 20 },
    createdAt: at(0, 10), updatedAt: at(0, 10),
  });

  return { authUsers, docs };
}
