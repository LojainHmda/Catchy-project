import { describe, it, expect } from 'vitest';
import { parseOrderDocument, sumOrderRevenue } from './orderUtils';
import type { OrderStatus } from '../../types/order';

function minimalOrderData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: 'user-1',
    status: 'completed',
    items: [{ productId: 'p1', name: 'Item', price: 50, quantity: 2 }],
    ...overrides,
  };
}

describe('parseOrderDocument — separating website orders from POS sales (Feature 1)', () => {
  it('REGRESSION: a historical order with no `source` field at all is treated as "web", not crashed or misclassified', () => {
    const order = parseOrderDocument('order-1', minimalOrderData());
    expect(order.source).toBe('web');
  });

  it('an order with source: "pos" is correctly recognized', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'pos' }));
    expect(order.source).toBe('pos');
  });

  it('an unexpected/garbage source value safely falls back to "web" rather than throwing', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'something-unexpected' }));
    expect(order.source).toBe('web');
  });
});

describe('parseOrderDocument — correction fields (Feature 2), backward compatible with historical orders', () => {
  it('an order that has never been corrected has no balanceDue, zero correctionCount, and an empty corrections list', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'pos' }));
    expect(order.balanceDue).toBeNull();
    expect(order.correctionCount).toBe(0);
    expect(order.corrections).toEqual([]);
  });

  it('parses a real correction entry with before/after snapshots', () => {
    const data = minimalOrderData({
      source: 'pos',
      balanceDue: -20,
      correctionCount: 1,
      corrections: [
        {
          correctedAt: new Date('2026-01-01T10:00:00Z'),
          correctedByUid: 'admin-1',
          correctedByName: 'Jane Admin',
          reason: 'Wrong price',
          registerSessionStatusAtCorrection: 'closed',
          before: { items: [{ productId: 'p1', name: 'Item', price: 60, quantity: 2 }], subtotal: 120, discount: null, total: 120 },
          after: { items: [{ productId: 'p1', name: 'Item', price: 50, quantity: 2 }], subtotal: 100, discount: null, total: 100 },
        },
      ],
    });

    const order = parseOrderDocument('order-1', data);
    expect(order.balanceDue).toBe(-20);
    expect(order.correctionCount).toBe(1);
    expect(order.corrections).toHaveLength(1);
    const entry = order.corrections![0]!;
    expect(entry.correctedByUid).toBe('admin-1');
    expect(entry.correctedByName).toBe('Jane Admin');
    expect(entry.reason).toBe('Wrong price');
    expect(entry.before.total).toBe(120);
    expect(entry.after.total).toBe(100);
    expect(entry.after.items[0]!.price).toBe(50);
  });

  it('REGRESSION: a corrupt/malformed correction entry is dropped rather than crashing the whole order parse', () => {
    const data = minimalOrderData({
      source: 'pos',
      corrections: [
        null, // malformed
        'not an object', // malformed
        { reason: 'missing correctedByUid entirely' }, // malformed — no uid
        {
          correctedAt: new Date(),
          correctedByUid: 'admin-1',
          correctedByName: null,
          reason: null,
          registerSessionStatusAtCorrection: null,
          before: { items: [], subtotal: null, discount: null, total: null },
          after: { items: [], subtotal: 0, discount: null, total: 0 },
        },
      ],
    });

    expect(() => parseOrderDocument('order-1', data)).not.toThrow();
    const order = parseOrderDocument('order-1', data);
    expect(order.corrections).toHaveLength(1); // only the one valid entry survives
    expect(order.corrections![0]!.correctedByUid).toBe('admin-1');
  });

  it('a non-array `corrections` field (e.g. legacy/unexpected shape) parses as an empty list, not a crash', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'pos', corrections: 'not-an-array' }));
    expect(order.corrections).toEqual([]);
  });
});

describe('parseOrderDocument — cancellation (POS sale cancel feature), backward compatible with historical orders', () => {
  it('an order that has never been cancelled has no `cancellation` record', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'pos' }));
    expect(order.cancellation).toBeNull();
  });

  it('parses a real cancellation entry', () => {
    const data = minimalOrderData({
      source: 'pos',
      status: 'cancelled',
      balanceDue: -200,
      cancellation: {
        cancelledAt: new Date('2026-02-01T09:00:00Z'),
        cancelledByUid: 'admin-1',
        cancelledByName: 'Jane Admin',
        reason: 'Duplicate sale rung up by mistake',
        registerSessionStatusAtCancellation: 'open',
      },
    });

    const order = parseOrderDocument('order-1', data);
    expect(order.status).toBe('cancelled');
    expect(order.balanceDue).toBe(-200);
    expect(order.cancellation).not.toBeNull();
    expect(order.cancellation!.cancelledByUid).toBe('admin-1');
    expect(order.cancellation!.cancelledByName).toBe('Jane Admin');
    expect(order.cancellation!.reason).toBe('Duplicate sale rung up by mistake');
    expect(order.cancellation!.registerSessionStatusAtCancellation).toBe('open');
    expect(order.cancellation!.cancelledAt).toEqual(new Date('2026-02-01T09:00:00Z'));
  });

  it('REGRESSION: a malformed/legacy cancellation entry (no cancelledByUid) is dropped rather than crashing the whole order parse', () => {
    const data = minimalOrderData({ source: 'pos', cancellation: { reason: 'missing cancelledByUid entirely' } });
    expect(() => parseOrderDocument('order-1', data)).not.toThrow();
    const order = parseOrderDocument('order-1', data);
    expect(order.cancellation).toBeNull();
  });

  it('a non-object `cancellation` field parses as null, not a crash', () => {
    const order = parseOrderDocument('order-1', minimalOrderData({ source: 'pos', cancellation: 'not-an-object' }));
    expect(order.cancellation).toBeNull();
  });
});

describe('parseOrderDocument — existing behavior preserved', () => {
  it('still correctly parses a plain web order with no POS-related fields at all', () => {
    const order = parseOrderDocument('order-1', minimalOrderData());
    expect(order.id).toBe('order-1');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.price).toBe(50);
    expect(order.registerSessionId).toBeNull();
    expect(order.cashierUid).toBeNull();
    expect(order.payment).toBeNull();
    expect(order.discount).toBeNull();
  });
});

function revenueOrder(status: OrderStatus, total: number) {
  return { status, total };
}

describe('sumOrderRevenue — cancelled orders never count as revenue (Catchy-only fix)', () => {
  it('REGRESSION: a cancelled order of any kind contributes nothing to revenue', () => {
    expect(sumOrderRevenue([revenueOrder('cancelled', 500)])).toBe(0);
  });

  it('a completed POS sale is counted at its full total', () => {
    expect(sumOrderRevenue([revenueOrder('completed', 200)])).toBe(200);
  });

  it('REGRESSION: a *corrected* (but not cancelled) POS sale is counted at its current — i.e. corrected — total, not some stale original figure', () => {
    // posSaleCorrection.js always writes the server-recomputed total back onto
    // `order.total` itself, so there is nothing else to special-case: whatever
    // `total` currently holds already *is* the corrected figure.
    const correctedSale = revenueOrder('completed', 160); // was 200 before a price correction
    expect(sumOrderRevenue([correctedSale])).toBe(160);
  });

  it('REGRESSION: a POS sale that was corrected and *then* cancelled still contributes nothing — cancellation always wins over whatever total is on the record', () => {
    const correctedThenCancelled = revenueOrder('cancelled', 160);
    expect(sumOrderRevenue([correctedThenCancelled])).toBe(0);
  });

  it('every non-cancelled website order status still counts toward revenue — existing semantics preserved', () => {
    const statuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'completed'];
    for (const status of statuses) {
      expect(sumOrderRevenue([revenueOrder(status, 100)])).toBe(100);
    }
  });

  it('REGRESSION: a cancelled website order (placed but never fulfilled/paid) contributes nothing — matches POS cancellation semantics', () => {
    expect(sumOrderRevenue([revenueOrder('cancelled', 349.99)])).toBe(0);
  });

  it('sums a mixed list of web and POS orders, excluding only the cancelled ones', () => {
    const orders = [
      revenueOrder('completed', 200), // POS, kept
      revenueOrder('cancelled', 160), // POS, excluded
      revenueOrder('delivered', 349.99), // web, kept
      revenueOrder('cancelled', 89.5), // web, excluded
      revenueOrder('pending', 120), // web, kept
    ];
    expect(sumOrderRevenue(orders)).toBe(200 + 349.99 + 120);
  });

  it('an empty list sums to 0', () => {
    expect(sumOrderRevenue([])).toBe(0);
  });
});
