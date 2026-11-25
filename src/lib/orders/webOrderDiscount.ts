import type { OrderRecord } from '../../types/order';

/**
 * Admin whole-order discount on WEB orders — client side of the rule enforced by the
 * owner-only server endpoint (server/lib/webOrderDiscount.js; keep the two in step).
 * A fixed ILS amount only (no percentages), with a required reason. POS sales never
 * use this: they keep their own `discount` field and logic.
 *
 *   amount = the fixed ILS discount, never above the items subtotal (shipping is never discounted);
 *   total  = subtotal − amount + shippingCost.
 * Always derived from the item subtotal and the discount, never from a previous total,
 * so re-saving can never discount twice.
 */

export const MAX_WEB_DISCOUNT_REASON_LENGTH = 200;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The fixed discount that applies to `subtotal`: rounded, never negative, never above the subtotal. */
export function webDiscountAmount(amount: number | null | undefined, subtotal: number): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || !(subtotal > 0)) return 0;
  return Math.min(round2(value), round2(subtotal));
}

export function webOrderTotal(subtotal: number, shippingCost: number, discountAmount: number): number {
  return round2(subtotal - discountAmount + shippingCost);
}

/** The ILS an admin took off this order (0 for POS sales and orders without a web discount). */
export function orderWebDiscountAmount(order: Pick<OrderRecord, 'source' | 'webDiscount'>): number {
  if (order.source === 'pos') return 0;
  return order.webDiscount?.amount ?? 0;
}

export type WebDiscountDraft = {
  mode: 'none' | 'amount';
  /** Raw ILS text from the input. */
  amount: string;
  reason: string;
};

export type WebDiscountDraftError = 'INVALID_VALUE' | 'TOO_MANY_DECIMALS' | 'EXCEEDS_SUBTOTAL' | 'REASON_REQUIRED' | 'REASON_TOO_LONG' | 'NO_SUBTOTAL';

export type ValidatedWebDiscountDraft =
  | { ok: true; discount: { amount: number; reason: string } | null; amount: number }
  | { ok: false; error: WebDiscountDraftError };

/** Same checks as the server, so the dialog can explain a problem before saving. `mode: 'none'` = no discount. */
export function validateWebDiscountDraft(draft: WebDiscountDraft, subtotal: number): ValidatedWebDiscountDraft {
  if (draft.mode === 'none') return { ok: true, discount: null, amount: 0 };
  const text = draft.amount.trim().replace(',', '.');
  const value = /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isFinite(value) || round2(value) <= 0) return { ok: false, error: 'INVALID_VALUE' };
  if (Math.abs(round2(value) - value) > 1e-9) return { ok: false, error: 'TOO_MANY_DECIMALS' };
  if (!(subtotal > 0)) return { ok: false, error: 'NO_SUBTOTAL' };
  if (value > subtotal + 0.005) return { ok: false, error: 'EXCEEDS_SUBTOTAL' };
  const reason = draft.reason.trim();
  if (!reason) return { ok: false, error: 'REASON_REQUIRED' };
  if (reason.length > MAX_WEB_DISCOUNT_REASON_LENGTH) return { ok: false, error: 'REASON_TOO_LONG' };
  const amount = round2(value);
  return { ok: true, discount: { amount, reason }, amount: webDiscountAmount(amount, subtotal) };
}

export function webDiscountDraftFromOrder(order: Pick<OrderRecord, 'webDiscount'>): WebDiscountDraft {
  const d = order.webDiscount;
  return d ? { mode: 'amount', amount: String(d.amount), reason: d.reason ?? '' } : { mode: 'none', amount: '', reason: '' };
}

/** True when the draft differs from what is stored (so saving would change the discount). */
export function webDiscountDraftChanged(order: Pick<OrderRecord, 'webDiscount'>, draft: WebDiscountDraft): boolean {
  const d = order.webDiscount;
  if (!d) return draft.mode !== 'none';
  if (draft.mode === 'none') return true;
  const amount = Number(draft.amount.trim().replace(',', '.'));
  return !(Math.abs(amount - d.amount) < 1e-9) || draft.reason.trim() !== (d.reason ?? '');
}
