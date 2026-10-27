// Visual language of the admin Orders page, adapted from the Sisley store's
// Orders page (read-only reference: sisley-store/src/admin/components/ui.tsx,
// OrderStatusCards.tsx, DataTable.tsx, pages/orders/OrderList.tsx).
//
// Palette values are Sisley's own light-theme tokens (cream / paper / ink / line /
// wine / olive / sand), written as literal Tailwind arbitrary classes so they apply
// to this page only — Catchy's global theme and every other page are unchanged.
//
// The one deliberate departure: Sisley's brand accent (wine) is used there for
// focus borders, checkboxes and the active-card ring. Here that accent is
// Catchy's own green (ACCENT_*), so the page still belongs to Catchy. Sisley's
// wine is still used where it carries meaning (the danger/cancelled tone and the
// cancel action), exactly as Sisley does.
import { NEEDS_REVIEW_BUCKET, type OrderListBucket } from '../../types/order';

/** Page canvas, surfaces, text and borders (Sisley tokens). */
export const OL = {
  canvas: 'bg-[#f6f3ee]', // --color-cream
  surface: 'bg-[#fffefc]', // --color-paper
  surfaceDim: 'bg-[#efeae1]', // --color-cream-dim
  headRow: 'bg-[#efeae1]/60',
  rowHover: 'hover:bg-[#efeae1]/40',
  ink: 'text-[#1c1a17]',
  inkSoft: 'text-[#6f6a62]',
  inkFaint: 'text-[#a49d92]',
  border: 'border-[#e4ddd0]', // --color-line
  divider: 'bg-[#e4ddd0]',
  shadowSoft: 'shadow-[0_2px_10px_rgba(28,26,23,0.06)]',
  shadowCard: 'hover:shadow-[0_10px_30px_-14px_rgba(28,26,23,0.22)]',
} as const;

/** Catchy accent in the places Sisley uses its wine accent (see header comment). */
export const ACCENT_FOCUS = 'focus:border-catchy';
export const ACCENT_CHECKBOX = 'accent-catchy';
export const ACCENT_RING = 'ring-2 ring-catchy ring-offset-2 ring-offset-[#f6f3ee]';

/** Sisley's form-field look (AdminInput / AdminSelect). */
export const FIELD_CLASS = `rounded-lg border ${OL.border} ${OL.surface} px-3.5 py-2.5 text-sm ${OL.ink} outline-none transition-colors placeholder:text-[#a49d92] ${ACCENT_FOCUS}`;

/** Sisley AdminButton (variant "secondary", size "md"). */
export const BUTTON_SECONDARY = `inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border ${OL.border} bg-transparent px-4 py-2.5 text-sm font-semibold ${OL.ink} transition-colors hover:bg-[#efeae1] disabled:cursor-not-allowed disabled:opacity-50`;

/** Sisley BADGE_TONE (ui.tsx). */
export const BADGE_TONE = {
  neutral: 'bg-[#efeae1] text-[#6f6a62]',
  success: 'bg-[#e7e6da] text-[#5f6247]',
  warning: 'bg-[#e8ddc9] text-[#4f1526]',
  danger: 'bg-[#f3e2e6] text-[#6e1e36]',
  info: 'bg-[#efeae1] text-[#1c1a17]',
} as const;
export type BadgeTone = keyof typeof BADGE_TONE;

/**
 * Status → badge tone, Sisley's STATUS_TONE (OrderList.tsx) mapped onto Catchy's
 * statuses. "Needs review" (Catchy-only; often a legacy "Refunded") takes the tone
 * Sisley gives "refunded".
 */
export const STATUS_BADGE_TONE: Record<OrderListBucket, BadgeTone> = {
  pending: 'neutral',
  processing: 'warning',
  shipped: 'info',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
  [NEEDS_REVIEW_BUCKET]: 'danger',
};

/**
 * Status icons. In Sisley these are emoji that are part of each status label
 * ("Awaiting Preparation 📥", "Out for Delivery ✈️", …); Catchy keeps its own
 * (shared, customer-facing) label text and shows the same emoji beside it on admin
 * screens. "Completed" has no emoji in Sisley either; ⚠️ is Catchy's own marker
 * for the "Needs review" bucket.
 */
export const STATUS_ICON: Record<OrderListBucket, string | null> = {
  pending: '📥',
  processing: '📥',
  shipped: '✈️',
  delivered: '✅',
  completed: null,
  cancelled: '❌',
  [NEEDS_REVIEW_BUCKET]: '⚠️',
};

/**
 * Status summary cards — Sisley's ORDER_STATUS_CARD_CLASSES (OrderStatusCards.tsx):
 * one strong, fully-saturated colour per status. "Needs review" uses the fuchsia
 * Sisley gives "refunded".
 */
export const STATUS_CARD_CLASS: Record<OrderListBucket, string> = {
  pending: 'bg-purple-600 text-white',
  processing: 'bg-orange-600 text-white',
  shipped: 'bg-blue-600 text-white',
  delivered: 'bg-amber-500 text-amber-950',
  cancelled: 'bg-red-600 text-white',
  completed: 'bg-teal-600 text-white',
  [NEEDS_REVIEW_BUCKET]: 'bg-fuchsia-600 text-white',
};

/** Card order on the page (Catchy's statuses, workflow order, then Needs review). */
export const STATUS_CARD_ORDER: OrderListBucket[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'completed',
  NEEDS_REVIEW_BUCKET,
];

/** Sisley's row quick-action icon colours (OrderList.tsx ActionIcon usages). */
export const ACTION_TONE = {
  view: 'bg-cyan-600 text-white hover:bg-cyan-700',
  invoice: 'bg-emerald-600 text-white hover:bg-emerald-700',
  customer: 'bg-blue-600 text-white hover:bg-blue-700',
  call: 'bg-purple-600 text-white hover:bg-purple-700',
  return: 'bg-amber-600 text-white hover:bg-amber-700',
  cancel: 'bg-[#6e1e36] text-[#fffefc] hover:bg-[#4f1526]',
} as const;
