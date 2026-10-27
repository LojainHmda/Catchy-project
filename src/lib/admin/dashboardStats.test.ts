import { describe, it, expect } from 'vitest';
import type { OrderRecord } from '../../types/order';
import {
  LOW_STOCK_THRESHOLD,
  computeDashboardOrderStats,
  dashboardOrdersWindow,
  findLowStockProducts,
  productStockCells,
} from './dashboardStats';

describe('low stock (threshold 3, variant-aware)', () => {
  it('uses the approved threshold of 3', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(3);
  });

  it('checks every color × size cell, not just the product total', () => {
    const rows = findLowStockProducts([
      {
        id: 'dress',
        data: {
          name: 'Dress',
          stock: 40, // stale aggregate must be ignored in favour of the variants
          colorVariants: [
            { id: 'red', name: 'Red', nameAr: 'أحمر', images: [], sizeStock: { S: 10, M: 2 } },
            { id: 'blue', name: 'Blue', images: [], sizeStock: { S: 0, M: 12 } },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'dress', lowestQuantity: 0, totalStock: 24 });
    expect(rows[0]!.lowCells).toEqual([
      { color: 'Blue', colorAr: null, size: 'S', quantity: 0 },
      { color: 'Red', colorAr: 'أحمر', size: 'M', quantity: 2 },
    ]);
  });

  it('handles sized products, size-less products, the boundary, and hidden products', () => {
    const rows = findLowStockProducts([
      { id: 'sized', data: { name: 'Skirt', sizeStock: { S: 3, M: 4 } } }, // 3 is low (≤ 3)
      { id: 'plain', data: { name: 'Scarf', stock: 4 } }, // 4 is fine
      { id: 'plainLow', data: { name: 'Belt', stock: 1 } },
      { id: 'hidden', data: { name: 'Old', stock: 0, visible: false } },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['plainLow', 'sized']);
    expect(rows[1]!.lowCells).toEqual([{ color: null, colorAr: null, size: 'S', quantity: 3 }]);
  });

  it('a color with no sizes counts as one sold-out cell', () => {
    expect(productStockCells({ colorVariants: [{ id: 'c', name: 'Green', images: [], sizeStock: {} }] })).toEqual([
      { color: 'Green', colorAr: null, size: null, quantity: 0 },
    ]);
  });
});

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u',
    isGuest: false,
    customerEmail: null,
    customerName: 'A',
    customerPhone: '0591111111',
    deliveryAddress: null,
    deliveryZone: null,
    status: 'pending',
    subtotal: 0,
    shippingCost: 0,
    total: 100,
    itemCount: 1,
    createdAt: new Date(2026, 9, 24, 9),
    items: [],
    source: 'web',
    ...overrides,
  };
}

describe('dashboard order stats', () => {
  const now = new Date(2026, 9, 24, 15);

  it('fetch window covers 60 days ending tomorrow 00:00', () => {
    const range = dashboardOrdersWindow(now);
    expect(range.start).toEqual(new Date(2026, 7, 26));
    expect(range.end).toEqual(new Date(2026, 9, 25));
  });

  it('today snapshot counts booked (non-cancelled) orders and revenue — same definition as the 30-day card', () => {
    const stats = computeDashboardOrderStats(
      [
        order({ total: 100 }),
        order({ total: 50, source: 'pos', status: 'completed', customerPhone: null }),
        order({ total: 70, status: 'cancelled' }),
        order({ total: 999, createdAt: new Date(2026, 9, 23, 23) }),
      ],
      now
    );
    expect(stats.today).toEqual({ orders: 2, booked: 150, web: 1, pos: 1 });
  });

  it('compares the last 30 days with the 30 before (real percentages, not hardcoded)', () => {
    const stats = computeDashboardOrderStats(
      [
        order({ total: 300, status: 'delivered', createdAt: new Date(2026, 9, 10) }),
        order({ total: 100, createdAt: new Date(2026, 8, 10) }),
        order({ total: 100, createdAt: new Date(2026, 8, 12) }),
      ],
      now
    );
    expect(stats.last30.bookedRevenue).toEqual({ current: 300, previous: 200, changePct: 50 });
    expect(stats.last30.orders).toEqual({ current: 1, previous: 2, changePct: -50 });
    expect(stats.last30.fulfilledRevenue).toEqual({ current: 300, previous: 0, changePct: null });
  });
});
