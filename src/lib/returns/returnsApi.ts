// Returns shelf client. Reads come straight from Firestore (owner-readable);
// every write goes to the owner-only server endpoints (server/lib/webOrderReturn.js).
import { auth, collection, db, getDocs, limit, orderBy, query, where } from '../../firebase';
import { toDate } from '../orders/orderUtils';
import {
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  RETURN_STATUSES,
  type RestockSkipReason,
  type ReturnDisposition,
  type ReturnHistoryEntry,
  type ReturnReason,
  type ReturnRecord,
  type ReturnStatus,
} from '../../types/returns';

export class ReturnsApiError extends Error {
  readonly code: string;
  readonly skipReason: RestockSkipReason | null;
  readonly remaining: number | null;
  constructor(code: string, message: string, extra: { skipReason?: unknown; remaining?: unknown } = {}) {
    super(message);
    this.name = 'ReturnsApiError';
    this.code = code;
    this.skipReason = isSkipReason(extra.skipReason) ? extra.skipReason : null;
    this.remaining = typeof extra.remaining === 'number' ? extra.remaining : null;
  }
}

const SKIP_REASONS: RestockSkipReason[] = ['coordinate_set', 'product_missing', 'variant_missing', 'size_missing'];

function isSkipReason(value: unknown): value is RestockSkipReason {
  return SKIP_REASONS.includes(value as RestockSkipReason);
}

function dateOf(value: unknown): Date | null {
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return toDate(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseHistory(raw: unknown): ReturnHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      at: dateOf(h.at),
      byUid: String(h.byUid ?? ''),
      byName: str(h.byName),
      action: h.action === 'resolved' ? 'resolved' : h.action === 'inspected' ? 'inspected' : 'received',
      ...(RETURN_STATUSES.includes(h.status as ReturnStatus) ? { status: h.status as ReturnStatus } : {}),
      ...(RETURN_DISPOSITIONS.includes(h.disposition as ReturnDisposition)
        ? { disposition: h.disposition as ReturnDisposition }
        : {}),
      ...(h.notesUpdated === true ? { notesUpdated: true } : {}),
      ...(isSkipReason(h.restockSkipReason) ? { restockSkipReason: h.restockSkipReason } : {}),
    }));
}

/** Tolerant parser for a `returns` document (Firestore data or the server's JSON). */
export function parseReturnRecord(id: string, data: Record<string, unknown>): ReturnRecord {
  return {
    id,
    orderId: String(data.orderId ?? ''),
    orderStatusAtIntake: str(data.orderStatusAtIntake),
    customerName: str(data.customerName),
    customerPhone: str(data.customerPhone),
    lineKey: String(data.lineKey ?? ''),
    productId: String(data.productId ?? ''),
    colorId: str(data.colorId),
    colorName: str(data.colorName),
    size: str(data.size),
    productName: String(data.productName ?? 'Item'),
    image: typeof data.image === 'string' ? data.image : '',
    quantity: Math.max(0, Math.floor(Number(data.quantity) || 0)),
    reason: RETURN_REASONS.includes(data.reason as ReturnReason) ? (data.reason as ReturnReason) : null,
    note: str(data.note),
    status: RETURN_STATUSES.includes(data.status as ReturnStatus) ? (data.status as ReturnStatus) : 'quarantine',
    disposition: RETURN_DISPOSITIONS.includes(data.disposition as ReturnDisposition)
      ? (data.disposition as ReturnDisposition)
      : null,
    inspectionNotes: str(data.inspectionNotes),
    restockApplied: data.restockApplied === true,
    restockSkipReason: isSkipReason(data.restockSkipReason) ? data.restockSkipReason : null,
    resolutionNote: str(data.resolutionNote),
    createdAt: dateOf(data.createdAt),
    createdByName: str(data.createdByName),
    updatedAt: dateOf(data.updatedAt),
    resolvedAt: dateOf(data.resolvedAt),
    resolvedByName: str(data.resolvedByName),
    history: parseHistory(data.history),
  };
}

const RETURNS_LIST_LIMIT = 500;

/** Newest first, capped (the shelf is a working list, not an archive). */
export async function fetchReturns(): Promise<ReturnRecord[]> {
  const snap = await getDocs(query(collection(db, 'returns'), orderBy('createdAt', 'desc'), limit(RETURNS_LIST_LIMIT)));
  return snap.docs.map((d) => parseReturnRecord(d.id, d.data() as Record<string, unknown>));
}

/** Single-field equality → Firestore's automatic index; sorted client-side. */
export async function fetchReturnsForOrder(orderId: string): Promise<ReturnRecord[]> {
  const snap = await getDocs(query(collection(db, 'returns'), where('orderId', '==', orderId)));
  return snap.docs
    .map((d) => parseReturnRecord(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** Random, URL-safe idempotency key accepted by the server (/^[A-Za-z0-9_-]{8,80}$/). */
export function newIdempotencyKey(): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '');
}

const KNOWN_ERROR_KEYS: Record<string, string> = {
  NOT_RETURNABLE: 'admin.returns.error.notReturnable',
  QUANTITY_EXCEEDED: 'admin.returns.error.quantityExceeded',
  LINE_NOT_FOUND: 'admin.returns.error.lineNotFound',
  COORDINATE_SET_EXCLUDED: 'admin.returns.error.coordinateExcluded',
  IS_POS_SALE: 'admin.returns.error.posExcluded',
  ALREADY_RESOLVED: 'admin.returns.error.alreadyResolved',
  RESTOCK_NOT_POSSIBLE: 'admin.returns.error.restockNotPossible',
  ORDER_CANCELLED: 'admin.returns.error.orderCancelled',
  NOTE_REQUIRED: 'admin.returns.error.noteRequired',
  REASON_REQUIRED: 'admin.returns.error.reasonRequired',
  FORBIDDEN: 'admin.returns.error.forbidden',
};

async function post(path: string, payload: Record<string, unknown>, t: (key: string) => string): Promise<Record<string, unknown>> {
  const user = auth.currentUser;
  if (!user) throw new ReturnsApiError('NOT_SIGNED_IN', t('admin.posApi.notSignedIn'));
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown>;
  try {
    body = await response.json();
  } catch {
    throw new ReturnsApiError('UNKNOWN', t('admin.posApi.unexpectedResponse'));
  }
  if (!response.ok || body.ok !== true) {
    const code = String(body.code ?? 'UNKNOWN');
    const key = KNOWN_ERROR_KEYS[code];
    throw new ReturnsApiError(code, key ? t(key) : String(body.message ?? t('admin.posApi.requestFailed')), {
      skipReason: body.skipReason,
      remaining: body.remaining,
    });
  }
  return body;
}

function parseReturns(raw: unknown): ReturnRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
    .map((r) => parseReturnRecord(String(r.id), r));
}

export type ReturnIntakeLine = { productId: string; colorId: string | null; size: string | null; quantity: number };

/** Owner-only. Logs returned units into quarantine (no stock change). Safe to retry with the same key. */
export async function createReturnRequest(
  input: { orderId: string; lines: ReturnIntakeLine[]; reason: ReturnReason; note: string; idempotencyKey: string },
  t: (key: string) => string
): Promise<{ replayed: boolean; returns: ReturnRecord[] }> {
  const body = await post('/api/admin/returns/create', input, t);
  return { replayed: body.replayed === true, returns: parseReturns(body.returns) };
}

/** Owner-only. Inspection: quarantine ⇄ needs_repair and/or notes. Never touches stock. */
export async function updateReturnRequest(
  input: { returnId: string; status?: 'quarantine' | 'needs_repair'; inspectionNotes?: string | null },
  t: (key: string) => string
): Promise<ReturnRecord | null> {
  const body = await post('/api/admin/returns/update', input, t);
  const r = body.return as Record<string, unknown> | undefined;
  return r && typeof r.id === 'string' ? parseReturnRecord(r.id, r) : null;
}

/** Owner-only. Final disposition; 'restocked' puts the units back into sellable stock. */
export async function resolveReturnRequest(
  input: { returnId: string; disposition: ReturnDisposition; note: string; idempotencyKey: string },
  t: (key: string) => string
): Promise<{ replayed: boolean; record: ReturnRecord | null }> {
  const body = await post('/api/admin/returns/resolve', input, t);
  const r = body.return as Record<string, unknown> | undefined;
  return { replayed: body.replayed === true, record: r && typeof r.id === 'string' ? parseReturnRecord(r.id, r) : null };
}
