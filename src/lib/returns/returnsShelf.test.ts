import { describe, it, expect } from 'vitest';
import { filterReturns, isOnShelf, returnShelfCounts } from './returnsShelf';
import { parseReturnRecord } from './returnsApi';
import type { ReturnRecord } from '../../types/returns';

const rec = (overrides: Record<string, unknown>): ReturnRecord =>
  parseReturnRecord(String(overrides.id ?? 'r'), {
    orderId: 'order-1', productId: 'p', productName: 'Test Linen Skirt (M)', quantity: 1, status: 'quarantine',
    customerName: 'Test Customer A', customerPhone: '0590000001', reason: 'wrong_size', ...overrides,
  });

const records = [
  rec({ id: 'a', status: 'quarantine', quantity: 2 }),
  rec({ id: 'b', status: 'needs_repair' }),
  rec({ id: 'c', status: 'resolved', disposition: 'restocked' }),
  rec({ id: 'd', status: 'resolved', disposition: 'damaged', productName: 'Test Silk Scarf' }),
  rec({ id: 'e', status: 'resolved', disposition: 'manual_review', customerPhone: '0590000099' }),
];

describe('returns shelf helpers', () => {
  it('counts what is still on the shelf (not sellable) and each outcome', () => {
    expect(returnShelfCounts(records)).toMatchObject({
      open: 2, unitsOnShelf: 3, restocked: 1, damaged: 1, manualReview: 1,
      byFilter: { open: 2, quarantine: 1, needs_repair: 1, resolved: 3, all: 5 },
    });
    expect(isOnShelf(records[0])).toBe(true);
    expect(isOnShelf(records[2])).toBe(false);
  });

  it('filters by status and searches product, customer and phone digits', () => {
    expect(filterReturns(records, 'open', '').map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterReturns(records, 'resolved', 'scarf').map((r) => r.id)).toEqual(['d']);
    expect(filterReturns(records, 'all', '٠٥٩٠٠٠٠٠٩٩').map((r) => r.id)).toEqual(['e']);
  });

  it('parses unknown values defensively (never invents a disposition or status)', () => {
    const r = rec({ status: 'refunded', disposition: 'refund', reason: 'whatever', quantity: -3 });
    expect(r).toMatchObject({ status: 'quarantine', disposition: null, reason: null, quantity: 0 });
  });
});
