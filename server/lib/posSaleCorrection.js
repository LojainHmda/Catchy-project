// Corrects or cancels an already-completed POS sale (admin-only): recomputes
// totals from the corrected line items (never trusts a client-submitted final
// total), applies the *net* stock delta atomically, and appends an audit-trail
// entry — all in one Firestore transaction, mirroring posSale.js's own rigor.
//
// Deliberately does NOT touch register_sessions totals (open or closed). Those
// fields (cashTotal/cardTotal in particular) represent money actually counted
// by hand at the register; a later price/quantity correction — or a full
// cancellation — doesn't change what was physically collected, and silently
// reshaping a *closed* session's already-reconciled totals is exactly what
// this module was built NOT to do. The effect on the sale's value is fully
// captured in the order's own audit trail (`corrections[]` / `cancellation`)
// and `balanceDue` instead — see PosSaleCorrectionModal / PosSaleCancelModal
// for how that's surfaced to staff.
//
// Inventory helpers are copied from posSale.js rather than imported — matching
// that file's own stated precedent ("no src/ imports server-side ... so the
// two checkout paths can evolve independently"); this third path follows suit
// so the three can evolve independently of each other too. correctPosSale and
// cancelPosSale share their stock-delta math (computeStockWrites below) rather
// than duplicating it — cancelling is, mechanically, "correct every line down
// to zero."

function parseSizeStock(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map = {};
  Object.entries(raw).forEach(([key, value]) => {
    const size = String(key).trim();
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    if (size) map[size] = qty;
  });
  return map;
}

function totalFromSizeStock(sizeStock) {
  return Object.values(sizeStock).reduce((sum, n) => sum + Math.max(0, n), 0);
}

function parseColorVariants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!id || !name) return null;
      const images = Array.isArray(entry.images)
        ? entry.images.filter((u) => typeof u === 'string' && u.trim().length > 12)
        : [];
      return {
        id,
        name,
        nameAr: typeof entry.nameAr === 'string' ? entry.nameAr.trim() : undefined,
        hex: typeof entry.hex === 'string' ? entry.hex.trim() : undefined,
        images,
        sizeStock: parseSizeStock(entry.sizeStock),
      };
    })
    .filter(Boolean);
}

function hasSizedInventory(sizeStock) {
  return Object.keys(sizeStock).length > 0;
}

function resolveProductInventory(data) {
  const colorVariants = parseColorVariants(data.colorVariants);
  if (colorVariants.length) {
    const sizeStock = {};
    colorVariants.forEach((v) => {
      Object.entries(v.sizeStock).forEach(([size, qty]) => {
        sizeStock[size] = (sizeStock[size] ?? 0) + Math.max(0, qty);
      });
    });
    return { sizeStock, stock: totalFromSizeStock(sizeStock), colorVariants, hasVariants: true };
  }

  const parsed = parseSizeStock(data.sizeStock);
  if (Object.keys(parsed).length > 0) {
    return { sizeStock: parsed, stock: totalFromSizeStock(parsed), colorVariants: [], hasVariants: false };
  }

  const legacyStock = Math.max(0, Math.floor(Number(data.stock) || 0));
  return { sizeStock: {}, stock: legacyStock, colorVariants: [], hasVariants: false };
}

/** Signed version of posSale.js's decrementInventory: delta>0 consumes, delta<0 restores. */
function applySignedStockChange(sizeStock, totalStock, size, delta) {
  if (hasSizedInventory(sizeStock)) {
    if (!size) throw new Error('SIZE_REQUIRED');
    const current = Math.max(0, sizeStock[size] ?? 0);
    if (delta > 0 && current < delta) throw new Error('OUT_OF_STOCK');
    const next = { ...sizeStock, [size]: Math.max(0, current - delta) };
    return { sizeStock: next, stock: totalFromSizeStock(next) };
  }
  if (delta > 0 && totalStock < delta) throw new Error('OUT_OF_STOCK');
  return { sizeStock, stock: Math.max(0, totalStock - delta) };
}

function applySignedColorVariantChange(variants, colorId, size, delta) {
  const idx = variants.findIndex((v) => v.id === colorId);
  if (idx < 0) throw new Error('COLOR_REQUIRED');
  if (!size) throw new Error('SIZE_REQUIRED');
  const variant = variants[idx];
  const sizeStock = { ...variant.sizeStock };
  const current = Math.max(0, sizeStock[size] ?? 0);
  if (delta > 0 && current < delta) throw new Error('OUT_OF_STOCK');
  sizeStock[size] = Math.max(0, current - delta);
  const next = [...variants];
  next[idx] = { ...variant, sizeStock };
  return next;
}

function reaggregateVariants(variants) {
  const sizeStock = {};
  variants.forEach((variant) => {
    Object.entries(variant.sizeStock).forEach(([size, qty]) => {
      sizeStock[size] = (sizeStock[size] ?? 0) + Math.max(0, qty);
    });
  });
  return { sizeStock, stock: totalFromSizeStock(sizeStock), colorVariants: variants };
}

function sanitizeStoredImageUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s.slice(0, 2048);
  return s.length <= 512 ? s : '';
}

/** Same clamp rules as posSale.js's resolveDiscount — never negative, never more than the subtotal. */
function resolveDiscount(discount, subtotal) {
  if (!discount) return null;
  const mode = discount.mode === 'amount' ? 'amount' : 'percent';
  const rawValue = Number(discount.value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null;

  let amount;
  if (mode === 'percent') {
    const pct = Math.min(100, Math.max(0, rawValue));
    amount = subtotal * (pct / 100);
  } else {
    amount = Math.max(0, rawValue);
  }
  amount = Math.min(amount, subtotal);
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return null;

  return {
    mode,
    value: rawValue,
    amount,
    reason: typeof discount.reason === 'string' && discount.reason.trim() ? discount.reason.trim() : null,
  };
}

function normalizeCorrectionItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item) => ({
      productId: String(item?.productId ?? '').trim(),
      name: String(item?.name ?? 'Item').trim(),
      price: Math.max(0, Number(item?.price) || 0),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      size: typeof item?.size === 'string' && item.size.trim() ? item.size.trim() : null,
      colorId: typeof item?.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
      colorName: typeof item?.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
      image: typeof item?.image === 'string' ? item.image.trim() : '',
    }))
    .filter((item) => item.productId.length > 0);
}

function toStoredLine(item) {
  const stored = {
    productId: item.productId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    lineTotal: Math.round(item.price * item.quantity * 100) / 100,
    image: sanitizeStoredImageUrl(item.image),
  };
  if (item.size) stored.size = item.size;
  if (item.colorId) stored.colorId = item.colorId;
  if (item.colorName) stored.colorName = item.colorName;
  return stored;
}

function lineKey(item) {
  return [item.productId, item.colorId ?? '', item.size ?? ''].join('|~|');
}

/**
 * Computes the net per-product/color/size quantity delta between `beforeItems`
 * and `afterItems`, reads every touched product inside the given transaction,
 * and returns a Map of productId -> the stock fields to write (nothing is
 * written here — callers `tx.update` it themselves, after they've validated
 * whatever else they need to). Shared by correctPosSale (afterItems = the
 * corrected line items) and cancelPosSale (afterItems = [] — restoring
 * everything). A deleted product is skipped gracefully when every delta on it
 * is a give-back (delta <= 0); it only throws PRODUCT_MISSING when a delta
 * would need to *consume* stock that no longer exists — cancellation deltas
 * are always give-backs, so a cancellation can never fail this way.
 */
async function computeStockWrites(db, tx, beforeItems, afterItems) {
  const before = new Map();
  beforeItems.forEach((i) => before.set(lineKey(i), (before.get(lineKey(i)) ?? 0) + (Number(i.quantity) || 0)));
  const after = new Map();
  afterItems.forEach((i) => after.set(lineKey(i), (after.get(lineKey(i)) ?? 0) + (Number(i.quantity) || 0)));
  const meta = new Map();
  [...beforeItems, ...afterItems].forEach((i) => meta.set(lineKey(i), i));

  const deltas = [...new Set([...before.keys(), ...after.keys()])]
    .map((k) => ({ ...meta.get(k), delta: (after.get(k) ?? 0) - (before.get(k) ?? 0) }))
    .filter((d) => d.delta !== 0);

  const uniqueProductIds = [...new Set(deltas.map((d) => d.productId))];
  const productSnaps = new Map();
  for (const id of uniqueProductIds) {
    productSnaps.set(id, await tx.get(db.collection('products').doc(id)));
  }

  const stockWrites = new Map();
  for (const id of uniqueProductIds) {
    const snap = productSnaps.get(id);
    const idDeltas = deltas.filter((d) => d.productId === id);

    if (!snap.exists) {
      // A deleted product can still be fully priced/totalled from the
      // admin-supplied correction — but there's nothing to adjust stock on.
      // Only fail if we'd need to *consume* stock that no longer exists;
      // silently skip the stock write if every delta here is a give-back.
      if (idDeltas.some((d) => d.delta > 0)) {
        const err = new Error('PRODUCT_MISSING');
        err.productName = idDeltas[0]?.name;
        throw err;
      }
      continue;
    }

    const data = snap.data() ?? {};
    const inv = resolveProductInventory(data);
    let working = {
      sizeStock: inv.sizeStock,
      stock: inv.stock,
      colorVariants: inv.colorVariants,
      hasVariants: inv.hasVariants,
      sized: hasSizedInventory(inv.sizeStock),
    };

    for (const d of idDeltas) {
      try {
        if (working.hasVariants && d.colorId) {
          const nextVariants = applySignedColorVariantChange(working.colorVariants, d.colorId, d.size, d.delta);
          const agg = reaggregateVariants(nextVariants);
          working = { ...working, colorVariants: agg.colorVariants, sizeStock: agg.sizeStock, stock: agg.stock };
        } else {
          const next = applySignedStockChange(working.sizeStock, working.stock, d.size, d.delta);
          working = { ...working, sizeStock: next.sizeStock, stock: next.stock };
        }
      } catch (e) {
        e.productName = d.name;
        throw e;
      }
    }

    const payload = { stock: working.stock };
    if (working.sized) payload.sizeStock = working.sizeStock;
    if (working.hasVariants && working.colorVariants?.length) payload.colorVariants = working.colorVariants;
    stockWrites.set(id, payload);
  }

  return stockWrites;
}

const MAX_CORRECTIONS_KEPT = 50;

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, actorRole: string, orderId: string,
 *           items: any[], discount: any, reason?: string, idempotencyKey?: string }} input
 */
export async function correctPosSale(
  db,
  { actorUid, actorName, actorRole, orderId, items, discount, reason, idempotencyKey }
) {
  if (actorRole !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only an admin can correct a completed sale.' };
  }
  if (!orderId) return { ok: false, code: 'MISSING_ORDER', message: 'No order specified.' };

  const nextItems = normalizeCorrectionItems(items);
  if (!nextItems.length) {
    return { ok: false, code: 'EMPTY_ITEMS', message: 'A sale must have at least one item.' };
  }

  const key = typeof idempotencyKey === 'string' && idempotencyKey.trim() ? idempotencyKey.trim() : null;

  try {
    const result = await db.runTransaction(async (tx) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');
      const order = orderSnap.data();

      if (order.source !== 'pos') throw new Error('NOT_POS_SALE');
      // A cancelled sale is terminal — no further correction may be layered on
      // top of it, regardless of idempotency key history (see cancelPosSale).
      if (order.status === 'cancelled') throw new Error('SALE_CANCELLED');

      // Idempotent retry guard: if this exact correction attempt was already
      // committed, return its recorded result instead of re-applying it — a
      // safe no-op for a client retrying after e.g. a dropped response.
      if (key && order.lastCorrection?.idempotencyKey === key) {
        return {
          alreadyApplied: true,
          total: order.total,
          itemCount: order.itemCount,
          balanceDue: order.balanceDue ?? 0,
        };
      }

      // Read the register session for informational context only (never written).
      let sessionStatus = null;
      if (order.registerSessionId) {
        const sessionSnap = await tx.get(db.collection('register_sessions').doc(order.registerSessionId));
        sessionStatus = sessionSnap.exists ? sessionSnap.data().status ?? null : null;
      }

      const beforeItems = Array.isArray(order.items) ? order.items : [];
      const stockWrites = await computeStockWrites(db, tx, beforeItems, nextItems);

      // ---- recompute totals from the corrected items — server-authoritative, never a client-sent total ----
      const storedLines = nextItems.map(toStoredLine);
      const subtotal = Math.round(storedLines.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
      const itemCount = storedLines.reduce((s, i) => s + i.quantity, 0);
      const resolvedDiscount = resolveDiscount(discount, subtotal);
      const total = Math.round((subtotal - (resolvedDiscount?.amount ?? 0)) * 100) / 100;

      // ---- payment reconciliation: never rewrite what was actually collected ----
      const originalPayment = order.payment ?? { cashAmount: 0, cardAmount: 0 };
      const originalCollected =
        Math.round(((Number(originalPayment.cashAmount) || 0) + (Number(originalPayment.cardAmount) || 0)) * 100) /
        100;
      // >0 = customer now owes more than they paid; <0 = a refund is owed; 0 = settled.
      const balanceDue = Math.round((total - originalCollected) * 100) / 100;

      const correctionEntry = {
        correctedAt: new Date(),
        correctedByUid: actorUid,
        correctedByName: actorName || null,
        reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null,
        registerSessionStatusAtCorrection: sessionStatus,
        before: {
          items: beforeItems,
          subtotal: order.subtotal ?? null,
          discount: order.discount ?? null,
          total: order.total ?? null,
        },
        after: { items: storedLines, subtotal, discount: resolvedDiscount, total },
        idempotencyKey: key,
      };

      const existingCorrections = Array.isArray(order.corrections) ? order.corrections : [];
      const nextCorrections = [...existingCorrections, correctionEntry].slice(-MAX_CORRECTIONS_KEPT);

      tx.update(orderRef, {
        items: storedLines,
        subtotal,
        discount: resolvedDiscount,
        total,
        itemCount,
        balanceDue,
        correctionCount: existingCorrections.length + 1,
        corrections: nextCorrections,
        lastCorrection: { idempotencyKey: key, at: new Date() },
        updatedAt: new Date(),
      });

      for (const [id, payload] of stockWrites) {
        tx.update(db.collection('products').doc(id), payload);
      }

      return { alreadyApplied: false, total, itemCount, balanceDue, registerSessionStatus: sessionStatus };
    });

    return { ok: true, ...result };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'ORDER_NOT_FOUND') {
      return { ok: false, code, message: 'This sale could not be found.' };
    }
    if (code === 'NOT_POS_SALE') {
      return { ok: false, code, message: 'Only POS sales can be corrected here.' };
    }
    if (code === 'SALE_CANCELLED') {
      return { ok: false, code, message: 'This sale has been cancelled and can no longer be corrected.' };
    }
    if (code === 'PRODUCT_MISSING') {
      return {
        ok: false,
        code,
        message: 'A product in this correction is no longer available.',
        productName: error.productName,
      };
    }
    if (code === 'OUT_OF_STOCK' || code === 'SIZE_REQUIRED' || code === 'COLOR_REQUIRED') {
      return {
        ok: false,
        code: 'OUT_OF_STOCK',
        message: 'Not enough stock to apply this correction.',
        productName: error.productName,
      };
    }
    console.error('[pos] sale correction failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not correct the sale. Please try again.' };
  }
}

/**
 * Cancels an already-completed POS sale (admin-only): restores every sold
 * line's stock in full based on the sale's *current* items — i.e. whatever a
 * prior correction already left it at, not the original pre-correction
 * quantities — then marks the order `status: 'cancelled'` and records
 * who/when/why.
 *
 * `order.items` / `total` / `subtotal` / `discount` / `payment` are left
 * completely untouched — the historical record of what was sold and what was
 * actually collected is preserved exactly, the same guarantee correctPosSale
 * already gives for every correction. `balanceDue` is set to the full amount
 * owed back (`-originalCollected`): cancelling voids the sale entirely, so
 * whatever cash or card payment was actually collected is now owed back in
 * full, regardless of any earlier correction's own balance. No refund is ever
 * auto-processed — this only tells staff what's owed.
 *
 * Idempotent and safe under retries/concurrency by construction: the only
 * gate on restoring stock is `order.status !== 'cancelled'`, checked and
 * flipped to 'cancelled' atomically in the same transaction. A second
 * attempt — a client retry, a duplicate click, or a genuinely concurrent
 * request — reads the now-'cancelled' order (Firestore transactions
 * serialize conflicting writes, transparently retrying the loser against the
 * committed state) and takes the `alreadyCancelled` no-op path before
 * touching any stock. Unlike a correction (which may legitimately be applied
 * more than once), cancellation is a one-time, terminal operation, so gating
 * purely on status — rather than matching idempotency keys — is both simpler
 * and correct: any cancel attempt on an already-cancelled sale is the same
 * safe no-op, whether it's a retry of this exact attempt or an independent
 * later click.
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ actorUid: string, actorName: string|null, actorRole: string, orderId: string,
 *           reason: string, idempotencyKey?: string }} input
 */
export async function cancelPosSale(db, { actorUid, actorName, actorRole, orderId, reason, idempotencyKey }) {
  if (actorRole !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only an admin can cancel a completed sale.' };
  }
  if (!orderId) return { ok: false, code: 'MISSING_ORDER', message: 'No order specified.' };
  if (typeof reason !== 'string' || !reason.trim()) {
    return { ok: false, code: 'REASON_REQUIRED', message: 'A cancellation reason is required.' };
  }
  const trimmedReason = reason.trim().slice(0, 500);

  const key = typeof idempotencyKey === 'string' && idempotencyKey.trim() ? idempotencyKey.trim() : null;

  try {
    const result = await db.runTransaction(async (tx) => {
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');
      const order = orderSnap.data();

      if (order.source !== 'pos') throw new Error('NOT_POS_SALE');

      // See the idempotency note in the doc comment above — this is the single
      // source of truth, checked before anything else is touched, so stock can
      // never be restored more than once for the same sale.
      if (order.status === 'cancelled') {
        return {
          alreadyCancelled: true,
          refundDue: order.balanceDue ?? 0,
          cancelledAt: null,
          cancelledByUid: null,
          cancelledByName: null,
          reason: null,
          registerSessionStatusAtCancellation: null,
        };
      }

      // Read the register session for informational context only (never
      // written) — same guarantee as correctPosSale: cash/card totals aren't rewritten.
      let sessionStatus = null;
      if (order.registerSessionId) {
        const sessionSnap = await tx.get(db.collection('register_sessions').doc(order.registerSessionId));
        sessionStatus = sessionSnap.exists ? sessionSnap.data().status ?? null : null;
      }

      // Restore stock based on the sale's *current* items (reflecting any prior
      // correction) — the "after" state for a cancellation has no items at all.
      const currentItems = Array.isArray(order.items) ? order.items : [];
      const stockWrites = await computeStockWrites(db, tx, currentItems, []);

      const originalPayment = order.payment ?? { cashAmount: 0, cardAmount: 0 };
      const originalCollected =
        Math.round(((Number(originalPayment.cashAmount) || 0) + (Number(originalPayment.cardAmount) || 0)) * 100) /
        100;
      // Cancelling voids the sale entirely — whatever was actually collected is now owed back in full.
      const refundDue = Math.round(-originalCollected * 100) / 100;

      const cancelledAt = new Date();
      const cancellationEntry = {
        cancelledAt,
        cancelledByUid: actorUid,
        cancelledByName: actorName || null,
        reason: trimmedReason,
        registerSessionStatusAtCancellation: sessionStatus,
        idempotencyKey: key,
      };

      tx.update(orderRef, {
        status: 'cancelled',
        balanceDue: refundDue,
        cancellation: cancellationEntry,
        lastCancellation: { idempotencyKey: key, at: cancelledAt },
        updatedAt: cancelledAt,
      });

      for (const [id, payload] of stockWrites) {
        tx.update(db.collection('products').doc(id), payload);
      }

      return {
        alreadyCancelled: false,
        refundDue,
        cancelledAt,
        cancelledByUid: actorUid,
        cancelledByName: actorName || null,
        reason: trimmedReason,
        registerSessionStatusAtCancellation: sessionStatus,
      };
    });

    return { ok: true, ...result };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'ORDER_NOT_FOUND') {
      return { ok: false, code, message: 'This sale could not be found.' };
    }
    if (code === 'NOT_POS_SALE') {
      return { ok: false, code, message: 'Only POS sales can be cancelled here.' };
    }
    if (code === 'PRODUCT_MISSING') {
      // computeStockWrites only throws this when a delta needs to *consume*
      // stock; cancellation deltas are always give-backs (<=0), so this should
      // be unreachable in practice — kept for safety should that ever change.
      return { ok: false, code, message: 'A product in this sale is no longer available.' };
    }
    console.error('[pos] sale cancellation failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not cancel the sale. Please try again.' };
  }
}
