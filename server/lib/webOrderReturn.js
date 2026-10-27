// Returns shelf for WEB orders (owner-only, Admin SDK transactions).
//
//   intake    createWebReturn   shipped/delivered web order → one `returns` doc per
//                               returned line, status 'quarantine'. Stock is NOT
//                               touched: the units were deducted at checkout and stay
//                               out of sellable stock while they sit on the shelf.
//   inspect   updateWebReturn   quarantine ⇄ needs_repair, inspection notes.
//   resolve   resolveWebReturn  final, one of:
//               restocked      — sellable: the exact product/colour/size gets the
//                                quantity back (same writer as web cancellation);
//               damaged        — not sellable, stock unchanged;
//               manual_review  — closed without any stock change, note required
//                                (e.g. the product/colour/size no longer exists).
//
// Safety:
//   - every operation re-reads the order/return inside the transaction and is
//     retry-safe (no side effects outside `tx`);
//   - cumulative cap per line: the order's `returnSummary.returnedQtyByKey` is
//     updated in the SAME transaction as the return docs, so concurrent intakes
//     serialise on the order document and can never exceed what was ordered
//     (duplicate lines of the same product/colour/size are summed);
//   - idempotency: intake doc ids derive from the client's idempotency key (a
//     retried request finds its own docs and changes nothing); a resolution is
//     final — a second resolve is refused unless it is the same attempt replayed;
//   - restock never re-creates a missing product, colour or size: it refuses with
//     RESTOCK_NOT_POSSIBLE + the skip reason, and the admin chooses damaged or
//     manual review instead;
//   - POS sales and coordinate-set lines are excluded from this first version;
//   - an order with returns can no longer be cancelled, moved backwards or have
//     its items edited (webOrderCancel.js / orderService.ts / orderListFilters.ts),
//     so the same units can never be restocked twice;
//   - no money is recorded: no refunds, no store credit, totals and revenue unchanged;
//   - a restock writes `stockMovements` ledger entries in the same transaction.

import { computeStockWrites } from './posSaleCorrection.js';
import { normalizeStoredStatus, restoreSkipReason } from './webOrderCancel.js';
import { readReturnSummary, returnLineKey } from './orderReturnState.js';
import { stockMovementEntries } from './stockLedger.js';

export const RETURNABLE_ORDER_STATUSES = ['shipped', 'delivered'];
export const RETURN_REASONS = ['wrong_size', 'wrong_color', 'defective', 'not_as_described', 'changed_mind', 'other'];
export const RETURN_STATUSES = ['quarantine', 'needs_repair', 'resolved'];
export const RETURN_DISPOSITIONS = ['restocked', 'damaged', 'manual_review'];

const KNOWN_ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'];
const COORDINATE_CART_PREFIX = 'coord:';
const MAX_LINES_PER_INTAKE = 20;
const MAX_QTY_PER_LINE = 999;
const MAX_HISTORY = 50;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

const MESSAGES = {
  FORBIDDEN: 'Not authorized.',
  INVALID_REQUEST: 'The request is missing required information.',
  REASON_REQUIRED: 'Choose a reason for the return.',
  NOTE_REQUIRED: 'A note is required for this outcome.',
  ORDER_NOT_FOUND: 'This order could not be found.',
  RETURN_NOT_FOUND: 'This return could not be found.',
  IS_POS_SALE: 'POS sales are not handled by the returns shelf.',
  COORDINATE_SET_EXCLUDED: 'Coordinate-set lines cannot be returned through the returns shelf yet.',
  NOT_RETURNABLE: 'Only shipped or delivered website orders can be returned.',
  LINE_NOT_FOUND: 'One of the returned items is not on this order.',
  QUANTITY_EXCEEDED: 'More units than were ordered (minus earlier returns) were requested.',
  IDEMPOTENCY_CONFLICT: 'This request id was already used for a different order. Please try again.',
  ALREADY_RESOLVED: 'This return was already resolved. Its outcome is final.',
  RESTOCK_NOT_POSSIBLE: 'This item cannot be restocked automatically. Resolve it as damaged or for manual review.',
  ORDER_CANCELLED: 'The order was cancelled, so this return cannot be restocked. Resolve it as damaged or for manual review.',
};

class ReturnError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

const fail = (code, details = {}) => ({ ok: false, code, message: MESSAGES[code] ?? 'Request failed.', ...details });

function cleanText(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function cleanKey(value) {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value.trim()) ? value.trim() : null;
}

function isCoordinateId(productId) {
  return typeof productId === 'string' && productId.startsWith(COORDINATE_CART_PREFIX);
}

function hasCancellationRecord(order) {
  const c = order?.cancellation;
  return !!c && typeof c === 'object' && typeof c.cancelledByUid === 'string' && c.cancelledByUid.length > 0;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
}

/** JSON-safe copy of a return document (dates → ISO strings). */
export function serializeReturn(id, data) {
  if (!data) return null;
  return {
    id,
    ...data,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    resolvedAt: toIso(data.resolvedAt),
    history: Array.isArray(data.history) ? data.history.map((h) => ({ ...h, at: toIso(h.at) })) : [],
  };
}

/** The selection (product/colour/size) a request line refers to, or null when malformed. */
function parseRequestLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const productId = typeof raw.productId === 'string' ? raw.productId.trim() : '';
  const quantity = raw.quantity;
  if (!productId || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY_PER_LINE) {
    return null;
  }
  return {
    productId,
    colorId: typeof raw.colorId === 'string' && raw.colorId.trim() ? raw.colorId.trim() : null,
    size: typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim() : null,
    quantity,
  };
}

/** Ordered quantity + display data per line key (coordinate-set lines are not returnable). */
export function returnableOrderLines(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object' || isCoordinateId(item.productId)) continue;
    const quantity = Number(item.quantity);
    if (!(quantity > 0)) continue;
    const selection = {
      productId: String(item.productId ?? '').trim(),
      colorId: typeof item.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
      size: typeof item.size === 'string' && item.size.trim() ? item.size.trim() : null,
    };
    if (!selection.productId) continue;
    const key = returnLineKey(selection);
    const existing = lines.get(key);
    if (existing) existing.ordered += Math.floor(quantity);
    else {
      lines.set(key, {
        ...selection,
        ordered: Math.floor(quantity),
        name: typeof item.name === 'string' ? item.name : 'Item',
        colorName: typeof item.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
        image: typeof item.image === 'string' ? item.image.slice(0, 2048) : '',
        price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
      });
    }
  }
  return lines;
}

function historyEntry(at, actorUid, actorName, action, extra = {}) {
  return { at, byUid: actorUid, byName: actorName || null, action, ...extra };
}

function appendHistory(existing, entry) {
  const list = Array.isArray(existing) ? existing : [];
  return [...list, entry].slice(-MAX_HISTORY);
}

/**
 * Intake: log returned units into quarantine. No stock change.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, orderId: string,
 *           lines: {productId: string, colorId?: string|null, size?: string|null, quantity: number}[],
 *           reason: string, note?: string, idempotencyKey: string }} input
 */
export async function createWebReturn(db, { actorUid, actorName, orderId, lines, reason, note, idempotencyKey }) {
  if (!actorUid) return fail('FORBIDDEN');
  const id = typeof orderId === 'string' ? orderId.trim() : '';
  const key = cleanKey(idempotencyKey);
  if (!id || !key || !Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES_PER_INTAKE) {
    return fail('INVALID_REQUEST');
  }
  if (!RETURN_REASONS.includes(reason)) return fail('REASON_REQUIRED');
  const cleanNote = cleanText(note, 500);

  // Merge request lines by product/colour/size so a duplicated row can't dodge the cap.
  const requested = new Map();
  for (const raw of lines) {
    const line = parseRequestLine(raw);
    if (!line) return fail('INVALID_REQUEST');
    if (isCoordinateId(line.productId)) return fail('COORDINATE_SET_EXCLUDED');
    const lineKey = returnLineKey(line);
    const prev = requested.get(lineKey);
    requested.set(lineKey, prev ? { ...prev, quantity: prev.quantity + line.quantity } : line);
  }
  const requestedLines = [...requested.entries()];
  const returnIds = requestedLines.map((_, index) => `ret_${key}_${index}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const orderRef = db.collection('orders').doc(id);
      const firstReturnRef = db.collection('returns').doc(returnIds[0]);
      const orderSnap = await tx.get(orderRef);
      const firstReturnSnap = await tx.get(firstReturnRef);

      // Replay of an attempt that already succeeded (e.g. the response was lost): change nothing.
      if (firstReturnSnap.exists) {
        const existing = firstReturnSnap.data() ?? {};
        if (existing.orderId !== id || existing.idempotencyKey !== key) throw new ReturnError('IDEMPOTENCY_CONFLICT');
        const docs = [];
        for (const returnId of returnIds) {
          const snap = await tx.get(db.collection('returns').doc(returnId));
          if (snap.exists) docs.push(serializeReturn(returnId, snap.data()));
        }
        return { replayed: true, returns: docs };
      }

      if (!orderSnap.exists) throw new ReturnError('ORDER_NOT_FOUND');
      const order = orderSnap.data() ?? {};
      if (order.source === 'pos') throw new ReturnError('IS_POS_SALE');
      const rawStatus = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
      const status = normalizeStoredStatus(order.status);
      if (
        hasCancellationRecord(order) ||
        !KNOWN_ORDER_STATUSES.includes(rawStatus) ||
        !RETURNABLE_ORDER_STATUSES.includes(status)
      ) {
        throw new ReturnError('NOT_RETURNABLE');
      }

      const available = returnableOrderLines(order);
      const summary = readReturnSummary(order);
      const nextByKey = { ...summary.returnedQtyByKey };
      for (const [lineKey, line] of requestedLines) {
        const ordered = available.get(lineKey);
        if (!ordered) throw new ReturnError('LINE_NOT_FOUND', { productId: line.productId });
        const already = nextByKey[lineKey] ?? 0;
        if (already + line.quantity > ordered.ordered) {
          throw new ReturnError('QUANTITY_EXCEEDED', {
            productId: line.productId,
            remaining: Math.max(0, ordered.ordered - already),
          });
        }
        nextByKey[lineKey] = already + line.quantity;
      }

      const now = new Date();
      const created = [];
      requestedLines.forEach(([lineKey, line], index) => {
        const meta = available.get(lineKey);
        const doc = {
          orderId: id,
          source: 'web',
          orderStatusAtIntake: status,
          customerName: cleanText(order.customerName, 200),
          customerPhone: cleanText(order.customerPhone, 50),
          lineKey,
          productId: line.productId,
          colorId: line.colorId,
          colorName: meta.colorName,
          size: line.size,
          productName: meta.name,
          image: meta.image,
          unitPrice: meta.price, // informational only — no refund or credit is recorded
          quantity: line.quantity,
          reason,
          note: cleanNote,
          status: 'quarantine',
          disposition: null,
          inspectionNotes: null,
          restockApplied: false,
          restockSkipReason: null,
          resolutionNote: null,
          idempotencyKey: key,
          resolveIdempotencyKey: null,
          createdAt: now,
          createdByUid: actorUid,
          createdByName: actorName || null,
          updatedAt: now,
          resolvedAt: null,
          resolvedByUid: null,
          resolvedByName: null,
          history: [historyEntry(now, actorUid, actorName, 'received', { status: 'quarantine' })],
        };
        tx.set(db.collection('returns').doc(returnIds[index]), doc);
        created.push(serializeReturn(returnIds[index], doc));
      });

      tx.update(orderRef, {
        returnSummary: {
          returnCount: summary.returnCount + requestedLines.length,
          openCount: summary.openCount + requestedLines.length,
          returnedQtyByKey: nextByKey,
          lastReturnAt: now,
        },
        updatedAt: now,
      });

      return { replayed: false, returns: created };
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ReturnError) return fail(error.code, error.details);
    console.error('[returns] intake failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not record the return. Please try again.' };
  }
}

/**
 * Inspection while the item is still on the shelf: move between quarantine and
 * needs_repair and/or save inspection notes. Never touches stock.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, returnId: string,
 *           status?: 'quarantine'|'needs_repair', inspectionNotes?: string|null }} input
 */
export async function updateWebReturn(db, { actorUid, actorName, returnId, status, inspectionNotes }) {
  if (!actorUid) return fail('FORBIDDEN');
  const id = typeof returnId === 'string' ? returnId.trim() : '';
  const nextStatus = status === undefined ? undefined : status;
  if (!id || (nextStatus !== undefined && nextStatus !== 'quarantine' && nextStatus !== 'needs_repair')) {
    return fail('INVALID_REQUEST');
  }
  if (nextStatus === undefined && inspectionNotes === undefined) return fail('INVALID_REQUEST');

  try {
    const result = await db.runTransaction(async (tx) => {
      const ref = db.collection('returns').doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new ReturnError('RETURN_NOT_FOUND');
      const current = snap.data() ?? {};
      if (current.status === 'resolved') throw new ReturnError('ALREADY_RESOLVED');

      const now = new Date();
      const patch = { updatedAt: now };
      const changes = {};
      if (nextStatus !== undefined && nextStatus !== current.status) {
        patch.status = nextStatus;
        changes.status = nextStatus;
      }
      if (inspectionNotes !== undefined) {
        const notes = inspectionNotes === null ? null : cleanText(inspectionNotes, 2000);
        if (notes !== (current.inspectionNotes ?? null)) {
          patch.inspectionNotes = notes;
          changes.notesUpdated = true;
        }
      }
      if (Object.keys(changes).length === 0) return { changed: false, return: serializeReturn(id, current) };
      patch.history = appendHistory(current.history, historyEntry(now, actorUid, actorName, 'inspected', changes));
      tx.update(ref, patch);
      return { changed: true, return: serializeReturn(id, { ...current, ...patch }) };
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ReturnError) return fail(error.code, error.details);
    console.error('[returns] update failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not update the return. Please try again.' };
  }
}

/**
 * Final disposition (authorised owner decision).
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, returnId: string,
 *           disposition: 'restocked'|'damaged'|'manual_review', note?: string, idempotencyKey: string }} input
 */
export async function resolveWebReturn(db, { actorUid, actorName, returnId, disposition, note, idempotencyKey }) {
  if (!actorUid) return fail('FORBIDDEN');
  const id = typeof returnId === 'string' ? returnId.trim() : '';
  const key = cleanKey(idempotencyKey);
  if (!id || !key || !RETURN_DISPOSITIONS.includes(disposition)) return fail('INVALID_REQUEST');
  const cleanNote = cleanText(note, 1000);
  if (disposition === 'manual_review' && !cleanNote) return fail('NOTE_REQUIRED');

  try {
    const result = await db.runTransaction(async (tx) => {
      const returnRef = db.collection('returns').doc(id);
      const snap = await tx.get(returnRef);
      if (!snap.exists) throw new ReturnError('RETURN_NOT_FOUND');
      const current = snap.data() ?? {};

      // Final means final: a second resolution can never restock again.
      if (current.status === 'resolved') {
        if (current.resolveIdempotencyKey === key) return { replayed: true, return: serializeReturn(id, current) };
        throw new ReturnError('ALREADY_RESOLVED');
      }

      const orderRef = db.collection('orders').doc(String(current.orderId ?? ''));
      const orderSnap = current.orderId ? await tx.get(orderRef) : { exists: false };
      const order = orderSnap.exists ? orderSnap.data() ?? {} : null;

      const line = {
        productId: String(current.productId ?? ''),
        colorId: current.colorId ?? null,
        size: current.size ?? null,
        quantity: Math.max(0, Math.floor(Number(current.quantity) || 0)),
        name: current.productName ?? null,
      };
      let restockSkipReason = null;
      let stockWrites = new Map();
      let productBefore = null;

      if (disposition === 'restocked' || disposition === 'manual_review') {
        const productSnap = line.productId ? await tx.get(db.collection('products').doc(line.productId)) : { exists: false };
        productBefore = productSnap.exists ? productSnap.data() ?? {} : null;
        const skip = isCoordinateId(line.productId)
          ? 'coordinate_set'
          : restoreSkipReason(line, productSnap.exists ? productSnap.data() ?? {} : null);
        if (disposition === 'restocked') {
          if (order && hasCancellationRecord(order)) throw new ReturnError('ORDER_CANCELLED');
          if (skip) throw new ReturnError('RESTOCK_NOT_POSSIBLE', { skipReason: skip });
          if (line.quantity < 1) throw new ReturnError('INVALID_REQUEST');
          // after = [] → a pure give-back of exactly this line; validated above, never re-creates a size.
          stockWrites = await computeStockWrites(db, tx, [line], []);
        } else {
          restockSkipReason = skip; // informational: why it could not simply be restocked (may be null)
        }
      }

      const now = new Date();
      const patch = {
        status: 'resolved',
        disposition,
        restockApplied: disposition === 'restocked',
        restockSkipReason,
        resolutionNote: cleanNote,
        resolveIdempotencyKey: key,
        resolvedAt: now,
        resolvedByUid: actorUid,
        resolvedByName: actorName || null,
        updatedAt: now,
        history: appendHistory(
          current.history,
          historyEntry(now, actorUid, actorName, 'resolved', { disposition, ...(restockSkipReason ? { restockSkipReason } : {}) })
        ),
      };
      tx.update(returnRef, patch);
      for (const [productId, payload] of stockWrites) {
        tx.update(db.collection('products').doc(productId), payload);
        // Ledger entries in the same transaction as the stock write.
        for (const entry of stockMovementEntries(productId, productBefore, payload, {
          reason: 'return_restock',
          actorUid,
          actorName,
          at: now,
          orderId: current.orderId ? String(current.orderId) : null,
          returnId: id,
        })) {
          tx.set(db.collection('stockMovements').doc(), entry);
        }
      }
      if (order) {
        const summary = readReturnSummary(order);
        tx.update(orderRef, {
          returnSummary: {
            ...(order.returnSummary && typeof order.returnSummary === 'object' ? order.returnSummary : {}),
            returnCount: summary.returnCount,
            returnedQtyByKey: summary.returnedQtyByKey,
            openCount: Math.max(0, summary.openCount - 1),
          },
          updatedAt: now,
        });
      }
      return { replayed: false, return: serializeReturn(id, { ...current, ...patch }) };
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ReturnError) return fail(error.code, error.details);
    console.error('[returns] resolve failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not resolve the return. Please try again.' };
  }
}
