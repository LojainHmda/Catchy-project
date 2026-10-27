import { describe, it, expect } from 'vitest';
import type { OrderRecord } from '../../types/order';
import {
  BULK_STATUS_TARGETS,
  bulkStatusSkipReason,
  canCancelWebOrder,
  canChangeOrderStatus,
  customerHistoryFor,
  orderInDateRange,
  orderMatchesSearch,
  ordersCsvRows,
  pageCount,
  paginate,
  parseDateInput,
  phoneDigitsCore,
  resolveDateRange,
  sortOrders,
} from './orderListFilters';

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'abcdef123456',
    userId: 'user-1',
    isGuest: false,
    customerEmail: 'lina@example.com',
    customerName: 'Lina Haddad',
    customerPhone: '059-123 4567',
    deliveryAddress: 'Ramallah, Main St',
    deliveryZone: 'west_bank',
    status: 'pending',
    subtotal: 100,
    shippingCost: 20,
    total: 120,
    itemCount: 1,
    createdAt: new Date(2026, 9, 20, 12, 0),
    items: [],
    source: 'web',
    ...overrides,
  };
}

describe('phone search', () => {
  it.each([
    ['059-123 4567', '591234567'],
    ['+970591234567', '591234567'],
    ['00972591234567', '591234567'],
    ['0591234567', '591234567'],
    [null, ''],
  ])('phoneDigitsCore(%s) = %s', (input, expected) => {
    expect(phoneDigitsCore(input)).toBe(expected);
  });

  it('matches an order by phone regardless of formatting', () => {
    const o = order();
    expect(orderMatchesSearch(o, '0591234567')).toBe(true);
    expect(orderMatchesSearch(o, '+970 59 123 4567')).toBe(true);
    expect(orderMatchesSearch(o, '4567')).toBe(true);
    expect(orderMatchesSearch(o, '0599999999')).toBe(false);
  });

  it('does not match everything on very short digit queries (digit path needs 3+ digits)', () => {
    // '05' is not a text substring of this formatting, and reduces to a 1-digit core.
    expect(orderMatchesSearch(order({ customerPhone: '+970 59 1234567', id: 'zzzz' }), '05')).toBe(false);
  });

  it('still matches names, email, address and the short order id (case-insensitive)', () => {
    const o = order();
    expect(orderMatchesSearch(o, 'lina')).toBe(true);
    expect(orderMatchesSearch(o, 'EXAMPLE.COM')).toBe(true);
    expect(orderMatchesSearch(o, 'ramallah')).toBe(true);
    expect(orderMatchesSearch(o, '#ABCDEF12')).toBe(true);
    expect(orderMatchesSearch(o, '')).toBe(true);
    expect(orderMatchesSearch(o, 'nablus')).toBe(false);
  });
});

describe('date ranges (local time, half-open)', () => {
  const now = new Date(2026, 9, 24, 15, 30); // 24 Oct 2026

  it('today / 7d / 30d include today', () => {
    expect(resolveDateRange('today', now)).toEqual({ start: new Date(2026, 9, 24), end: new Date(2026, 9, 25) });
    expect(resolveDateRange('7d', now).start).toEqual(new Date(2026, 9, 18));
    expect(resolveDateRange('30d', now).start).toEqual(new Date(2026, 8, 25));
  });

  it('this month and last month', () => {
    expect(resolveDateRange('thisMonth', now)).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 25) });
    expect(resolveDateRange('lastMonth', now)).toEqual({ start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) });
    expect(resolveDateRange('lastMonth', new Date(2026, 0, 10))).toEqual({
      start: new Date(2025, 11, 1),
      end: new Date(2026, 0, 1),
    });
  });

  it('custom range includes both end dates', () => {
    const range = resolveDateRange('custom', now, { from: '2026-10-01', to: '2026-10-05' });
    expect(range).toEqual({ start: new Date(2026, 9, 1), end: new Date(2026, 9, 6) });
    expect(orderInDateRange(order({ createdAt: new Date(2026, 9, 5, 23, 59) }), range)).toBe(true);
    expect(orderInDateRange(order({ createdAt: new Date(2026, 9, 6, 0, 0) }), range)).toBe(false);
    expect(parseDateInput('bad')).toBeNull();
  });

  it('"all" matches everything, including orders without a date; other ranges exclude undated orders', () => {
    expect(orderInDateRange(order({ createdAt: null }), resolveDateRange('all', now))).toBe(true);
    expect(orderInDateRange(order({ createdAt: null }), resolveDateRange('today', now))).toBe(false);
  });
});

describe('sorting and paging', () => {
  const a = order({ id: 'a', total: 50, status: 'shipped', customerName: 'Zaid', createdAt: new Date(2026, 9, 1) });
  const b = order({ id: 'b', total: 300, status: 'pending', customerName: 'amal', createdAt: new Date(2026, 9, 3) });
  const c = order({ id: 'c', total: 120, status: 'cancelled', customerName: 'Basel', createdAt: new Date(2026, 9, 2) });

  it('sorts by each column in both directions without mutating the input', () => {
    const input = [a, b, c];
    expect(sortOrders(input, 'date', 'desc').map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(sortOrders(input, 'total', 'asc').map((o) => o.id)).toEqual(['a', 'c', 'b']);
    expect(sortOrders(input, 'status', 'asc').map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(sortOrders(input, 'customer', 'asc').map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('paginates with clamped 1-based pages', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    expect(pageCount(120)).toBe(3);
    expect(pageCount(0)).toBe(1);
    expect(paginate(items, 1)).toHaveLength(50);
    expect(paginate(items, 3)).toEqual(items.slice(100));
    expect(paginate(items, 99)).toEqual(items.slice(100));
    expect(paginate(items, 0)[0]).toBe(0);
  });
});

describe('status change rules', () => {
  it('lets a web order move between pending, processing, shipped and delivered', () => {
    expect(canChangeOrderStatus(order({ status: 'pending' }), 'processing')).toBe(true);
    expect(canChangeOrderStatus(order({ status: 'delivered' }), 'shipped')).toBe(true);
  });

  it('never sets cancelled or completed by hand, and never changes final or POS orders', () => {
    expect(canChangeOrderStatus(order({ status: 'pending' }), 'cancelled')).toBe(false);
    expect(canChangeOrderStatus(order({ status: 'pending' }), 'completed')).toBe(false);
    expect(canChangeOrderStatus(order({ status: 'cancelled' }), 'pending')).toBe(false);
    expect(canChangeOrderStatus(order({ status: 'completed', source: 'pos' }), 'delivered')).toBe(false);
    expect(canChangeOrderStatus(order({ status: 'pending' }), 'pending')).toBe(false);
  });

  it('only pending/processing/shipped web orders can be cancelled', () => {
    expect(canCancelWebOrder(order({ status: 'pending' }))).toBe(true);
    expect(canCancelWebOrder(order({ status: 'shipped' }))).toBe(true);
    expect(canCancelWebOrder(order({ status: 'delivered' }))).toBe(false);
    expect(canCancelWebOrder(order({ status: 'cancelled' }))).toBe(false);
    expect(canCancelWebOrder(order({ status: 'completed', source: 'pos' }))).toBe(false);
  });

  it('bulk targets exclude cancel and explain every skip', () => {
    expect(BULK_STATUS_TARGETS).not.toContain('cancelled');
    expect(bulkStatusSkipReason(order({ status: 'pending' }), 'shipped')).toBeNull();
    expect(bulkStatusSkipReason(order({ status: 'shipped' }), 'shipped')).toBe('same');
    expect(bulkStatusSkipReason(order({ status: 'cancelled' }), 'shipped')).toBe('final');
    expect(bulkStatusSkipReason(order({ status: 'completed', source: 'pos' }), 'shipped')).toBe('pos');
    expect(bulkStatusSkipReason(order({ status: 'pending' }), 'cancelled')).toBe('notAllowed');
  });
});

describe('customer history', () => {
  it('groups by phone like the Customers page and excludes cancelled orders from spend', () => {
    const current = order({ id: 'cur', total: 100, createdAt: new Date(2026, 9, 20) });
    const prev = order({ id: 'p1', total: 80, customerPhone: '0591234567', userId: 'guest', createdAt: new Date(2026, 8, 1) });
    // Same digits but different formatting — customerKey only strips spaces, so this is a different key.
    const cancelled = order({ id: 'p2', total: 500, status: 'cancelled', createdAt: new Date(2026, 9, 1) });
    const other = order({ id: 'x', customerPhone: '0560000000' });

    const history = customerHistoryFor(current, [current, prev, cancelled, other])!;
    expect(history.orders.map((o) => o.id)).toEqual(['p2']);
    expect(history.orderCount).toBe(2);
    expect(history.totalSpent).toBe(100);
    expect(history.cancelledCount).toBe(1);
    expect(history.firstOrderAt).toEqual(new Date(2026, 9, 1));
  });

  it('never treats walk-in POS sales (cashier uid, no phone) as anyone\'s history', () => {
    const walkIn = order({ id: 'pos1', source: 'pos', status: 'completed', customerPhone: null, userId: 'cashier-1' });
    const webByCashier = order({ id: 'w1', customerPhone: null, userId: 'cashier-1', customerEmail: null });
    expect(customerHistoryFor(walkIn, [walkIn, webByCashier])).toBeNull();
    expect(customerHistoryFor(webByCashier, [walkIn, webByCashier])!.orders).toEqual([]);
  });
});

describe('CSV rows', () => {
  it('has one header plus one row per order with the expected columns', () => {
    const rows = ordersCsvRows([order({ adminNote: 'Call first', statusUpdatedByName: 'owner@x.com' })]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Admin note');
    expect(rows[1]).toEqual(expect.arrayContaining(['abcdef123456', '#ABCDEF12', 'pending', 120, 'Call first', 'owner@x.com']));
  });
});
