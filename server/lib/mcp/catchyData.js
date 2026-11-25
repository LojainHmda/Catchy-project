// Read-only Catchy store data for the MCP tools (products, orders, reports, analytics).
// Everything here only READS Firestore (Admin SDK) — no tool can change the store.
// Money is ILS; days are store days (Asia/Hebron), given as YYYY-MM-DD.

import { STORE_TIME_ZONE, dayKey, validateRange } from '../analytics.js';
import { resolveProductInventory } from '../posSaleCorrection.js';

const MAX_PRODUCTS = 2000;
const MAX_ORDERS_IN_RANGE = 5000;
const DEFAULT_DAYS = 30;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function toIso(value) {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// ── Store-day ranges ─────────────────────────────────────────────────────────

function tzOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs;
}

/** The instant a store day (YYYY-MM-DD, store time zone) starts. */
export function storeDayStart(day, timeZone = STORE_TIME_ZONE) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(guess, timeZone);
  return new Date(guess - tzOffsetMs(first, timeZone));
}

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** { ok, from, to, start, end } — defaults to the last 30 store days. */
export function resolveRange({ from, to } = {}, now = new Date()) {
  const today = dayKey(now);
  const toDay = to ?? today;
  const fromDay = from ?? addDays(toDay, -(DEFAULT_DAYS - 1));
  const valid = validateRange(fromDay, toDay);
  if (!valid.ok) return { ok: false, message: valid.message };
  return { ok: true, from: fromDay, to: toDay, start: storeDayStart(fromDay), end: storeDayStart(addDays(toDay, 1)) };
}

// ── Products ─────────────────────────────────────────────────────────────────

export function productSummary(id, data, baseUrl) {
  const inv = resolveProductInventory(data);
  const categories = [str(data.category), ...(Array.isArray(data.collections) ? data.collections.map(str) : [])].filter(Boolean);
  const compareAt = Number(data.compareAtPrice);
  const onSale = (data.onSale === true || data.sale === true) && Number.isFinite(compareAt) && compareAt > Number(data.price);
  return {
    id,
    name: String(data.name ?? 'Product'),
    price: round2(data.price),
    ...(onSale ? { compareAtPrice: round2(compareAt), onSale: true } : {}),
    categories: [...new Set(categories)],
    visible: data.visible !== false,
    stock: inv.stock,
    url: `${baseUrl}/product/${encodeURIComponent(id)}`,
  };
}

export function productDetail(id, data, baseUrl) {
  const inv = resolveProductInventory(data);
  return {
    ...productSummary(id, data, baseUrl),
    nameAr: str(data.nameAr),
    description: str(data.description),
    barcode: str(data.barcode),
    createdAt: toIso(data.createdAt),
    stockBySize: inv.sizeStock,
    colors: inv.colorVariants.map((v) => ({ id: v.id, name: v.name, stockBySize: v.sizeStock, stock: Object.values(v.sizeStock).reduce((a, b) => a + Math.max(0, b), 0) })),
    images: (Array.isArray(data.images) ? data.images : [data.image]).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 8),
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

const normStatus = (raw) => String(raw ?? 'pending').trim().toLowerCase() || 'pending';

export function orderSummary(id, data) {
  const source = data.source === 'pos' ? 'pos' : 'web';
  const items = Array.isArray(data.items) ? data.items : [];
  const itemsSubtotal = items.reduce((s, i) => s + (Number(i?.price) || 0) * (Number(i?.quantity) || 0), 0);
  const subtotal = round2(Number(data.subtotal) || itemsSubtotal);
  const shippingCost = round2(data.shippingCost);
  const webDiscount = source === 'web' && data.webDiscount && Number(data.webDiscount.amount) > 0 ? data.webDiscount : null;
  const storedTotal = Number(data.total);
  const total = round2(webDiscount && Number.isFinite(storedTotal) ? storedTotal : storedTotal || subtotal + shippingCost);
  return {
    id,
    number: `#${id.slice(0, 8).toUpperCase()}`,
    createdAt: toIso(data.createdAt),
    source,
    status: normStatus(data.status),
    customerName: str(data.customerName),
    itemCount: items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0),
    subtotal,
    shippingCost,
    discount: round2(source === 'pos' ? data.discount?.amount : webDiscount?.amount),
    total,
  };
}

export function orderDetail(id, data, baseUrl) {
  const summary = orderSummary(id, data);
  const items = (Array.isArray(data.items) ? data.items : []).map((i) => ({
    productId: str(i?.productId),
    name: String(i?.name ?? ''),
    color: str(i?.colorName),
    size: str(i?.size),
    quantity: Number(i?.quantity) || 0,
    price: round2(i?.price),
    lineTotal: round2((Number(i?.price) || 0) * (Number(i?.quantity) || 0)),
  }));
  const discount =
    summary.source === 'pos'
      ? data.discount ? { kind: 'pos', mode: data.discount.mode, value: data.discount.value, amount: round2(data.discount.amount), reason: str(data.discount.reason) } : null
      : data.webDiscount && Number(data.webDiscount.amount) > 0 ? { kind: 'website', amount: round2(data.webDiscount.amount), reason: str(data.webDiscount.reason), appliedBy: str(data.webDiscount.appliedByName) } : null;
  return {
    ...summary,
    customer: {
      name: str(data.customerName),
      phone: str(data.customerPhone),
      email: str(data.email),
      address: str(data.deliveryAddress),
      // Old orders: one of the four former zones. Newer orders: the chosen place (snapshot).
      deliveryZone: str(data.deliveryZone),
      deliveryLocation:
        data.deliveryLocation && typeof data.deliveryLocation === 'object' && str(data.deliveryLocation.name)
          ? {
              id: str(data.deliveryLocation.id),
              name: str(data.deliveryLocation.name),
              region: str(data.deliveryLocation.regionName),
              regionEn: str(data.deliveryLocation.regionNameEn),
              price: data.deliveryLocation.price == null ? null : round2(data.deliveryLocation.price),
            }
          : null,
      guest: data.isGuest === true,
    },
    items,
    discount,
    payment: summary.source === 'pos' && data.payment ? { method: data.payment.method, cash: round2(data.payment.cashAmount), card: round2(data.payment.cardAmount), changeGiven: round2(data.payment.changeGiven) } : null,
    cashier: str(data.cashierName),
    statusUpdatedAt: toIso(data.statusUpdatedAt),
    statusUpdatedBy: str(data.statusUpdatedByName),
    cancellation: data.cancellation ? { at: toIso(data.cancellation.cancelledAt), by: str(data.cancellation.cancelledByName), reason: str(data.cancellation.reason) } : null,
    returns: data.returnSummary ?? null,
    adminNote: str(data.adminNote),
    adminUrl: `${baseUrl}/admin/orders?order=${encodeURIComponent(id)}`,
  };
}

// ── Reports ──────────────────────────────────────────────────────────────────

const FULFILLED = ['delivered', 'completed'];

export function buildSalesReport(orders) {
  const sum = (list) => ({ count: list.length, revenue: round2(list.reduce((s, o) => s + o.total, 0)) });
  const rows = orders.map(({ id, data }) => ({ ...orderSummary(id, data), items: Array.isArray(data.items) ? data.items : [] }));
  const booked = rows.filter((o) => o.status !== 'cancelled');
  const web = booked.filter((o) => o.source === 'web');
  const pos = booked.filter((o) => o.source === 'pos');
  const statusCounts = Object.fromEntries(
    [...new Set(rows.map((o) => o.status))].map((s) => [s, sum(rows.filter((o) => o.status === s))])
  );
  const products = new Map();
  for (const o of booked) {
    for (const i of o.items) {
      const key = `${i?.productId ?? ''}|${i?.colorName ?? ''}`;
      const row = products.get(key) ?? { productId: i?.productId ?? null, name: String(i?.name ?? ''), color: i?.colorName ?? null, quantity: 0, revenue: 0 };
      row.quantity += Number(i?.quantity) || 0;
      row.revenue += (Number(i?.price) || 0) * (Number(i?.quantity) || 0);
      products.set(key, row);
    }
  }
  const bookedTotals = sum(booked);
  return {
    orders: rows.length,
    booked: bookedTotals,
    fulfilled: sum(rows.filter((o) => FULFILLED.includes(o.status))),
    cancelled: sum(rows.filter((o) => o.status === 'cancelled')),
    averageOrderValue: bookedTotals.count ? round2(bookedTotals.revenue / bookedTotals.count) : 0,
    itemsSold: booked.reduce((s, o) => s + o.itemCount, 0),
    website: { ...sum(web), discountsGiven: round2(web.reduce((s, o) => s + o.discount, 0)), shippingCharged: round2(web.reduce((s, o) => s + o.shippingCost, 0)) },
    pos: { ...sum(pos), discountsGiven: round2(pos.reduce((s, o) => s + o.discount, 0)) },
    byStatus: statusCounts,
    topProducts: [...products.values()]
      .map((p) => ({ ...p, revenue: round2(p.revenue) }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10),
    notes: 'Revenue = order totals after discounts, cancelled orders excluded ("booked"). Fulfilled = delivered (website) + completed (POS). Product revenue uses item prices before order-level discounts.',
  };
}

// ── Data access ──────────────────────────────────────────────────────────────

export function createCatchyData(db, { baseUrl, analytics } = {}) {
  const products = async () => {
    const snap = await db.collection('products').limit(MAX_PRODUCTS).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  };
  const ordersBetween = async (start, end) => {
    const snap = await db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').limit(MAX_ORDERS_IN_RANGE).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  };
  const text = (v) => String(v ?? '').toLowerCase();

  return {
    async searchProducts({ query, category, visibility = 'all', inStockOnly = false, limit = 25 } = {}) {
      const q = text(query).trim();
      const cat = text(category).trim();
      const rows = (await products())
        .map(({ id, data }) => ({ ...productSummary(id, data, baseUrl), _hay: `${text(data.name)} ${text(data.nameAr)} ${text(data.barcode)} ${id.toLowerCase()}` }))
        .filter((p) => (!q || p._hay.includes(q)) && (!cat || p.categories.some((c) => c.toLowerCase() === cat)))
        .filter((p) => visibility === 'all' || (visibility === 'visible' ? p.visible : !p.visible))
        .filter((p) => !inStockOnly || p.stock > 0);
      return { total: rows.length, products: rows.slice(0, Math.min(Math.max(1, limit), 100)).map(({ _hay, ...p }) => p) };
    },

    async getProduct(productId) {
      const snap = await db.collection('products').doc(String(productId)).get();
      return snap.exists ? productDetail(snap.id ?? String(productId), snap.data() ?? {}, baseUrl) : null;
    },

    async lowStock({ threshold = 2, includeHidden = false } = {}) {
      const out = [];
      for (const { id, data } of await products()) {
        if (!includeHidden && data.visible === false) continue;
        const detail = productDetail(id, data, baseUrl);
        const cells = detail.colors.length
          ? detail.colors.flatMap((c) => Object.entries(c.stockBySize).map(([size, qty]) => ({ color: c.name, size, qty })))
          : Object.keys(detail.stockBySize).length
            ? Object.entries(detail.stockBySize).map(([size, qty]) => ({ color: null, size, qty }))
            : [{ color: null, size: null, qty: detail.stock }];
        const low = cells.filter((c) => c.qty <= threshold);
        if (low.length) out.push({ id, name: detail.name, visible: detail.visible, totalStock: detail.stock, low, url: detail.url });
      }
      return { threshold, products: out.sort((a, b) => a.totalStock - b.totalStock).slice(0, 200) };
    },

    async listOrders({ from, to, status, source, query, limit = 25 } = {}) {
      const range = resolveRange({ from, to });
      if (!range.ok) return { error: range.message };
      const q = text(query).trim();
      const rows = (await ordersBetween(range.start, range.end))
        .map(({ id, data }) => ({ summary: orderSummary(id, data), hay: `${id.toLowerCase()} ${text(data.customerName)} ${text(data.customerPhone)} ${text(data.email)}` }))
        .filter(({ summary }) => (!status || summary.status === String(status).toLowerCase()) && (!source || summary.source === source))
        .filter(({ hay }) => !q || hay.includes(q.replace(/^#/, '')))
        .map(({ summary }) => summary);
      return { from: range.from, to: range.to, total: rows.length, orders: rows.slice(0, Math.min(Math.max(1, limit), 100)) };
    },

    async getOrder(orderId) {
      const snap = await db.collection('orders').doc(String(orderId)).get();
      return snap.exists ? orderDetail(snap.id ?? String(orderId), snap.data() ?? {}, baseUrl) : null;
    },

    async salesReport({ from, to } = {}) {
      const range = resolveRange({ from, to });
      if (!range.ok) return { error: range.message };
      const orders = await ordersBetween(range.start, range.end);
      return { from: range.from, to: range.to, currency: 'ILS', ...buildSalesReport(orders), truncated: orders.length >= MAX_ORDERS_IN_RANGE };
    },

    async visitorAnalytics({ from, to } = {}) {
      if (!analytics) return { error: 'Visitor analytics are not available.' };
      const range = resolveRange({ from, to });
      if (!range.ok) return { error: range.message };
      const owner = { ok: true };
      const [summary, live] = await Promise.all([
        analytics.handleSummary(analytics.getStore, owner, { from: range.from, to: range.to }),
        analytics.handleLive(analytics.getStore, owner),
      ]);
      if (summary.status !== 200) return { error: summary.body?.message ?? 'Analytics are unavailable.' };
      const { ok: _ok, ...data } = summary.body;
      return { ...data, liveVisitorsNow: live.status === 200 ? live.body.live : null, liveWindowMinutes: live.body?.windowMinutes ?? 5 };
    },
  };
}
