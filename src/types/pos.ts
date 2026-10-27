import type { CancellationLine, PosDiscountMode, PosPayment } from './order';

export type { PosDiscount, PosPayment, PosPaymentMethod, PosDiscountMode } from './order';

/** What the client sends for a discount — the server independently computes and clamps `amount`. */
export type PosDiscountInput = {
  mode: PosDiscountMode;
  value: number;
  reason?: string | null;
};

export type PosCartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  /** Stock available for this exact selection, at time of adding — used to clamp qty steppers. */
  availableStock: number;
  lineKey: string;
};

export type RegisterSessionStatus = 'open' | 'closed';

export type RegisterSession = {
  id: string;
  cashierUid: string;
  cashierEmail: string | null;
  cashierName: string | null;
  status: RegisterSessionStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  openingCashFloat: number;
  expectedCashAtClose: number | null;
  countedCashAtClose: number | null;
  cashVarianceAtClose: number | null;
  salesCount: number;
  cashTotal: number;
  cardTotal: number;
  discountTotal: number;
  grossTotal: number;
  notes: string | null;
};

export type PosSaleResult = {
  orderId: string;
  total: number;
  itemCount: number;
  changeGiven: number;
};

export type PosSaleCorrectionLineInput = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  image?: string;
};

export type PosSaleCorrectionPayload = {
  orderId: string;
  items: PosSaleCorrectionLineInput[];
  discount: PosDiscountInput | null;
  reason?: string | null;
  /** Client-generated once per correction attempt — lets the server no-op a retried request instead of double-applying it. */
  idempotencyKey: string;
};

export type PosSaleCorrectionResult = {
  total: number;
  itemCount: number;
  balanceDue: number;
  alreadyApplied: boolean;
  /** Units given back that could not be restocked (product/colour/size no longer exists) — never re-created. */
  skippedLines: CancellationLine[];
};

export type PosSaleCancellationPayload = {
  orderId: string;
  /** Required — see PosSaleCancelModal. */
  reason: string;
  /** Client-generated once per cancellation attempt — lets the server no-op a retried request instead of restoring stock twice. */
  idempotencyKey: string;
};

export type PosSaleCancellationResult = {
  alreadyCancelled: boolean;
  /** The full amount now owed back to the customer (originally-collected cash+card); never auto-refunded. */
  refundDue: number;
  /** Only present when this call actually performed the cancellation (alreadyCancelled: false) — the server's authoritative record of it, for an accurate optimistic UI patch. */
  cancelledAt: Date | null;
  cancelledByUid: string | null;
  cancelledByName: string | null;
  reason: string | null;
  registerSessionStatusAtCancellation: 'open' | 'closed' | null;
  /** Lines that could not be restocked (product/colour/size no longer exists) — never re-created. */
  skippedLines: CancellationLine[];
};

export type PosSalePayload = {
  registerSessionId: string;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    size?: string | null;
    colorId?: string | null;
    colorName?: string | null;
    image?: string;
  }>;
  discount: PosDiscountInput | null;
  payment: PosPayment;
  customer?: { name?: string | null; phone?: string | null } | null;
};
