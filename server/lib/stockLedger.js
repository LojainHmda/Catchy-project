// Stock movement ledger (`stockMovements`, append-only). One entry per stock cell
// (product + colour + size) whose quantity changed, written in the SAME
// transaction as the stock write it describes, so the ledger can never claim a
// change that did not happen (or miss one that did).
//
// Written today by: returns restock (webOrderReturn.js) and web order
// cancellation restock (webOrderCancel.js). Other stock writers (checkout, POS,
// admin edits) are not recorded yet — the ledger is a partial history.

import { resolveProductInventory } from './posSaleCorrection.js';

export const STOCK_MOVEMENT_REASONS = ['return_restock', 'order_cancelled'];

const CELL_SEPARATOR = '|~|';

/** qty per stock cell, keyed `${colorId}|~|${size}` ('' when the product has no colours/sizes). */
function stockCells(data) {
  const inv = resolveProductInventory(data ?? {});
  const cells = new Map();
  if (inv.hasVariants) {
    for (const variant of inv.colorVariants) {
      for (const [size, qty] of Object.entries(variant.sizeStock)) cells.set(`${variant.id}${CELL_SEPARATOR}${size}`, qty);
    }
  } else if (Object.keys(inv.sizeStock).length > 0) {
    for (const [size, qty] of Object.entries(inv.sizeStock)) cells.set(`${CELL_SEPARATOR}${size}`, qty);
  } else {
    cells.set(CELL_SEPARATOR, inv.stock);
  }
  return cells;
}

/**
 * Ledger entries for one product write: compares the product before and after
 * `payload` is applied. Only cells whose quantity changed produce an entry.
 * @param {string} productId
 * @param {Record<string, unknown>} beforeData  product document as read in the transaction
 * @param {Record<string, unknown>} payload     the stock fields about to be written
 * @param {{ reason: string, actorUid: string, actorName: string|null, at: Date,
 *           orderId?: string|null, returnId?: string|null }} ctx
 */
export function stockMovementEntries(productId, beforeData, payload, ctx) {
  if (!STOCK_MOVEMENT_REASONS.includes(ctx.reason)) throw new Error('UNKNOWN_STOCK_MOVEMENT_REASON');
  const before = stockCells(beforeData);
  const after = stockCells({ ...(beforeData ?? {}), ...payload });
  const entries = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const qtyBefore = before.get(key) ?? 0;
    const qtyAfter = after.get(key) ?? 0;
    if (qtyBefore === qtyAfter) continue;
    const [colorId, size] = key.split(CELL_SEPARATOR);
    entries.push({
      productId,
      productName: typeof beforeData?.name === 'string' ? beforeData.name : null,
      colorId: colorId || null,
      size: size || null,
      qtyBefore,
      qtyChange: qtyAfter - qtyBefore,
      qtyAfter,
      reason: ctx.reason,
      source: 'admin',
      orderId: ctx.orderId ?? null,
      returnId: ctx.returnId ?? null,
      actorUid: ctx.actorUid,
      actorName: ctx.actorName || null,
      createdAt: ctx.at,
    });
  }
  return entries;
}
