export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The single rule for "does this order still represent real revenue?" — a
 * cancelled web order was never fulfilled/paid, and a cancelled POS sale has
 * had its stock restored and is void. Shared by every revenue calculation
 * (client-side sums in orderUtils/orderCustomerSummary, and the `status`
 * filter on the Firestore aggregate query in AdminDashboard) so they can't
 * silently drift apart.
 */
export const CANCELLED_ORDER_STATUS: OrderStatus = 'cancelled';

export const GUEST_USER_ID = 'guest';

export type CartLineItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  stock: number;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  /** Per-product size picks for coordinate sets (productId → size). */
  itemSizes?: Record<string, string>;
  lineKey: string;
};

export type OrderLineItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  lineTotal: number;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  itemSizes?: Record<string, string>;
};

export type DeliveryDetails = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryZone: string;
  email?: string | null;
};

export type OrderCustomer = {
  uid: string;
  email: string | null;
  displayName: string | null;
  delivery?: DeliveryDetails;
};

export type PosPaymentMethod = 'cash' | 'card' | 'split';

export type PosPayment = {
  method: PosPaymentMethod;
  cashAmount: number;
  cardAmount: number;
  changeGiven: number;
};

export type PosDiscountMode = 'percent' | 'amount';

export type PosDiscount = {
  mode: PosDiscountMode;
  value: number;
  amount: number;
  reason?: string | null;
};

/** One entry in a POS sale's correction audit trail — see PosSaleCorrectionModal. */
export type PosSaleCorrection = {
  correctedAt: Date | null;
  correctedByUid: string;
  correctedByName: string | null;
  reason: string | null;
  /** The register session's open/closed status at the moment of correction (informational only). */
  registerSessionStatusAtCorrection: 'open' | 'closed' | null;
  before: { items: OrderLineItem[]; subtotal: number | null; discount: PosDiscount | null; total: number | null };
  after: { items: OrderLineItem[]; subtotal: number; discount: PosDiscount | null; total: number };
};

/**
 * Recorded once (and only once — cancellation is terminal) when a completed
 * POS sale is voided — see PosSaleCancelModal. `order.status` becomes
 * 'cancelled'; `items`/`total`/`payment` are preserved untouched as the
 * historical record of what was sold and collected.
 */
export type PosSaleCancellation = {
  cancelledAt: Date | null;
  cancelledByUid: string;
  cancelledByName: string | null;
  reason: string | null;
  /** The register session's open/closed status at the moment of cancellation (informational only). */
  registerSessionStatusAtCancellation: 'open' | 'closed' | null;
};

export type OrderRecord = {
  id: string;
  userId: string;
  isGuest: boolean;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryZone: string | null;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  itemCount: number;
  createdAt: Date | null;
  items: OrderLineItem[];
  /** Sale channel — 'pos' for in-person register sales. Absent/undefined means 'web'. */
  source?: 'web' | 'pos';
  registerSessionId?: string | null;
  cashierUid?: string | null;
  cashierName?: string | null;
  payment?: PosPayment | null;
  discount?: PosDiscount | null;
  /**
   * Set only after a POS sale correction: `total - originalPaymentCollected`.
   * Positive = customer now owes more than they paid; negative = a refund is
   * owed; never auto-applied — see PosSaleCorrectionModal. Absent/undefined
   * for every order that has never been corrected.
   */
  balanceDue?: number | null;
  correctionCount?: number;
  corrections?: PosSaleCorrection[];
  /** Set only once a POS sale is cancelled (status becomes 'cancelled'). Absent/undefined/null otherwise. */
  cancellation?: PosSaleCancellation | null;
};

export type PlaceOrderResult = {
  orderId: string;
  total: number;
  itemCount: number;
};
