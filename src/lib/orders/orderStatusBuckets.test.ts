import { describe, it, expect } from 'vitest';
import { NEEDS_REVIEW_BUCKET, ORDER_STATUSES } from '../../types/order';
import { isCanonicalOrderStatus, normalizeOrderStatus, orderListBucket, parseOrderDocument } from './orderUtils';
import { canCancelWebOrder, countOrdersByBucket, ordersCsvRows, sortOrders } from './orderListFilters';

// The stored statuses of the synthetic emulator dataset (scripts/emulator/seedData.mjs).
const SYNTHETIC_STORED_STATUSES: Record<string, unknown> = {
  'test-o-blue': 'pending',
  'test-o-cancelled-old': 'cancelled',
  'test-o-coordinate': 'pending',
  'test-o-deleted-product': 'processing',
  'test-o-delivered': 'delivered',
  'test-o-legacy-status': 'Refunded',
  'test-o-mixed-case': ' Processing ',
  'test-o-old-period': 'delivered',
  'test-o-pending': 'pending',
  'test-o-pos': 'completed',
  'test-o-processing': 'processing',
  'test-o-removed-color': 'pending',
  'test-o-shipped': 'shipped',
};

const parse = (id: string, status: unknown) =>
  parseOrderDocument(id, { status, items: [], total: 10, ...(status === 'completed' ? { source: 'pos' } : {}) });

/** What the dashboard / nav badge count: Firestore `where('status', '==', 'pending')` (exact string). */
const dashboardExactPending = (stored: Record<string, unknown>) => Object.values(stored).filter((s) => s === 'pending').length;

describe('P0 — unknown statuses go to "Needs review", never to pending', () => {
  it('dashboard pending count equals the Orders page pending count on the synthetic dataset (4 = 4)', () => {
    const orders = Object.entries(SYNTHETIC_STORED_STATUSES).map(([id, s]) => parse(id, s));
    const buckets = countOrdersByBucket(orders);
    expect(dashboardExactPending(SYNTHETIC_STORED_STATUSES)).toBe(4);
    expect(buckets.pending).toBe(4);
    expect(buckets[NEEDS_REVIEW_BUCKET]).toBe(2); // "Refunded" and " Processing "
    expect(buckets.all).toBe(13);
    // Every order is in exactly one bucket.
    const sum = [...ORDER_STATUSES, NEEDS_REVIEW_BUCKET].reduce((n, b) => n + (buckets[b] ?? 0), 0);
    expect(sum).toBe(13);
  });

  it.each([
    ['an unknown legacy value', 'Refunded'],
    ['a mis-cased known value', 'Pending'],
    ['a padded known value', ' pending '],
    ['an empty string', ''],
    ['a missing status', undefined],
    ['a non-string status', 42],
  ])('%s is listed under Needs review and NOT counted as pending', (_label, stored) => {
    const order = parse('x', stored);
    expect(order.statusNeedsReview).toBe(true);
    expect(orderListBucket(order)).toBe(NEEDS_REVIEW_BUCKET);
    expect(countOrdersByBucket([order]).pending ?? 0).toBe(0);
    expect(order.rawStatus).toBe(typeof stored === 'string' ? stored : null);
  });

  it.each(ORDER_STATUSES.map((s) => [s]))('canonical "%s" keeps its own bucket', (status) => {
    const order = parse('x', status);
    expect(order.statusNeedsReview).toBe(false);
    expect(orderListBucket(order)).toBe(status);
    expect(isCanonicalOrderStatus(status)).toBe(true);
  });

  it('transition/cancel safety is unchanged: normalisation still applies and unknown values stay non-cancellable', () => {
    expect(normalizeOrderStatus(' Processing ')).toBe('processing');
    expect(normalizeOrderStatus('Refunded')).toBe('pending');
    const legacy = parse('x', 'Refunded');
    expect(legacy.statusUnrecognized).toBe(true);
    expect(canCancelWebOrder(legacy)).toBe(false);
    const mixed = parse('y', ' Processing ');
    expect(mixed.status).toBe('processing');
    expect(canCancelWebOrder(mixed)).toBe(true);
  });

  it('CSV exports the raw stored value for needs-review orders instead of a guessed status', () => {
    const rows = ordersCsvRows([parse('a', 'Refunded'), parse('b', 'shipped')]);
    const statusCol = rows[0].indexOf('Status');
    expect(rows[1][statusCol]).toBe('needs_review (Refunded)');
    expect(rows[2][statusCol]).toBe('shipped');
  });

  it('status sort puts needs-review orders first', () => {
    const sorted = sortOrders([parse('a', 'shipped'), parse('b', 'Refunded'), parse('c', 'pending')], 'status', 'asc');
    expect(sorted.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });
});
