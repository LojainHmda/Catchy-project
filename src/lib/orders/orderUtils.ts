import type {
  CancellationLine,
  OrderLineItem,
  OrderListBucket,
  OrderRecord,
  OrderStatus,
  PosDiscount,
  PosPayment,
  PosSaleCancellation,
  PosSaleCorrection,
} from '../../types/order';
import { CANCELLED_ORDER_STATUS, NEEDS_REVIEW_BUCKET, ORDER_STATUSES } from '../../types/order';
import type { OrderReturnSummary } from '../../types/returns';
import { getShippingCost } from '../shippingZones';

export const ORDER_STATUS_FLOW: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

export function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') return maybe.toDate();
  }
  if (value instanceof Date) return value;
  return null;
}

/**
 * Status used for transition/edit/cancel decisions (trim + lower-case, unknown → 'pending').
 * NOT used for admin list display or counts — see orderListBucket.
 */
export function normalizeOrderStatus(raw: unknown): OrderStatus {
  const status = String(raw ?? 'pending').trim().toLowerCase();
  return ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : 'pending';
}

/** True only when the stored value is exactly one of ORDER_STATUSES (what the app itself writes). */
export function isCanonicalOrderStatus(raw: unknown): raw is OrderStatus {
  return typeof raw === 'string' && ORDER_STATUSES.includes(raw as OrderStatus);
}

/**
 * Where an order is listed and counted in the admin: its exact stored status, or
 * NEEDS_REVIEW_BUCKET when that is not canonical. This is what keeps the Orders
 * page counts equal to the dashboard's exact `where('status', '==', 'pending')`.
 */
export function orderListBucket(order: Pick<OrderRecord, 'status' | 'statusNeedsReview'>): OrderListBucket {
  return order.statusNeedsReview ? NEEDS_REVIEW_BUCKET : order.status;
}

/**
 * True when the stored status is not one we recognise even after trim + lower-case
 * (e.g. a legacy "refunded"). Such orders are listed under "Needs review" and
 * must never be cancelled/restocked on a guess — the server refuses them too.
 */
export function isUnrecognizedOrderStatus(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false; // missing → pending, same as the server
  const status = String(raw).trim().toLowerCase();
  return status !== '' && !ORDER_STATUSES.includes(status as OrderStatus);
}

/** Whether the stored order already carries a cancellation audit record (stock was handled once). */
export function hasCancellationRecord(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const uid = (raw as Record<string, unknown>).cancelledByUid;
  return typeof uid === 'string' && uid.length > 0;
}

export function orderStatusStep(status: OrderStatus): number {
  if (status === 'cancelled') return 0;
  const index = ORDER_STATUS_FLOW.indexOf(status);
  return index >= 0 ? index + 1 : 1;
}

export function isOrderActive(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled' && status !== 'completed';
}

/**
 * Sums `total` across orders that still represent real revenue — i.e. every
 * status except 'cancelled'. Shared by every revenue figure so web and POS
 * totals stay consistent: a cancelled order (web — never fulfilled/paid; POS
 * — voided and its stock restored) contributes nothing, while a *corrected*
 * (but not cancelled) POS sale is counted at its current `total`, since that
 * field is always the server-recomputed, authoritative corrected total (see
 * posSaleCorrection.js) — there is nothing else to special-case here.
 */
export function sumOrderRevenue(orders: Pick<OrderRecord, 'status' | 'total'>[]): number {
  return orders.reduce((sum, order) => (order.status === CANCELLED_ORDER_STATUS ? sum : sum + order.total), 0);
}

export function formatOrderMoney(amount: number, locale = 'en-GB'): string {
  return `ILS ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatOrderDate(date: Date | null, locale = 'en-GB'): string {
  if (!date) return '—';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatOrderDateTime(date: Date | null, locale = 'en-GB'): string {
  if (!date) return '—';
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortOrderId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 8).toUpperCase()}` : `#${id.toUpperCase()}`;
}

/** Firestore docs are capped at 1 MiB — never persist base64 blobs on order line items. */
export function sanitizeStoredImageUrl(url: unknown): string {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s.slice(0, 2048);
  return s.length <= 512 ? s : '';
}

export function firstProductImageUrl(data: Record<string, unknown>): string {
  const images = data.images;
  if (!Array.isArray(images)) return '';
  const first = images.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
  return typeof first === 'string' ? first : '';
}

export function parseOrderLineItems(raw: unknown): OrderLineItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return {
          productId: '',
          name: String(entry),
          price: 0,
          quantity: 1,
          image: '',
          lineTotal: 0,
        };
      }

      const item = entry as Record<string, unknown>;
      const price = Number(item.price) || 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);

      return {
        productId: String(item.productId ?? item.id ?? ''),
        name: String(item.name ?? 'Item'),
        price,
        quantity,
        image: sanitizeStoredImageUrl(item.image),
        lineTotal: price * quantity,
        size: typeof item.size === 'string' && item.size.trim() ? item.size.trim() : null,
        colorId: typeof item.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
        colorName: typeof item.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
        itemSizes:
          item.itemSizes && typeof item.itemSizes === 'object' && !Array.isArray(item.itemSizes)
            ? (item.itemSizes as Record<string, string>)
            : undefined,
      };
    })
    .filter((item) => item.name.trim().length > 0);
}

/** Split stored line name into product title + color + size for display tables. */
export function parseLineItemDisplay(item: Pick<OrderLineItem, 'name' | 'size' | 'colorName'>) {
  let color = item.colorName?.trim() || null;
  let size = item.size?.trim() || null;
  let productName = item.name.trim();

  const suffixMatch = productName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (suffixMatch) {
    productName = suffixMatch[1]!.trim();
    if (!color && !size) {
      const inner = suffixMatch[2]!.trim();
      const parts = inner.split('/').map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        color = parts[0] ?? null;
        size = parts[1] ?? null;
      } else if (parts.length === 1) {
        size = parts[0] ?? null;
      }
    }
  }

  return { productName, color, size };
}

function parsePosPayment(raw: unknown): PosPayment | null {
  if (!raw || typeof raw !== 'object') return null;
  const payment = raw as Record<string, unknown>;
  const method = payment.method === 'card' ? 'card' : payment.method === 'split' ? 'split' : 'cash';
  return {
    method,
    cashAmount: Number(payment.cashAmount) || 0,
    cardAmount: Number(payment.cardAmount) || 0,
    changeGiven: Number(payment.changeGiven) || 0,
  };
}

function parsePosDiscount(raw: unknown): PosDiscount | null {
  if (!raw || typeof raw !== 'object') return null;
  const discount = raw as Record<string, unknown>;
  const amount = Number(discount.amount) || 0;
  if (amount <= 0) return null;
  return {
    mode: discount.mode === 'amount' ? 'amount' : 'percent',
    value: Number(discount.value) || 0,
    amount,
    reason: typeof discount.reason === 'string' && discount.reason.trim() ? discount.reason.trim() : null,
  };
}

function parseCorrectionBeforeSnapshot(raw: unknown): PosSaleCorrection['before'] {
  const snap = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    items: parseOrderLineItems(snap.items),
    subtotal: snap.subtotal == null ? null : Number(snap.subtotal) || 0,
    discount: parsePosDiscount(snap.discount),
    total: snap.total == null ? null : Number(snap.total) || 0,
  };
}

function parseCorrectionAfterSnapshot(raw: unknown): PosSaleCorrection['after'] {
  const snap = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    items: parseOrderLineItems(snap.items),
    subtotal: Number(snap.subtotal) || 0,
    discount: parsePosDiscount(snap.discount),
    total: Number(snap.total) || 0,
  };
}

/** Tolerant of any legacy/malformed entry — a corrupt correction entry is dropped, not fatal to the whole order. */
function parsePosSaleCorrections(raw: unknown): PosSaleCorrection[] {
  if (!Array.isArray(raw)) return [];
  const out: PosSaleCorrection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const correctedByUid = typeof e.correctedByUid === 'string' ? e.correctedByUid : '';
    if (!correctedByUid) continue;
    out.push({
      correctedAt: toDate(e.correctedAt),
      correctedByUid,
      correctedByName: typeof e.correctedByName === 'string' ? e.correctedByName : null,
      reason: typeof e.reason === 'string' ? e.reason : null,
      registerSessionStatusAtCorrection:
        e.registerSessionStatusAtCorrection === 'open' || e.registerSessionStatusAtCorrection === 'closed'
          ? e.registerSessionStatusAtCorrection
          : null,
      before: parseCorrectionBeforeSnapshot(e.before),
      after: parseCorrectionAfterSnapshot(e.after),
    });
  }
  return out;
}

const SKIP_REASONS: NonNullable<CancellationLine['reason']>[] = [
  'coordinate_set',
  'product_missing',
  'variant_missing',
  'size_missing',
  'not_restocked',
];

function parseCancellationLines(raw: unknown): CancellationLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CancellationLine[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const productId = typeof e.productId === 'string' ? e.productId : '';
    if (!productId) continue;
    const reason = SKIP_REASONS.find((r) => r === e.reason);
    out.push({
      productId,
      name: typeof e.name === 'string' ? e.name : null,
      colorId: typeof e.colorId === 'string' ? e.colorId : null,
      size: typeof e.size === 'string' ? e.size : null,
      quantity: Number(e.quantity) || 0,
      ...(reason ? { reason } : {}),
    });
  }
  return out;
}

/** Tolerant of a malformed/legacy entry — a corrupt cancellation record is dropped, not fatal to the whole order. */
function parsePosSaleCancellation(raw: unknown): PosSaleCancellation | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const cancelledByUid = typeof e.cancelledByUid === 'string' ? e.cancelledByUid : '';
  if (!cancelledByUid) return null;
  return {
    cancelledAt: toDate(e.cancelledAt),
    cancelledByUid,
    cancelledByName: typeof e.cancelledByName === 'string' ? e.cancelledByName : null,
    reason: typeof e.reason === 'string' ? e.reason : null,
    registerSessionStatusAtCancellation:
      e.registerSessionStatusAtCancellation === 'open' || e.registerSessionStatusAtCancellation === 'closed'
        ? e.registerSessionStatusAtCancellation
        : null,
    previousStatus:
      typeof e.previousStatus === 'string' && ORDER_STATUSES.includes(e.previousStatus as OrderStatus)
        ? (e.previousStatus as OrderStatus)
        : null,
    restockApplied: typeof e.restockApplied === 'boolean' ? e.restockApplied : undefined,
    restoredLines: parseCancellationLines(e.restoredLines),
    skippedLines: parseCancellationLines(e.skippedLines),
  };
}

/** Line identity for return caps — same key as server/lib/orderReturnState.js returnLineKey. */
export function returnLineKey(item: { productId: string; colorId?: string | null; size?: string | null }): string {
  return [item.productId, item.colorId ?? '', item.size ?? ''].join('|~|');
}

/** Malformed/negative values count as 0 (same sanitising as the server). */
export function parseReturnSummary(raw: unknown): OrderReturnSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const whole = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const returnedQtyByKey: Record<string, number> = {};
  if (r.returnedQtyByKey && typeof r.returnedQtyByKey === 'object' && !Array.isArray(r.returnedQtyByKey)) {
    for (const [key, qty] of Object.entries(r.returnedQtyByKey as Record<string, unknown>)) {
      const n = whole(qty);
      if (n > 0) returnedQtyByKey[key] = n;
    }
  }
  return {
    returnCount: whole(r.returnCount),
    openCount: whole(r.openCount),
    returnedQtyByKey,
    lastReturnAt: toDate(r.lastReturnAt),
  };
}

/** Same rule as server/lib/orderReturnState.js orderHasReturns. */
export function orderHasReturns(order: { returnSummary?: OrderReturnSummary | null } | null | undefined): boolean {
  const summary = order?.returnSummary;
  return !!summary && (summary.returnCount > 0 || Object.keys(summary.returnedQtyByKey).length > 0);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function parseOrderDocument(
  id: string,
  data: Record<string, unknown>,
  profile?: { email: string | null; displayName: string | null } | null
): OrderRecord {
  const items = parseOrderLineItems(data.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const userId = String(data.userId ?? '');
  const isGuest = data.isGuest === true || userId === 'guest';
  const itemsSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const subtotal = Number(data.subtotal) || itemsSubtotal;
  const deliveryZone =
    typeof data.deliveryZone === 'string' && data.deliveryZone.trim() ? data.deliveryZone.trim() : null;
  const shippingCost =
    Number.isFinite(Number(data.shippingCost)) && data.shippingCost !== null && data.shippingCost !== undefined
      ? Number(data.shippingCost)
      : deliveryZone
        ? getShippingCost(deliveryZone)
        : 0;
  const total = Number(data.total) || subtotal + shippingCost;

  return {
    id,
    userId,
    isGuest,
    customerEmail: profile?.email ?? (typeof data.email === 'string' ? data.email : null),
    customerName:
      profile?.displayName ?? (typeof data.customerName === 'string' ? data.customerName : null),
    customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : null,
    deliveryAddress: typeof data.deliveryAddress === 'string' ? data.deliveryAddress : null,
    deliveryZone,
    status: normalizeOrderStatus(data.status),
    statusUnrecognized: isUnrecognizedOrderStatus(data.status),
    rawStatus: typeof data.status === 'string' ? data.status : null,
    statusNeedsReview: !isCanonicalOrderStatus(data.status),
    subtotal,
    shippingCost,
    total,
    itemCount,
    createdAt: toDate(data.createdAt),
    items,
    source: data.source === 'pos' ? 'pos' : 'web',
    registerSessionId: typeof data.registerSessionId === 'string' ? data.registerSessionId : null,
    cashierUid: typeof data.cashierUid === 'string' ? data.cashierUid : null,
    cashierName: typeof data.cashierName === 'string' ? data.cashierName : null,
    payment: parsePosPayment(data.payment),
    discount: parsePosDiscount(data.discount),
    balanceDue: data.balanceDue == null ? null : Number(data.balanceDue) || 0,
    correctionCount: Number(data.correctionCount) || 0,
    corrections: parsePosSaleCorrections(data.corrections),
    cancellation: parsePosSaleCancellation(data.cancellation),
    statusUpdatedAt: toDate(data.statusUpdatedAt),
    statusUpdatedByUid: optionalString(data.statusUpdatedByUid),
    statusUpdatedByName: optionalString(data.statusUpdatedByName),
    adminNote: optionalString(data.adminNote),
    adminNoteUpdatedAt: toDate(data.adminNoteUpdatedAt),
    adminNoteUpdatedByName: optionalString(data.adminNoteUpdatedByName),
    returnSummary: parseReturnSummary(data.returnSummary),
  };
}

export function orderStatusTone(status: OrderListBucket): {
  badge: string;
  dot: string;
} {
  switch (status) {
    case NEEDS_REVIEW_BUCKET:
      return { badge: 'bg-rose-50 text-rose-700 ring-rose-600/30', dot: 'bg-rose-500' };
    case 'completed':
      return { badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' };
    case 'delivered':
      return { badge: 'bg-catchy/10 text-catchy-dark ring-catchy/20', dot: 'bg-catchy' };
    case 'shipped':
      return { badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' };
    case 'processing':
      return { badge: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' };
    case 'cancelled':
      return { badge: 'bg-gray-100 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400' };
    default:
      return { badge: 'bg-orange-50 text-orange-800 ring-orange-600/20', dot: 'bg-orange-500' };
  }
}
