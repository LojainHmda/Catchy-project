import { auth } from '../../firebase';
import type { CancellationLine, OrderStatus, PosSaleCancellation, WebOrderDiscount } from '../../types/order';
import { normalizeOrderStatus, parseWebDiscount, toDate } from './orderUtils';

export class AdminOrderApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AdminOrderApiError';
    this.code = code;
  }
}

export type CancelWebOrderResult = {
  /** Someone (or an earlier, different attempt) had already cancelled it — nothing changed now. */
  alreadyCancelled: boolean;
  /** This exact attempt (same idempotency key) had already succeeded — e.g. the first response was lost. */
  replayed: boolean;
  cancellation: PosSaleCancellation | null;
};

function parseLines(raw: unknown): CancellationLine[] {
  return Array.isArray(raw) ? (raw as CancellationLine[]) : [];
}

function parseCancellation(raw: unknown): PosSaleCancellation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  // Dates arrive as ISO strings over JSON.
  const cancelledAt = typeof c.cancelledAt === 'string' ? new Date(c.cancelledAt) : toDate(c.cancelledAt);
  return {
    cancelledAt: cancelledAt && Number.isFinite(cancelledAt.getTime()) ? cancelledAt : null,
    cancelledByUid: String(c.cancelledByUid ?? ''),
    cancelledByName: typeof c.cancelledByName === 'string' ? c.cancelledByName : null,
    reason: typeof c.reason === 'string' ? c.reason : null,
    registerSessionStatusAtCancellation: null,
    previousStatus: typeof c.previousStatus === 'string' ? (normalizeOrderStatus(c.previousStatus) as OrderStatus) : null,
    restockApplied: c.restockApplied === true,
    restoredLines: parseLines(c.restoredLines),
    skippedLines: parseLines(c.skippedLines),
  };
}

/**
 * Owner-only. Cancels a web order and restores its stock in one server-side
 * transaction (server/lib/webOrderCancel.js). Safe to retry: an order that is
 * already cancelled is a no-op and stock is never restored twice.
 */
export async function cancelWebOrderRequest(
  input: { orderId: string; reason: string; restock: boolean; idempotencyKey: string },
  t: (key: string) => string
): Promise<CancelWebOrderResult> {
  const user = auth.currentUser;
  if (!user) throw new AdminOrderApiError('NOT_SIGNED_IN', t('admin.posApi.notSignedIn'));
  const token = await user.getIdToken();

  const response = await fetch('/api/admin/orders/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new AdminOrderApiError('UNKNOWN', t('admin.posApi.unexpectedResponse'));
  }
  if (!response.ok || body.ok !== true) {
    const code = String(body.code ?? 'UNKNOWN');
    const message =
      code === 'PREVIOUSLY_CANCELLED'
        ? t('admin.orders.webCancel.previouslyCancelled')
        : code === 'NOT_CANCELLABLE'
          ? t('admin.orders.webCancel.notCancellable')
          : code === 'HAS_RETURNS'
            ? t('admin.orders.webCancel.hasReturns')
            : String(body.message ?? t('admin.posApi.requestFailed'));
    throw new AdminOrderApiError(code, message);
  }
  return {
    alreadyCancelled: body.alreadyCancelled === true,
    replayed: body.replayed === true,
    cancellation: parseCancellation(body.cancellation),
  };
}

export type SetWebOrderDiscountResult = {
  webDiscount: WebOrderDiscount | null;
  subtotal: number;
  shippingCost: number;
  total: number;
};

const WEB_DISCOUNT_ERROR_KEYS: Record<string, string> = {
  NOT_EDITABLE: 'admin.orders.edit.orderNotEditable',
  ORDER_CHANGED: 'admin.orders.edit.orderChanged',
  NOT_WEB_ORDER: 'admin.orders.webDiscount.error.notWebOrder',
  EXCEEDS_SUBTOTAL: 'admin.orders.webDiscount.error.EXCEEDS_SUBTOTAL',
  REASON_REQUIRED: 'admin.orders.webDiscount.error.REASON_REQUIRED',
  INVALID_VALUE: 'admin.orders.webDiscount.error.INVALID_VALUE',
  MISSING_TOTALS: 'admin.orders.webDiscount.error.missingTotals',
  FORBIDDEN: 'admin.orders.webDiscount.error.forbidden',
};

/**
 * Owner-only. Applies, changes (`discount` set) or removes (`discount: null`) the admin
 * fixed-amount (ILS) discount on a web order; the server validates it and recomputes the total in one
 * transaction (server/lib/webOrderDiscount.js). `expectedSubtotal` is the item subtotal
 * the admin saw — the server refuses with ORDER_CHANGED if the stored one differs.
 */
export async function setWebOrderDiscountRequest(
  input: {
    orderId: string;
    discount: { amount: number; reason: string } | null;
    expectedSubtotal: number;
  },
  t: (key: string) => string
): Promise<SetWebOrderDiscountResult> {
  const user = auth.currentUser;
  if (!user) throw new AdminOrderApiError('NOT_SIGNED_IN', t('admin.posApi.notSignedIn'));
  const token = await user.getIdToken();

  const response = await fetch('/api/admin/orders/discount', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new AdminOrderApiError('UNKNOWN', t('admin.posApi.unexpectedResponse'));
  }
  if (!response.ok || body.ok !== true) {
    const code = String(body.code ?? 'UNKNOWN');
    const key = WEB_DISCOUNT_ERROR_KEYS[code];
    throw new AdminOrderApiError(code, key ? t(key) : String(body.message ?? t('admin.posApi.requestFailed')));
  }
  return {
    webDiscount: parseWebDiscount(body.webDiscount),
    subtotal: Number(body.subtotal) || 0,
    shippingCost: Number(body.shippingCost) || 0,
    total: Number(body.total) || 0,
  };
}
