import { describe, it, expect } from 'vitest';
import type { OrderLineItem, OrderRecord } from '../../types/order';
import {
  bulkStatusSkipReason,
  canCancelWebOrder,
  canChangeOrderStatus,
  canStartWebReturn,
  customerHistoryFor,
  returnableLinesFor,
} from './orderListFilters';
import { orderHasReturns, parseOrderDocument, parseReturnSummary, returnLineKey } from './orderUtils';

const line = (overrides: Partial<OrderLineItem> = {}): OrderLineItem => ({
  productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 2, image: '', lineTotal: 200, size: 'M', ...overrides,
});

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'o1', userId: 'u1', isGuest: false, customerEmail: null, customerName: 'Lina', customerPhone: '0591234567',
    deliveryAddress: null, deliveryZone: null, status: 'delivered', subtotal: 200, shippingCost: 20, total: 220,
    itemCount: 2, createdAt: new Date(), items: [line()], source: 'web', ...overrides,
  };
}

const withReturns = (o: Partial<OrderRecord> = {}) =>
  order({ returnSummary: { returnCount: 1, openCount: 1, returnedQtyByKey: { [returnLineKey(line())]: 1 }, lastReturnAt: null }, ...o });

describe('returns block backward moves, cancellation and (via the shelf) double restock', () => {
  it('without returns, the existing rules are unchanged (backward moves allowed)', () => {
    expect(canChangeOrderStatus(order({ status: 'delivered' }), 'pending')).toBe(true);
    expect(canChangeOrderStatus(order({ status: 'shipped' }), 'processing')).toBe(true);
    expect(canCancelWebOrder(order({ status: 'shipped' }))).toBe(true);
  });

  it.each([
    ['delivered', 'shipped'],
    ['delivered', 'processing'],
    ['delivered', 'pending'],
    ['shipped', 'processing'],
    ['shipped', 'pending'],
  ] as const)('with returns, %s → %s is refused', (from, to) => {
    expect(canChangeOrderStatus(withReturns({ status: from }), to)).toBe(false);
    expect(bulkStatusSkipReason(withReturns({ status: from }), to)).not.toBeNull();
  });

  it('with returns, moving forward (shipped → delivered) is still allowed', () => {
    expect(canChangeOrderStatus(withReturns({ status: 'shipped' }), 'delivered')).toBe(true);
  });

  it('with returns, the order is never offered cancellation', () => {
    expect(canCancelWebOrder(withReturns({ status: 'shipped' }))).toBe(false);
  });
});

describe('canStartWebReturn — website orders that are shipped or delivered only', () => {
  it.each([
    ['delivered web', order({ status: 'delivered' }), true],
    ['shipped web', order({ status: 'shipped' }), true],
    ['pending web', order({ status: 'pending' }), false],
    ['processing web', order({ status: 'processing' }), false],
    ['cancelled web', order({ status: 'cancelled' }), false],
    ['POS sale', order({ status: 'completed', source: 'pos' }), false],
    ['unknown legacy status', order({ status: 'pending', statusUnrecognized: true }), false],
  ])('%s → %s', (_label, o, expected) => {
    expect(canStartWebReturn(o)).toBe(expected);
  });
});

describe('returnableLinesFor', () => {
  it('sums duplicate lines, subtracts earlier returns and excludes coordinate sets', () => {
    const o = order({
      items: [
        line({ quantity: 1 }),
        line({ quantity: 2 }),
        line({ productId: 'dress', name: 'Dress (Red / S)', colorId: 'red', colorName: 'Red', size: 'S', quantity: 1 }),
        line({ productId: 'coord:look', name: 'Set', size: 'M', quantity: 1 }),
      ],
      returnSummary: { returnCount: 1, openCount: 1, returnedQtyByKey: { [returnLineKey(line())]: 2 }, lastReturnAt: null },
    });
    const { lines, excludedCoordinateLines } = returnableLinesFor(o);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.productId === 'skirt')).toMatchObject({ ordered: 3, alreadyReturned: 2, remaining: 1 });
    expect(lines.find((l) => l.productId === 'dress')).toMatchObject({ ordered: 1, alreadyReturned: 0, remaining: 1, colorId: 'red' });
    expect(excludedCoordinateLines.map((l) => l.productId)).toEqual(['coord:look']);
  });

  it('client and server agree on the line key', () => {
    expect(returnLineKey({ productId: 'p', colorId: 'red', size: 'M' })).toBe('p|~|red|~|M');
    expect(returnLineKey({ productId: 'p' })).toBe('p|~||~|');
  });
});

describe('returnSummary parsing (server-written, read defensively)', () => {
  it('ignores malformed or negative values', () => {
    expect(parseReturnSummary({ returnCount: -3, openCount: 'x', returnedQtyByKey: { a: -1, b: 2, c: 'z' } })).toMatchObject({
      returnCount: 0, openCount: 0, returnedQtyByKey: { b: 2 },
    });
    expect(parseReturnSummary(null)).toBeNull();
  });

  it('orders parse their summary and report whether they have returns', () => {
    const o = parseOrderDocument('o1', { status: 'delivered', items: [], returnSummary: { returnCount: 2, openCount: 1, returnedQtyByKey: { k: 2 } } });
    expect(orderHasReturns(o)).toBe(true);
    expect(orderHasReturns(parseOrderDocument('o2', { status: 'delivered', items: [] }))).toBe(false);
  });
});

describe('customer history counts orders with returns', () => {
  it('returnedOrderCount', () => {
    const a = withReturns({ id: 'a' });
    const b = order({ id: 'b' });
    const history = customerHistoryFor(a, [a, b]);
    expect(history?.returnedOrderCount).toBe(1);
  });
});
