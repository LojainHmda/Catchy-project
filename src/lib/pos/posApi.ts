import { auth } from '../../firebase';
import type {
  PosSaleCancellationPayload,
  PosSaleCancellationResult,
  PosSaleCorrectionPayload,
  PosSaleCorrectionResult,
  PosSalePayload,
  PosSaleResult,
  RegisterSession,
} from '../../types/pos';
import type { CancellationLine } from '../../types/order';

export class PosApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PosApiError';
    this.code = code;
  }
}

/**
 * `t` is optional here on purpose: this file is shared by the admin-only
 * correct/cancel flows (which pass `t` so these fallbacks are localized) and
 * the POS terminal's own session/sale calls (out of scope for the admin i18n
 * pass — they keep seeing the original English fallback text unchanged).
 */
async function authHeader(t?: (key: string) => string): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new PosApiError('NOT_SIGNED_IN', t ? t('admin.posApi.notSignedIn') : 'You must be signed in.');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function postJson<T>(url: string, payload: unknown, t?: (key: string) => string): Promise<T> {
  const headers = await authHeader(t);
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new PosApiError('UNKNOWN', t ? t('admin.posApi.unexpectedResponse') : 'Unexpected response from server.');
  }

  if (!response.ok || body.ok !== true) {
    const fallback = t ? t('admin.posApi.requestFailed') : 'Request failed.';
    throw new PosApiError(String(body.code ?? 'UNKNOWN'), String(body.message ?? fallback));
  }
  return body as T;
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseSessionResponse(raw: Record<string, unknown>): RegisterSession {
  return {
    id: String(raw.id ?? ''),
    cashierUid: String(raw.cashierUid ?? ''),
    cashierEmail: typeof raw.cashierEmail === 'string' ? raw.cashierEmail : null,
    cashierName: typeof raw.cashierName === 'string' ? raw.cashierName : null,
    status: raw.status === 'closed' ? 'closed' : 'open',
    openedAt: toDateOrNull(raw.openedAt),
    closedAt: toDateOrNull(raw.closedAt),
    openingCashFloat: Number(raw.openingCashFloat) || 0,
    expectedCashAtClose: raw.expectedCashAtClose == null ? null : Number(raw.expectedCashAtClose),
    countedCashAtClose: raw.countedCashAtClose == null ? null : Number(raw.countedCashAtClose),
    cashVarianceAtClose: raw.cashVarianceAtClose == null ? null : Number(raw.cashVarianceAtClose),
    salesCount: Number(raw.salesCount) || 0,
    cashTotal: Number(raw.cashTotal) || 0,
    cardTotal: Number(raw.cardTotal) || 0,
    discountTotal: Number(raw.discountTotal) || 0,
    grossTotal: Number(raw.grossTotal) || 0,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  };
}

export async function openRegisterSession(openingCashFloat: number): Promise<RegisterSession> {
  const result = await postJson<Record<string, unknown>>('/api/pos/session/open', { openingCashFloat });
  return parseSessionResponse(result);
}

export async function closeRegisterSession(
  sessionId: string,
  countedCashAtClose: number,
  notes?: string
): Promise<RegisterSession> {
  const result = await postJson<{ session: Record<string, unknown> }>('/api/pos/session/close', {
    sessionId,
    countedCashAtClose,
    notes: notes ?? null,
  });
  return parseSessionResponse(result.session);
}

export async function submitPosSale(payload: PosSalePayload): Promise<PosSaleResult> {
  const result = await postJson<{ orderId: string; total: number; itemCount: number; changeGiven: number }>(
    '/api/pos/sale',
    payload
  );
  return {
    orderId: result.orderId,
    total: result.total,
    itemCount: result.itemCount,
    changeGiven: result.changeGiven,
  };
}

/** Admin-only — server independently re-checks this; a non-admin gets a clear 403 PosApiError. */
export async function correctPosSale(
  payload: PosSaleCorrectionPayload,
  t?: (key: string) => string
): Promise<PosSaleCorrectionResult> {
  const result = await postJson<{ total: number; itemCount: number; balanceDue: number; alreadyApplied: boolean; skippedLines?: unknown }>(
    '/api/pos/sale/correct',
    payload,
    t
  );
  return {
    total: result.total,
    itemCount: result.itemCount,
    balanceDue: result.balanceDue,
    alreadyApplied: result.alreadyApplied,
    skippedLines: Array.isArray(result.skippedLines) ? (result.skippedLines as CancellationLine[]) : [],
  };
}

/** Admin-only — server independently re-checks this; a non-admin gets a clear 403 PosApiError. */
export async function cancelPosSale(
  payload: PosSaleCancellationPayload,
  t?: (key: string) => string
): Promise<PosSaleCancellationResult> {
  const result = await postJson<{
    alreadyCancelled: boolean;
    refundDue: number;
    cancelledAt: string | null;
    cancelledByUid: string | null;
    cancelledByName: string | null;
    reason: string | null;
    registerSessionStatusAtCancellation: 'open' | 'closed' | null;
    skippedLines?: unknown;
  }>('/api/pos/sale/cancel', payload, t);
  return {
    alreadyCancelled: result.alreadyCancelled,
    refundDue: result.refundDue,
    cancelledAt: toDateOrNull(result.cancelledAt),
    cancelledByUid: result.cancelledByUid,
    cancelledByName: result.cancelledByName,
    reason: result.reason,
    registerSessionStatusAtCancellation: result.registerSessionStatusAtCancellation,
    skippedLines: Array.isArray(result.skippedLines) ? (result.skippedLines as CancellationLine[]) : [],
  };
}
