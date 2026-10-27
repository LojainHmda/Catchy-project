import type { OrderListBucket, OrderRecord, OrderStatus } from '../../types/order';
import { CANCELLED_ORDER_STATUS, NEEDS_REVIEW_BUCKET } from '../../types/order';
import type { CsvCell } from '../csv';
import { customerKey } from './orderCustomerSummary';
import { isCoordinateCartId } from '../coordinateCart';
import { normalizeSearchText, toLatinDigits } from './searchText';
import { orderHasReturns, orderListBucket, returnLineKey, shortOrderId } from './orderUtils';

// ── Status buckets ───────────────────────────────────────────────────────────

/**
 * Count of orders per admin list bucket (exact stored status, or "needs_review").
 * `all` is the total. An unknown stored status is NEVER counted as 'pending'.
 */
export function countOrdersByBucket(
  orders: Pick<OrderRecord, 'status' | 'statusNeedsReview'>[]
): Record<'all' | OrderListBucket, number> {
  const counts = { all: orders.length } as Record<'all' | OrderListBucket, number>;
  for (const order of orders) {
    const bucket = orderListBucket(order);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

// ── Search ───────────────────────────────────────────────────────────────────

/**
 * Comparable core of a phone number: digits only (Arabic-Indic digits count),
 * without an international prefix (00 / 970 / 972) or a trunk 0 — so
 * "059-123 4567", "+970591234567", "00972591234567" and "٠٥٩١٢٣٤٥٦٧" all
 * reduce to "591234567".
 */
export function phoneDigitsCore(raw: string | null | undefined): string {
  let digits = toLatinDigits(String(raw ?? '')).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('970') || digits.startsWith('972')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

/**
 * Free-text match over order id, customer, email, address — plus phone numbers by
 * digits. Arabic spelling variants (alef forms, ى/ي, ة/ه, diacritics) and
 * Arabic-Indic digits match their plain forms.
 */
export function orderMatchesSearch(order: OrderRecord, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;

  const text = [
    order.id,
    shortOrderId(order.id),
    order.userId,
    order.customerEmail,
    order.customerName,
    order.customerPhone,
    order.deliveryAddress,
  ];
  if (text.some((value) => value && normalizeSearchText(value).includes(q))) return true;

  // Phone by digits: needs at least 3 digits so short numbers don't match everything.
  const qDigits = phoneDigitsCore(q);
  if (qDigits.length >= 3 && /^[\d\s()+\-.]+$/.test(q)) {
    return phoneDigitsCore(order.customerPhone).includes(qDigits);
  }
  return false;
}

// ── Date ranges (local time) ─────────────────────────────────────────────────

export type DateRangePreset = 'all' | 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';
export type DateRange = { start: Date | null; end: Date | null }; // [start, end)

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Parses an `<input type="date">` value (YYYY-MM-DD) as a local date. */
export function parseDateInput(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Half-open [start, end) range for a preset. "7d" / "30d" include today.
 * Custom: both dates inclusive (end is moved to the start of the following day).
 */
export function resolveDateRange(
  preset: DateRangePreset,
  now: Date = new Date(),
  custom?: { from?: string | null; to?: string | null }
): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case 'today':
      return { start: today, end: addDays(today, 1) };
    case '7d':
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case '30d':
      return { start: addDays(today, -29), end: addDays(today, 1) };
    case 'thisMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: addDays(today, 1) };
    case 'lastMonth':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    case 'custom': {
      const from = parseDateInput(custom?.from);
      const to = parseDateInput(custom?.to);
      return { start: from, end: to ? addDays(to, 1) : null };
    }
    default:
      return { start: null, end: null };
  }
}

export function orderInDateRange(order: Pick<OrderRecord, 'createdAt'>, range: DateRange): boolean {
  if (!range.start && !range.end) return true;
  const time = order.createdAt?.getTime();
  if (time == null) return false;
  if (range.start && time < range.start.getTime()) return false;
  if (range.end && time >= range.end.getTime()) return false;
  return true;
}

// ── Sorting & paging ─────────────────────────────────────────────────────────

export type OrderSortKey = 'date' | 'total' | 'status' | 'customer';
export type SortDirection = 'asc' | 'desc';

// "Needs review" sorts first: those orders need a person to look at them.
const STATUS_SORT_ORDER: OrderListBucket[] = [
  NEEDS_REVIEW_BUCKET, 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled',
];

/** Stable sort; ties fall back to newest first. Returns a new array. */
export function sortOrders(orders: OrderRecord[], key: OrderSortKey, direction: SortDirection): OrderRecord[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byDateDesc = (a: OrderRecord, b: OrderRecord) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  const compare = (a: OrderRecord, b: OrderRecord): number => {
    switch (key) {
      case 'total':
        return a.total - b.total;
      case 'status':
        return STATUS_SORT_ORDER.indexOf(orderListBucket(a)) - STATUS_SORT_ORDER.indexOf(orderListBucket(b));
      case 'customer':
        return (a.customerName ?? '').localeCompare(b.customerName ?? '', undefined, { sensitivity: 'base' });
      default:
        return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    }
  };
  return orders
    .map((order, index) => ({ order, index }))
    .sort((a, b) => sign * compare(a.order, b.order) || byDateDesc(a.order, b.order) || a.index - b.index)
    .map((entry) => entry.order);
}

export const ORDERS_PAGE_SIZE = 50;

export function pageCount(total: number, pageSize = ORDERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** 1-based page, clamped into range. */
export function paginate<T>(items: T[], page: number, pageSize = ORDERS_PAGE_SIZE): T[] {
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount(items.length, pageSize));
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

// ── Status changes ───────────────────────────────────────────────────────────

/** Statuses an admin can set by hand on a web order. Cancelling has its own server flow. */
export const WEB_MANUAL_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

/** Statuses a web order can be cancelled from (must match server/lib/webOrderCancel.js). */
export const WEB_CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped'];

/** Bulk changes are limited to moving orders forward through fulfilment. */
export const BULK_STATUS_TARGETS: OrderStatus[] = ['processing', 'shipped', 'delivered'];

/**
 * Whether an admin may set `to` on an order by hand.
 *  - cancelled and completed orders are final;
 *  - nobody sets 'cancelled' here (it must go through cancelWebOrder so stock is restored);
 *  - POS sales are managed by the POS correct/cancel tools, not by status changes;
 *  - 'completed' is the POS end state and is never set on a web order;
 *  - once any return was logged, the order can only move forward (a backward move
 *    would make it cancellable/editable again and its returned units restockable twice).
 */
export function canChangeOrderStatus(
  order: Pick<OrderRecord, 'status' | 'source'> & Partial<Pick<OrderRecord, 'returnSummary'>>,
  to: OrderStatus
): boolean {
  if (order.status === to) return false;
  if (order.status === CANCELLED_ORDER_STATUS || order.status === 'completed') return false;
  if ((order.source ?? 'web') === 'pos') return false;
  if (!WEB_MANUAL_STATUSES.includes(to)) return false;
  if (orderHasReturns(order) && WEB_MANUAL_STATUSES.indexOf(to) < WEB_MANUAL_STATUSES.indexOf(order.status)) {
    return false;
  }
  return true;
}

/**
 * Mirrors the server's checks. Unrecognised legacy statuses (listed under "Needs
 * review"), orders that already carry a cancellation record and orders with
 * returns on the shelf are never offered cancellation — the server refuses all
 * three (NOT_CANCELLABLE / PREVIOUSLY_CANCELLED / HAS_RETURNS).
 */
export function canCancelWebOrder(
  order: Pick<OrderRecord, 'status' | 'source' | 'statusUnrecognized' | 'cancellation'> &
    Partial<Pick<OrderRecord, 'returnSummary'>>
): boolean {
  return (
    (order.source ?? 'web') === 'web' &&
    !order.statusUnrecognized &&
    !order.cancellation &&
    !orderHasReturns(order) &&
    WEB_CANCELLABLE_STATUSES.includes(order.status)
  );
}

// ── Returns shelf ────────────────────────────────────────────────────────────

/** Web order statuses the returns shelf accepts (must match server/lib/webOrderReturn.js). */
export const RETURNABLE_ORDER_STATUSES: OrderStatus[] = ['shipped', 'delivered'];

/** Whether "Process return" is offered. The server re-checks everything. */
export function canStartWebReturn(
  order: Pick<OrderRecord, 'status' | 'source' | 'statusUnrecognized' | 'statusNeedsReview' | 'cancellation'>
): boolean {
  return (
    (order.source ?? 'web') === 'web' &&
    !order.statusUnrecognized &&
    !order.cancellation &&
    RETURNABLE_ORDER_STATUSES.includes(order.status)
  );
}

export type ReturnableLine = {
  key: string;
  productId: string;
  colorId: string | null;
  colorName: string | null;
  size: string | null;
  name: string;
  image: string;
  ordered: number;
  alreadyReturned: number;
  remaining: number;
};

/**
 * One row per product/colour/size on the order (duplicate lines are summed, like
 * the server's cap) with how many units can still be returned. Coordinate-set
 * lines are listed separately as excluded.
 */
export function returnableLinesFor(order: Pick<OrderRecord, 'items'> & Partial<Pick<OrderRecord, 'returnSummary'>>): {
  lines: ReturnableLine[];
  excludedCoordinateLines: OrderRecord['items'];
} {
  const lines = new Map<string, ReturnableLine>();
  const excludedCoordinateLines: OrderRecord['items'] = [];
  const returned = order.returnSummary?.returnedQtyByKey ?? {};
  for (const item of order.items) {
    if (isCoordinateCartId(item.productId)) {
      excludedCoordinateLines.push(item);
      continue;
    }
    if (!item.productId || item.quantity < 1) continue;
    const key = returnLineKey(item);
    const existing = lines.get(key);
    if (existing) existing.ordered += item.quantity;
    else {
      lines.set(key, {
        key,
        productId: item.productId,
        colorId: item.colorId ?? null,
        colorName: item.colorName ?? null,
        size: item.size ?? null,
        name: item.name,
        image: item.image,
        ordered: item.quantity,
        alreadyReturned: 0,
        remaining: 0,
      });
    }
  }
  for (const line of lines.values()) {
    line.alreadyReturned = Math.min(line.ordered, returned[line.key] ?? 0);
    line.remaining = Math.max(0, line.ordered - line.alreadyReturned);
  }
  return { lines: [...lines.values()], excludedCoordinateLines };
}

export type BulkSkipReason = 'final' | 'pos' | 'same' | 'notAllowed';

/** Why an order would be skipped by a bulk change to `to` (null = eligible). */
export function bulkStatusSkipReason(order: Pick<OrderRecord, 'status' | 'source'>, to: OrderStatus): BulkSkipReason | null {
  if (!BULK_STATUS_TARGETS.includes(to)) return 'notAllowed';
  if ((order.source ?? 'web') === 'pos') return 'pos';
  if (order.status === CANCELLED_ORDER_STATUS || order.status === 'completed') return 'final';
  if (order.status === to) return 'same';
  return canChangeOrderStatus(order, to) ? null : 'notAllowed';
}

// ── Customer history inside an order ─────────────────────────────────────────

export type CustomerHistory = {
  orders: OrderRecord[]; // the customer's other orders, newest first
  orderCount: number; // including the current order
  totalSpent: number; // excludes cancelled orders, includes the current one
  cancelledCount: number;
  /** Orders of this customer with at least one return logged on the returns shelf. */
  returnedOrderCount: number;
  firstOrderAt: Date | null;
};

/**
 * Same grouping as the Customers page (customerKey). Walk-in POS sales are
 * excluded: they carry the *cashier's* uid as userId, so without a phone they
 * would otherwise look like that cashier's purchase history.
 */
export function customerHistoryFor(order: OrderRecord, allOrders: OrderRecord[]): CustomerHistory | null {
  const isWalkIn = (o: OrderRecord) => (o.source ?? 'web') === 'pos' && !o.customerPhone?.trim();
  if (isWalkIn(order)) return null;
  const key = customerKey(order);
  if (key.startsWith('order:')) return null;

  const matching = allOrders.filter((o) => !isWalkIn(o) && customerKey(o) === key);
  if (!matching.some((o) => o.id === order.id)) matching.push(order);

  const others = matching
    .filter((o) => o.id !== order.id)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  const times = matching.map((o) => o.createdAt?.getTime()).filter((t): t is number => t != null);

  return {
    orders: others,
    orderCount: matching.length,
    totalSpent: matching.reduce((sum, o) => (o.status === CANCELLED_ORDER_STATUS ? sum : sum + o.total), 0),
    cancelledCount: matching.filter((o) => o.status === CANCELLED_ORDER_STATUS).length,
    returnedOrderCount: matching.filter((o) => orderHasReturns(o)).length,
    firstOrderAt: times.length ? new Date(Math.min(...times)) : null,
  };
}

// ── CSV export ───────────────────────────────────────────────────────────────

export function ordersCsvRows(orders: OrderRecord[]): CsvCell[][] {
  const header = [
    'Order ID', 'Order', 'Created', 'Source', 'Status', 'Customer', 'Phone', 'Email', 'Zone', 'Address',
    'Items', 'Subtotal', 'Shipping', 'Discount', 'Total', 'Payment', 'Cashier', 'Status changed by', 'Admin note',
  ];
  const rows = orders.map((o) => [
    o.id,
    shortOrderId(o.id),
    o.createdAt ? o.createdAt.toISOString() : '',
    o.source ?? 'web',
    // A non-canonical stored status is exported as-is, never as a guessed normalised status.
    o.statusNeedsReview ? `${NEEDS_REVIEW_BUCKET} (${o.rawStatus ?? ''})` : o.status,
    o.customerName ?? '',
    o.customerPhone ?? '',
    o.customerEmail ?? '',
    o.deliveryZone ?? '',
    o.deliveryAddress ?? '',
    o.itemCount,
    o.subtotal,
    o.shippingCost,
    o.discount?.amount ?? 0,
    o.total,
    o.payment?.method ?? '',
    o.cashierName ?? '',
    o.statusUpdatedByName ?? '',
    o.adminNote ?? '',
  ]);
  return [header, ...rows];
}
