// Pure helpers for the Returns page (no Firestore access — unit tested).
import type { ReturnRecord } from '../../types/returns';
import { phoneDigitsCore } from '../orders/orderListFilters';
import { normalizeSearchText } from '../orders/searchText';

export type ReturnShelfFilter = 'open' | 'quarantine' | 'needs_repair' | 'resolved' | 'all';

/** Still on the shelf = not sellable yet. */
export function isOnShelf(record: Pick<ReturnRecord, 'status'>): boolean {
  return record.status === 'quarantine' || record.status === 'needs_repair';
}

export function returnShelfCounts(records: ReturnRecord[]) {
  const byFilter: Record<ReturnShelfFilter, number> = { open: 0, quarantine: 0, needs_repair: 0, resolved: 0, all: records.length };
  let unitsOnShelf = 0;
  let restocked = 0;
  let damaged = 0;
  let manualReview = 0;
  for (const r of records) {
    byFilter[r.status] += 1;
    if (isOnShelf(r)) {
      byFilter.open += 1;
      unitsOnShelf += r.quantity;
    } else if (r.disposition === 'restocked') restocked += 1;
    else if (r.disposition === 'damaged') damaged += 1;
    else if (r.disposition === 'manual_review') manualReview += 1;
  }
  return { byFilter, open: byFilter.open, unitsOnShelf, restocked, damaged, manualReview };
}

/** Status filter + free-text search over product, customer, phone (by digits) and order id. */
export function filterReturns(records: ReturnRecord[], filter: ReturnShelfFilter, rawQuery: string): ReturnRecord[] {
  const q = normalizeSearchText(rawQuery);
  const qDigits = phoneDigitsCore(rawQuery);
  return records.filter((r) => {
    if (filter === 'open' && !isOnShelf(r)) return false;
    if (filter !== 'open' && filter !== 'all' && r.status !== filter) return false;
    if (!q) return true;
    const haystack = normalizeSearchText([r.productName, r.colorName, r.size, r.customerName, r.orderId, r.id].join(' '));
    if (haystack.includes(q)) return true;
    return qDigits.length >= 3 && phoneDigitsCore(r.customerPhone).includes(qDigits);
  });
}
