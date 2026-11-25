import type { OrderReturnSummary } from './returns';

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Admin list bucket for an order whose STORED status is not exactly one of
 * ORDER_STATUSES (unknown like "Refunded", mis-cased/padded like " Processing ",
 * empty or missing). Such orders are listed and counted under "Needs review" —
 * never under 'pending' — so list counts match the dashboard's exact-match
 * `status == 'pending'` query. Transition/cancel safety still uses the
 * normalised `status` (see orderUtils.normalizeOrderStatus).
 */
export const NEEDS_REVIEW_BUCKET = 'needs_review' as const;

export type OrderListBucket = OrderStatus | typeof NEEDS_REVIEW_BUCKET;

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
  /** Catchy delivery place id (server/lib/delivery/deliveryLocations.js) — required. */
  deliveryLocationId: string;
  /** Optional street, building, house number and directions ('' when left empty). */
  deliveryAddress: string;
  email?: string | null;
  /** The delivery price the customer was shown; the order is refused if the current price differs. */
  expectedShippingCost?: number | null;
};

/**
 * What an order stores about its delivery place (written at checkout, never re-read from
 * the place list): its name and region as they were, and the delivery price charged.
 */
export type DeliveryLocationSnapshot = {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  regionNameEn: string | null;
  price: number | null;
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

/**
 * Admin whole-order discount on a WEB order (never POS — POS uses `discount`): a fixed
 * ILS amount with a reason. Written by the owner-only server endpoint
 * (server/lib/webOrderDiscount.js). Totals: `total = subtotal − amount + shippingCost`;
 * item prices are never changed.
 */
export type WebOrderDiscount = {
  /** The ILS taken off the items subtotal (never above the subtotal; shipping is never discounted). */
  amount: number;
  reason: string | null;
  appliedAt: Date | null;
  appliedByUid: string | null;
  appliedByName: string | null;
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

/** One order line as recorded in a web-order cancellation audit entry. */
export type CancellationLine = {
  productId: string;
  name: string | null;
  colorId: string | null;
  size: string | null;
  quantity: number;
  /** Only on skipped lines: why stock was not put back automatically (see server/lib/webOrderCancel.js). */
  reason?: 'coordinate_set' | 'product_missing' | 'variant_missing' | 'size_missing' | 'not_restocked';
};

/**
 * Recorded once (and only once — cancellation is terminal). For a POS sale see
 * PosSaleCancelModal; for a web order see server/lib/webOrderCancel.js.
 * `order.status` becomes 'cancelled'; `items`/`total`/`payment` are preserved
 * untouched as the historical record of what was sold.
 */
export type PosSaleCancellation = {
  cancelledAt: Date | null;
  cancelledByUid: string;
  cancelledByName: string | null;
  reason: string | null;
  /** The register session's open/closed status at the moment of cancellation (POS only, informational). */
  registerSessionStatusAtCancellation: 'open' | 'closed' | null;
  /** Web orders only: status the order had when it was cancelled. */
  previousStatus?: OrderStatus | null;
  /** Web orders only: whether stock was put back. */
  restockApplied?: boolean;
  restoredLines?: CancellationLine[];
  skippedLines?: CancellationLine[];
};

export type OrderRecord = {
  id: string;
  userId: string;
  isGuest: boolean;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  /** Optional street / building / directions (newer orders); the full free-text address on older ones. */
  deliveryAddress: string | null;
  /** Orders from the old checkout only: one of the four former zones (see src/lib/shippingZones.ts). */
  deliveryZone: string | null;
  /** Newer web orders: the chosen delivery place, as it was at checkout. Absent on older orders and POS sales. */
  deliveryLocation?: DeliveryLocationSnapshot | null;
  status: OrderStatus;
  /** The stored status was not a known value even after trim + lower-case; such orders are never cancelled/restocked. */
  statusUnrecognized?: boolean;
  /** The status exactly as stored (null when missing or not a string) — shown on "Needs review" badges. */
  rawStatus?: string | null;
  /** Stored status is not exactly a canonical value — listed under "Needs review" (see NEEDS_REVIEW_BUCKET). */
  statusNeedsReview?: boolean;
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
  /** Web orders only: admin whole-order discount (absent/null = none). See WebOrderDiscount. */
  webDiscount?: WebOrderDiscount | null;
  /**
   * Set only after a POS sale correction: `total - originalPaymentCollected`.
   * Positive = customer now owes more than they paid; negative = a refund is
   * owed; never auto-applied — see PosSaleCorrectionModal. Absent/undefined
   * for every order that has never been corrected.
   */
  balanceDue?: number | null;
  correctionCount?: number;
  corrections?: PosSaleCorrection[];
  /** Set only once a POS sale or web order is cancelled (status becomes 'cancelled'). Absent/undefined/null otherwise. */
  cancellation?: PosSaleCancellation | null;
  /** Who last changed `status` from the admin, and when (absent on older orders). */
  statusUpdatedAt?: Date | null;
  statusUpdatedByUid?: string | null;
  statusUpdatedByName?: string | null;
  /** Internal staff note — never shown to the customer. */
  adminNote?: string | null;
  adminNoteUpdatedAt?: Date | null;
  adminNoteUpdatedByName?: string | null;
  /**
   * Returns shelf summary (server-written). Once any return exists the order can no
   * longer be cancelled, moved backwards or have its items edited.
   */
  returnSummary?: OrderReturnSummary | null;
};

/** The admin performing a change, stamped onto the order for attribution. */
export type OrderActor = {
  uid: string;
  name: string | null;
};

export type PlaceOrderResult = {
  orderId: string;
  total: number;
  itemCount: number;
};
