// Shared, dependency-free view of an order's return state (written only by
// server/lib/webOrderReturn.js). Kept separate so webOrderCancel.js and
// webOrderReturn.js don't import each other.

/** Line identity used for return caps — same key shape as posSaleCorrection.js's lineKey. */
export function returnLineKey(item) {
  return [String(item?.productId ?? ''), item?.colorId ?? '', item?.size ?? ''].join('|~|');
}

function wholeNonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * The order's `returnSummary`, sanitised: anything malformed (or negative)
 * counts as 0 so it can never *raise* how much of a line may be returned.
 */
export function readReturnSummary(order) {
  const raw = order?.returnSummary && typeof order.returnSummary === 'object' ? order.returnSummary : {};
  const byKey = raw.returnedQtyByKey && typeof raw.returnedQtyByKey === 'object' && !Array.isArray(raw.returnedQtyByKey)
    ? raw.returnedQtyByKey
    : {};
  const returnedQtyByKey = {};
  for (const [key, qty] of Object.entries(byKey)) {
    const n = wholeNonNegative(qty);
    if (n > 0) returnedQtyByKey[key] = n;
  }
  return {
    returnCount: wholeNonNegative(raw.returnCount),
    openCount: wholeNonNegative(raw.openCount),
    returnedQtyByKey,
  };
}

/**
 * True once any return was logged against the order. Such an order must never
 * be cancelled, moved backwards or have its items edited — each of those could
 * put the same units back into stock a second time.
 */
export function orderHasReturns(order) {
  const summary = readReturnSummary(order);
  return summary.returnCount > 0 || Object.keys(summary.returnedQtyByKey).length > 0;
}
