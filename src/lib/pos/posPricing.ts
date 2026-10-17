import type { PosDiscountMode } from '../../types/pos';

export type PosDiscountDraft = {
  enabled: boolean;
  mode: PosDiscountMode;
  /** Raw text input — percent (1-100) or a flat amount, depending on `mode`. */
  value: string;
  reason: string;
};

export const emptyDiscountDraft = (): PosDiscountDraft => ({
  enabled: false,
  mode: 'percent',
  value: '',
  reason: '',
});

/** Live client-side preview only — the server independently recomputes and clamps this on submit. */
export function resolveDiscountAmount(draft: PosDiscountDraft, subtotal: number): number {
  if (!draft.enabled) return 0;
  const raw = parseFloat(draft.value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  let amount: number;
  if (draft.mode === 'percent') {
    const pct = Math.min(100, Math.max(0, raw));
    amount = subtotal * (pct / 100);
  } else {
    amount = Math.max(0, raw);
  }
  amount = Math.min(amount, subtotal);
  return Math.round(amount * 100) / 100;
}
