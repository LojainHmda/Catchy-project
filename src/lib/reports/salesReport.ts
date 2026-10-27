import type { OrderRecord, OrderStatus } from '../../types/order';
import { CANCELLED_ORDER_STATUS, ORDER_STATUSES } from '../../types/order';
import type { CsvCell } from '../csv';
import { customerKey } from '../orders/orderCustomerSummary';
import { orderInDateRange, type DateRange } from '../orders/orderListFilters';
import { parseLineItemDisplay, shortOrderId } from '../orders/orderUtils';

/**
 * Revenue definitions (shared by the Reports page and the dashboard):
 *  - booked    = every order except cancelled (the existing sumOrderRevenue rule);
 *  - fulfilled = delivered (web) + completed (POS) only.
 * Cancelled orders are reported separately and never counted as revenue.
 */
export const FULFILLED_STATUSES: OrderStatus[] = ['delivered', 'completed'];
export const OPEN_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped'];

export const isBooked = (o: Pick<OrderRecord, 'status'>) => o.status !== CANCELLED_ORDER_STATUS;
export const isFulfilled = (o: Pick<OrderRecord, 'status'>) => FULFILLED_STATUSES.includes(o.status);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type MoneyCount = { count: number; revenue: number };

export type DayPoint = { date: string; label: Date; orders: number; revenue: number };

export type ProductRow = { key: string; productId: string; name: string; color: string | null; quantity: number; revenue: number };

export type CustomerRow = { key: string; name: string; phone: string | null; orders: number; revenue: number };

export type SalesReport = {
  orderCount: number; // every order in range, cancelled included
  booked: MoneyCount;
  fulfilled: MoneyCount;
  cancelled: MoneyCount;
  open: MoneyCount; // pending + processing + shipped
  averageOrderValue: number; // booked revenue / booked orders
  itemsSold: number; // booked orders
  web: MoneyCount; // booked
  pos: MoneyCount; // booked
  posCash: number; // cash kept at the register: handed over minus change given
  posCard: number;
  posDiscounts: number;
  shippingCharged: number; // shipping fees on booked web orders — charged, NOT proof of payment
  byStatus: Record<OrderStatus, MoneyCount>;
  byZone: { zone: string; count: number; revenue: number }[]; // booked web orders
  byDay: DayPoint[];
  topProducts: ProductRow[];
  topCustomers: CustomerRow[];
};

/** Local-time YYYY-MM-DD. */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const MAX_CHART_DAYS = 92;

function dayPoints(orders: OrderRecord[], range: DateRange): DayPoint[] {
  const byKey = new Map<string, DayPoint>();
  const dated = orders.filter((o) => o.createdAt);
  const times = dated.map((o) => o.createdAt!.getTime());

  let start = range.start;
  let end = range.end; // exclusive
  if (!start) start = times.length ? new Date(Math.min(...times)) : null;
  if (!end) end = times.length ? new Date(Math.max(...times) + 1) : null;
  if (!start || !end) return [];

  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days: DayPoint[] = [];
  while (cursor.getTime() < end.getTime()) {
    const point = { date: localDayKey(cursor), label: new Date(cursor), orders: 0, revenue: 0 };
    days.push(point);
    byKey.set(point.date, point);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  for (const o of dated) {
    if (!isBooked(o)) continue;
    const point = byKey.get(localDayKey(o.createdAt!));
    if (!point) continue;
    point.orders += 1;
    point.revenue += o.total;
  }
  days.forEach((d) => (d.revenue = round2(d.revenue)));
  // Long ranges: keep the most recent MAX_CHART_DAYS so the chart stays readable.
  return days.length > MAX_CHART_DAYS ? days.slice(-MAX_CHART_DAYS) : days;
}

export function buildSalesReport(allOrders: OrderRecord[], range: DateRange, options: { topN?: number } = {}): SalesReport {
  const topN = options.topN ?? 10;
  const orders = allOrders.filter((o) => orderInDateRange(o, range));
  const booked = orders.filter(isBooked);
  const sum = (list: OrderRecord[]): MoneyCount => ({
    count: list.length,
    revenue: round2(list.reduce((s, o) => s + o.total, 0)),
  });

  const byStatus = Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, sum(orders.filter((o) => o.status === status))])
  ) as Record<OrderStatus, MoneyCount>;

  const bookedWeb = booked.filter((o) => (o.source ?? 'web') === 'web');
  const bookedPos = booked.filter((o) => o.source === 'pos');

  const zoneMap = new Map<string, { zone: string; count: number; revenue: number }>();
  for (const o of bookedWeb) {
    const zone = o.deliveryZone?.trim() || 'unknown';
    const row = zoneMap.get(zone) ?? { zone, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += o.total;
    zoneMap.set(zone, row);
  }

  const productMap = new Map<string, ProductRow>();
  for (const o of booked) {
    for (const item of o.items) {
      const display = parseLineItemDisplay(item);
      const color = item.colorName?.trim() || display.color || null;
      const key = `${item.productId}|${item.colorId ?? color ?? ''}`;
      const row = productMap.get(key) ?? { key, productId: item.productId, name: display.productName, color, quantity: 0, revenue: 0 };
      row.quantity += item.quantity;
      row.revenue += item.lineTotal;
      productMap.set(key, row);
    }
  }

  const customerMap = new Map<string, CustomerRow>();
  for (const o of booked) {
    // Walk-in POS sales carry the cashier's uid; they are not a customer.
    if (o.source === 'pos' && !o.customerPhone?.trim()) continue;
    const key = customerKey(o);
    const row = customerMap.get(key) ?? { key, name: o.customerName?.trim() || '', phone: o.customerPhone?.trim() || null, orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += o.total;
    if (o.customerName?.trim()) row.name = o.customerName.trim();
    customerMap.set(key, row);
  }

  const bookedTotals = sum(booked);
  return {
    orderCount: orders.length,
    booked: bookedTotals,
    fulfilled: sum(orders.filter(isFulfilled)),
    cancelled: sum(orders.filter((o) => !isBooked(o))),
    open: sum(orders.filter((o) => OPEN_STATUSES.includes(o.status))),
    averageOrderValue: bookedTotals.count ? round2(bookedTotals.revenue / bookedTotals.count) : 0,
    itemsSold: booked.reduce((s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0), 0),
    web: sum(bookedWeb),
    pos: sum(bookedPos),
    posCash: round2(bookedPos.reduce((s, o) => s + Math.max(0, (o.payment?.cashAmount ?? 0) - (o.payment?.changeGiven ?? 0)), 0)),
    posCard: round2(bookedPos.reduce((s, o) => s + (o.payment?.cardAmount ?? 0), 0)),
    posDiscounts: round2(bookedPos.reduce((s, o) => s + (o.discount?.amount ?? 0), 0)),
    shippingCharged: round2(bookedWeb.reduce((s, o) => s + (o.shippingCost || 0), 0)),
    byStatus,
    byZone: [...zoneMap.values()].map((z) => ({ ...z, revenue: round2(z.revenue) })).sort((a, b) => b.revenue - a.revenue),
    byDay: dayPoints(orders, range),
    topProducts: [...productMap.values()]
      .map((p) => ({ ...p, revenue: round2(p.revenue) }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, topN),
    topCustomers: [...customerMap.values()]
      .map((c) => ({ ...c, revenue: round2(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
      .slice(0, topN),
  };
}

/** Percent change from `previous` to `current`; null when there is no baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export function reportSummaryCsvRows(report: SalesReport, range: DateRange): CsvCell[][] {
  const day = (d: Date | null) => (d ? localDayKey(d) : '');
  const endInclusive = range.end ? new Date(range.end.getTime() - 1) : null;
  return [
    ['Metric', 'Value'],
    ['From', day(range.start)],
    ['To', day(endInclusive)],
    ['All orders (every status, cancelled included)', report.orderCount],
    ['Booked orders (excl. cancelled)', report.booked.count],
    ['Booked revenue', report.booked.revenue],
    ['Fulfilled orders (delivered/completed)', report.fulfilled.count],
    ['Fulfilled revenue', report.fulfilled.revenue],
    ['Open orders (pending/processing/shipped)', report.open.count],
    ['Cancelled orders', report.cancelled.count],
    ['Cancelled value', report.cancelled.revenue],
    ['Average order value', report.averageOrderValue],
    ['Items sold', report.itemsSold],
    ['Web orders', report.web.count],
    ['Web revenue', report.web.revenue],
    ['POS sales', report.pos.count],
    ['POS revenue', report.pos.revenue],
    ['POS cash (net of change)', report.posCash],
    ['POS card', report.posCard],
    ['POS discounts', report.posDiscounts],
    ['Shipping charged (booked web orders)', report.shippingCharged],
  ];
}

/** One row per order line in range (cancelled orders included, flagged by status). */
export function orderLinesCsvRows(allOrders: OrderRecord[], range: DateRange): CsvCell[][] {
  const header = ['Order ID', 'Order', 'Created', 'Source', 'Status', 'Customer', 'Product ID', 'Product', 'Color', 'Size', 'Quantity', 'Unit price', 'Line total'];
  const rows: CsvCell[][] = [header];
  for (const o of allOrders.filter((order) => orderInDateRange(order, range))) {
    for (const item of o.items) {
      const display = parseLineItemDisplay(item);
      rows.push([
        o.id,
        shortOrderId(o.id),
        o.createdAt ? o.createdAt.toISOString() : '',
        o.source ?? 'web',
        o.status,
        o.customerName ?? '',
        item.productId,
        display.productName,
        item.colorName ?? display.color ?? '',
        item.size ?? display.size ?? '',
        item.quantity,
        item.price,
        item.lineTotal,
      ]);
    }
  }
  return rows;
}
