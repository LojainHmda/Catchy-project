// Admin whole-order discount for WEB (online) orders only. POS sales keep their own
// `discount` field and logic (posSale.js / posSaleCorrection.js) — this module never
// reads or writes it, and refuses POS orders outright.
//
// A fixed amount in ILS only (no percentages), with a required reason. Stored on the
// order as `webDiscount` (null/absent = no discount):
//   { amount, reason, appliedAt, appliedByUid, appliedByName }
//
// Totals rule (shared with the client, src/lib/orders/webOrderDiscount.ts):
//   subtotal = the order's items at their stored prices — never changed by a discount;
//   amount   = the fixed ILS discount, never above the subtotal (items only, never shipping);
//   total    = subtotal − amount + shippingCost.
// The total is always recomputed from the stored subtotal and the discount — never from
// the previous total — so re-applying or re-saving can never discount twice.
//
// Everything is checked inside ONE transaction against the order as it is NOW: it must
// exist, be a web order, not be cancelled, and still be editable (pending / processing /
// shipped — the same statuses the admin edit dialog allows). `expectedSubtotal` (what
// the admin's screen showed) guards against items having changed elsewhere meanwhile.

export const WEB_DISCOUNT_EDITABLE_STATUSES = ['pending', 'processing', 'shipped'];
export const MAX_DISCOUNT_REASON_LENGTH = 200;

export const round2 = (n) => Math.round(n * 100) / 100;

const fail = (code, message) => ({ ok: false, code, message });

/** The fixed discount that applies to `subtotal`: rounded, never negative, never above the subtotal. */
export function webDiscountAmount(amount, subtotal) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || !(subtotal > 0)) return 0;
  return Math.min(round2(value), round2(subtotal));
}

/** Same subtotal the client shows (orderUtils.parseOrderDocument): stored subtotal, else the items' sum. */
export function storedOrderSubtotal(data) {
  const stored = Number(data?.subtotal);
  if (Number.isFinite(stored) && stored > 0) return round2(stored);
  const items = Array.isArray(data?.items) ? data.items : [];
  return round2(items.reduce((sum, item) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0), 0));
}

function normalizeStatus(raw) {
  return String(raw ?? 'pending').trim().toLowerCase() || 'pending';
}

function hasCancellationRecord(raw) {
  return !!raw && typeof raw === 'object';
}

/** Validates the request shape. `discount: null` means "remove the discount". */
export function validateWebDiscountRequest(body) {
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId || orderId.length > 128 || orderId.includes('/')) return fail('INVALID', 'A valid order id is required.');

  let expectedSubtotal = null;
  if (body?.expectedSubtotal !== undefined && body?.expectedSubtotal !== null) {
    expectedSubtotal = Number(body.expectedSubtotal);
    if (!Number.isFinite(expectedSubtotal) || expectedSubtotal < 0) return fail('INVALID', 'Invalid expected subtotal.');
  }

  if (body?.discount === null) return { ok: true, orderId, expectedSubtotal, discount: null };
  const d = body?.discount;
  if (!d || typeof d !== 'object') return fail('INVALID', 'Discount details are required.');
  // Percentage discounts are not supported: anything but a plain fixed amount is refused.
  if ('mode' in d || 'value' in d || 'percent' in d) return fail('INVALID', 'Only a fixed discount amount in ILS is supported.');
  const amount = typeof d.amount === 'number' ? d.amount : Number.NaN;
  if (!Number.isFinite(amount) || round2(amount) <= 0) return fail('INVALID_VALUE', 'The discount must be greater than zero.');
  if (Math.abs(round2(amount) - amount) > 1e-9) return fail('INVALID_VALUE', 'Use at most two decimal places.');
  const reason = typeof d.reason === 'string' ? d.reason.trim() : '';
  if (!reason) return fail('REASON_REQUIRED', 'Enter a reason for the discount.');
  if (reason.length > MAX_DISCOUNT_REASON_LENGTH) return fail('INVALID', `The reason is too long (max ${MAX_DISCOUNT_REASON_LENGTH} characters).`);

  return { ok: true, orderId, expectedSubtotal, discount: { amount: round2(amount), reason } };
}

/** JSON-safe copy (Dates → ISO strings) for the HTTP response. */
export function serializeWebDiscount(discount) {
  if (!discount) return null;
  const at = discount.appliedAt instanceof Date ? discount.appliedAt.toISOString() : discount.appliedAt ?? null;
  return { ...discount, appliedAt: at };
}

/**
 * Apply, change (`discount` set) or remove (`discount: null`) an order's web discount.
 * The caller must already have verified the owner (verifyAdminRequest).
 */
export async function setWebOrderDiscount(db, { actorUid, actorName, orderId, discount, expectedSubtotal = null, now = new Date() }) {
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return fail('NOT_FOUND', 'Order not found.');
    const data = snap.data() ?? {};
    if (data.source === 'pos') return fail('NOT_WEB_ORDER', 'POS sales use "Correct sale" for discounts.');
    if (hasCancellationRecord(data.cancellation) || !WEB_DISCOUNT_EDITABLE_STATUSES.includes(normalizeStatus(data.status))) {
      return fail('NOT_EDITABLE', 'This order can no longer be edited (it was cancelled or completed).');
    }
    const shippingCost = Number(data.shippingCost);
    if (data.shippingCost === null || data.shippingCost === undefined || !Number.isFinite(shippingCost) || shippingCost < 0) {
      return fail('MISSING_TOTALS', 'This order has no stored shipping cost, so its total cannot be recalculated safely.');
    }
    const subtotal = storedOrderSubtotal(data);
    if (expectedSubtotal !== null && Math.abs(subtotal - expectedSubtotal) > 0.005) {
      return fail('ORDER_CHANGED', 'This order changed since it was loaded. Refresh and try again.');
    }

    if (discount === null) {
      const total = round2(subtotal + shippingCost);
      if (!data.webDiscount) return { ok: true, unchanged: true, webDiscount: null, subtotal, shippingCost, total: Number(data.total) || total };
      tx.update(ref, { webDiscount: null, total, updatedAt: now });
      return { ok: true, unchanged: false, webDiscount: null, subtotal, shippingCost, total };
    }

    if (!(subtotal > 0)) return fail('INVALID_VALUE', 'This order has no item value to discount.');
    if (discount.amount > subtotal + 0.005) {
      return fail('EXCEEDS_SUBTOTAL', 'The discount cannot be more than the items subtotal.');
    }
    const amount = webDiscountAmount(discount.amount, subtotal);
    const stored = {
      amount,
      reason: discount.reason,
      appliedAt: now,
      appliedByUid: String(actorUid ?? ''),
      appliedByName: actorName ? String(actorName) : null,
    };
    const total = round2(subtotal - amount + shippingCost);
    // Replaces the whole field, so a record left over from the removed percentage
    // option (local test data only) is rewritten in the fixed-amount shape.
    tx.update(ref, { webDiscount: stored, total, updatedAt: now });
    return { ok: true, unchanged: false, webDiscount: stored, subtotal, shippingCost, total };
  });
}

/**
 * HTTP handler body for POST /api/admin/orders/discount (server/index.js and the Vite dev
 * mirror). `auth` is the verifyAdminRequest() result: owners only — a profile "admin"
 * role or a cashier is refused (403), a missing/invalid token gets 401.
 */
export async function handleWebOrderDiscountRequest(db, auth, body, { now } = {}) {
  if (!auth?.ok) return { status: auth?.status || 401, body: { ok: false, code: 'FORBIDDEN', message: auth?.message || 'Not authorized.' } };
  const input = validateWebDiscountRequest(body);
  if (!input.ok) return { status: 400, body: input };
  if (!db) return { status: 503, body: { ok: false, code: 'UNKNOWN', message: 'Orders are temporarily unavailable.' } };
  const result = await setWebOrderDiscount(db, {
    actorUid: auth.uid,
    actorName: auth.email || null,
    orderId: input.orderId,
    discount: input.discount,
    expectedSubtotal: input.expectedSubtotal,
    ...(now ? { now } : {}),
  });
  if (!result.ok) return { status: result.code === 'NOT_FOUND' ? 404 : result.code === 'ORDER_CHANGED' ? 409 : 400, body: result };
  return { status: 200, body: { ...result, webDiscount: serializeWebDiscount(result.webDiscount) } };
}
