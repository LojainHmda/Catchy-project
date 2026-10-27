// Cancels a web (online) order and restores its stock in ONE Firestore
// transaction (Admin SDK), recording a full audit entry on the order.
//
// Double-restoration guard (checked first, inside the transaction, against the
// order as it is NOW — never against what a client screen last saw):
//   - an existing `cancellation` record means stock was already handled once.
//     If the status still says 'cancelled' this is a no-op (or a replay of the
//     same attempt, recognised by its idempotency key). If the status was
//     changed afterwards (e.g. by an older screen before status changes were
//     made transactional) the order is refused with PREVIOUSLY_CANCELLED and
//     nothing is written — restoring again would double-count stock.
//   - status 'cancelled' without a record (cancelled the old, status-only way)
//     is also a no-op: that path never restored stock, and we cannot know what
//     happened to the goods since.
// Firestore runs transactions with retries; the callback has no side effects
// outside `tx`, so a retried attempt recomputes everything from fresh reads.
//
// Each line is validated against the product as it is now before restoring.
// Lines that cannot be restored exactly are skipped with a reason and listed in
// `cancellation.skippedLines` — nothing is guessed and no size or color variant
// is re-created:
//   - coordinate_set:  coordinate-set lines ("coord:" ids) — checkout deducts
//                      those from linked products' aggregate size counts, so
//                      there is no exact place to give them back to;
//   - product_missing: the product was deleted;
//   - variant_missing: the line's color no longer exists, the line has no color
//                      but the product now has colors, or vice versa;
//   - size_missing:    the line's size no longer exists on that product/color
//                      (or the line has no size where one is now required);
//   - not_restocked:   shipped order, admin said the goods did not come back.
//
// Every restored cell is recorded in the `stockMovements` ledger (stockLedger.js)
// in the same transaction.
//
// An order with any return logged (webOrderReturn.js) is refused with
// HAS_RETURNS: its returned units are handled on the returns shelf, and
// cancelling would restore them a second time.

import { computeStockWrites, resolveProductInventory } from './posSaleCorrection.js';
import { orderHasReturns } from './orderReturnState.js';
import { stockMovementEntries } from './stockLedger.js';

export const WEB_CANCELLABLE_STATUSES = ['pending', 'processing', 'shipped'];

// Stock was taken at checkout and the goods never left the shop for these, so
// cancelling always puts it back. For 'shipped' the admin must say whether the
// goods actually came back.
const ALWAYS_RESTOCK_STATUSES = ['pending', 'processing'];

// Same prefix as src/lib/coordinateCart.ts (server code doesn't import src/).
const COORDINATE_CART_PREFIX = 'coord:';

/** Same normalisation as the client (orderUtils.normalizeOrderStatus): trim + lower-case, missing → pending. */
export function normalizeStoredStatus(raw) {
  const status = String(raw ?? 'pending').trim().toLowerCase();
  return status || 'pending';
}

function isCoordinateLine(item) {
  return typeof item?.productId === 'string' && item.productId.startsWith(COORDINATE_CART_PREFIX);
}

function hasCancellationRecord(order) {
  const c = order?.cancellation;
  return !!c && typeof c === 'object' && typeof c.cancelledByUid === 'string' && c.cancelledByUid.length > 0;
}

function lineSummary(item, reason) {
  return {
    productId: String(item.productId ?? ''),
    name: typeof item.name === 'string' ? item.name : null,
    colorId: item.colorId ?? null,
    size: item.size ?? null,
    quantity: Number(item.quantity) || 0,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Why a line cannot be restored exactly to the product as it is now (null = restorable).
 * Uses the same inventory parser as computeStockWrites so the two never disagree.
 */
export function restoreSkipReason(item, productData) {
  if (!productData) return 'product_missing';
  const inv = resolveProductInventory(productData);
  const size = typeof item.size === 'string' && item.size ? item.size : null;
  const colorId = typeof item.colorId === 'string' && item.colorId ? item.colorId : null;

  if (inv.hasVariants) {
    if (!colorId) return 'variant_missing';
    const variant = inv.colorVariants.find((v) => v.id === colorId);
    if (!variant) return 'variant_missing';
    if (!size || !Object.prototype.hasOwnProperty.call(variant.sizeStock, size)) return 'size_missing';
    return null;
  }
  if (colorId) return 'variant_missing';
  const sized = Object.keys(inv.sizeStock).length > 0;
  if (sized) {
    if (!size || !Object.prototype.hasOwnProperty.call(inv.sizeStock, size)) return 'size_missing';
    return null;
  }
  return size ? 'size_missing' : null;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
}

/** JSON-safe copy of a cancellation record (Date / Firestore Timestamp → ISO string). */
export function serializeCancellation(cancellation) {
  if (!cancellation || typeof cancellation !== 'object') return null;
  return { ...cancellation, cancelledAt: toIso(cancellation.cancelledAt) };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, orderId: string, reason: string,
 *           restock?: boolean, idempotencyKey?: string }} input
 */
export async function cancelWebOrder(db, { actorUid, actorName, orderId, reason, restock, idempotencyKey }) {
  if (!actorUid) return { ok: false, code: 'FORBIDDEN', message: 'Not authorized.' };
  if (typeof orderId !== 'string' || !orderId.trim()) {
    return { ok: false, code: 'MISSING_ORDER', message: 'No order specified.' };
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    return { ok: false, code: 'REASON_REQUIRED', message: 'A cancellation reason is required.' };
  }
  const trimmedReason = reason.trim().slice(0, 500);
  const key = typeof idempotencyKey === 'string' && idempotencyKey.trim() ? idempotencyKey.trim().slice(0, 100) : null;

  try {
    const result = await db.runTransaction(async (tx) => {
      const orderRef = db.collection('orders').doc(orderId.trim());
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');
      const order = orderSnap.data() ?? {};

      if (order.source === 'pos') throw new Error('IS_POS_SALE');

      const currentStatus = normalizeStoredStatus(order.status);

      // Double-restoration guard — see the header comment. Nothing is read or written past this point for these cases.
      if (hasCancellationRecord(order)) {
        if (currentStatus !== 'cancelled') throw new Error('PREVIOUSLY_CANCELLED');
        const replayed = !!key && order.cancellation.idempotencyKey === key;
        return { alreadyCancelled: !replayed, replayed, cancellation: order.cancellation };
      }
      if (currentStatus === 'cancelled') {
        return { alreadyCancelled: true, replayed: false, cancellation: null };
      }

      if (!WEB_CANCELLABLE_STATUSES.includes(currentStatus)) throw new Error('NOT_CANCELLABLE');
      // Units already logged on the returns shelf would be restocked a second time.
      if (orderHasReturns(order)) throw new Error('HAS_RETURNS');

      const restockApplied = ALWAYS_RESTOCK_STATUSES.includes(currentStatus) ? true : restock === true;
      const items = Array.isArray(order.items) ? order.items : [];
      const productLines = items.filter((item) => !isCoordinateLine(item) && Number(item?.quantity) > 0);

      const skippedLines = items.filter(isCoordinateLine).map((item) => lineSummary(item, 'coordinate_set'));
      const restoredLines = [];
      let stockWrites = new Map();
      const productData = new Map();

      if (restockApplied) {
        // Read every product once (all reads happen before any write) and keep only exact matches.
        for (const productId of new Set(productLines.map((item) => String(item.productId)))) {
          const snap = await tx.get(db.collection('products').doc(productId));
          productData.set(productId, snap.exists ? snap.data() ?? {} : null);
        }
        const restorable = [];
        for (const item of productLines) {
          const skip = restoreSkipReason(item, productData.get(String(item.productId)));
          if (skip) skippedLines.push(lineSummary(item, skip));
          else {
            restorable.push(item);
            restoredLines.push(lineSummary(item));
          }
        }
        // after = [] → every delta is a give-back; every line here was validated above, so this cannot throw
        // COLOR_REQUIRED / SIZE_REQUIRED and never re-creates a missing size.
        if (restorable.length) stockWrites = await computeStockWrites(db, tx, restorable, []);
      } else {
        for (const item of productLines) skippedLines.push(lineSummary(item, 'not_restocked'));
      }

      const cancelledAt = new Date();
      const cancellation = {
        cancelledAt,
        cancelledByUid: actorUid,
        cancelledByName: actorName || null,
        reason: trimmedReason,
        previousStatus: currentStatus,
        restockApplied,
        restoredLines,
        skippedLines,
        idempotencyKey: key,
      };

      tx.update(orderRef, {
        status: 'cancelled',
        cancellation,
        statusUpdatedAt: cancelledAt,
        statusUpdatedByUid: actorUid,
        statusUpdatedByName: actorName || null,
        updatedAt: cancelledAt,
      });
      for (const [productId, payload] of stockWrites) {
        tx.update(db.collection('products').doc(productId), payload);
        // Ledger entries in the same transaction as the stock write.
        for (const entry of stockMovementEntries(productId, productData.get(productId), payload, {
          reason: 'order_cancelled',
          actorUid,
          actorName,
          at: cancelledAt,
          orderId: orderId.trim(),
        })) {
          tx.set(db.collection('stockMovements').doc(), entry);
        }
      }

      return { alreadyCancelled: false, replayed: false, cancellation };
    });

    return { ok: true, ...result, cancellation: serializeCancellation(result.cancellation) };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'ORDER_NOT_FOUND') return { ok: false, code, message: 'This order could not be found.' };
    if (code === 'IS_POS_SALE') {
      return { ok: false, code, message: 'POS sales are cancelled from the POS sale tools.' };
    }
    if (code === 'NOT_CANCELLABLE') {
      return { ok: false, code, message: 'Only pending, processing or shipped orders can be cancelled.' };
    }
    if (code === 'HAS_RETURNS') {
      return {
        ok: false,
        code,
        message: 'This order has items on the returns shelf, so it cannot be cancelled. Resolve the returns instead.',
      };
    }
    if (code === 'PREVIOUSLY_CANCELLED') {
      return {
        ok: false,
        code,
        message:
          'This order was already cancelled once (its stock was handled then), but its status was changed afterwards. It was not cancelled again — review it manually.',
      };
    }
    console.error('[orders] web order cancellation failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not cancel the order. Please try again.' };
  }
}
