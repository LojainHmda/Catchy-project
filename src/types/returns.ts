// Returns shelf (web orders) — mirrors server/lib/webOrderReturn.js. All writes go
// through the owner-only server endpoints; the client only reads `returns`.

export const RETURN_REASONS = ['wrong_size', 'wrong_color', 'defective', 'not_as_described', 'changed_mind', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** quarantine/needs_repair = still on the shelf (not sellable); resolved = final. */
export const RETURN_STATUSES = ['quarantine', 'needs_repair', 'resolved'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_DISPOSITIONS = ['restocked', 'damaged', 'manual_review'] as const;
export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

/** Why a return could not simply be put back into stock (same codes as web cancellation). */
export type RestockSkipReason = 'coordinate_set' | 'product_missing' | 'variant_missing' | 'size_missing';

export type ReturnHistoryEntry = {
  at: Date | null;
  byUid: string;
  byName: string | null;
  action: 'received' | 'inspected' | 'resolved';
  status?: ReturnStatus;
  disposition?: ReturnDisposition;
  notesUpdated?: boolean;
  restockSkipReason?: RestockSkipReason;
};

export type ReturnRecord = {
  id: string;
  orderId: string;
  orderStatusAtIntake: string | null;
  customerName: string | null;
  customerPhone: string | null;
  lineKey: string;
  productId: string;
  colorId: string | null;
  colorName: string | null;
  size: string | null;
  productName: string;
  image: string;
  quantity: number;
  reason: ReturnReason | null;
  note: string | null;
  status: ReturnStatus;
  disposition: ReturnDisposition | null;
  inspectionNotes: string | null;
  restockApplied: boolean;
  restockSkipReason: RestockSkipReason | null;
  resolutionNote: string | null;
  createdAt: Date | null;
  createdByName: string | null;
  updatedAt: Date | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  history: ReturnHistoryEntry[];
};

/** Server-maintained summary on the order document (never written by the client). */
export type OrderReturnSummary = {
  returnCount: number;
  openCount: number;
  returnedQtyByKey: Record<string, number>;
  lastReturnAt: Date | null;
};
