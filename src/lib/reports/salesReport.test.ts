import { describe, it, expect } from 'vitest';
import type { OrderLineItem, OrderRecord } from '../../types/order';
import { resolveDateRange } from '../orders/orderListFilters';
import {
  buildSalesReport,
  localDayKey,
  orderLinesCsvRows,
  percentChange,
  reportSummaryCsvRows,
} from './salesReport';

function line(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  const price = overrides.price ?? 100;
  const quantity = overrides.quantity ?? 1;
  return { productId: 'p1', name: 'Dress (Red / M)', price, quantity, image: '', lineTotal: price * quantity, colorId: 'red', colorName: 'Red', size: 'M', ...overrides };
}

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  const items = overrides.items ?? [line()];
  return {
    id: `o-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'u1',
    isGuest: false,
    customerEmail: null,
    customerName: 'Lina',
    customerPhone: '0591234567',
    deliveryAddress: null,
    deliveryZone: 'west_bank',
    status: 'pending',
    subtotal: 100,
    shippingCost: 20,
    total: 120,
    itemCount: 1,
    createdAt: new Date(2026, 9, 20, 10),
    source: 'web',
    ...overrides,
    items,
  };
}

const now = new Date(2026, 9, 24, 12);
const all = resolveDateRange('all', now);

describe('booked vs fulfilled vs cancelled revenue', () => {
  it('booked = everything except cancelled; fulfilled = delivered + completed', () => {
    const report = buildSalesReport(
      [
        order({ status: 'pending', total: 100 }),
        order({ status: 'shipped', total: 50 }),
        order({ status: 'delivered', total: 200 }),
        order({ status: 'completed', source: 'pos', total: 80, shippingCost: 0, payment: { method: 'cash', cashAmount: 100, cardAmount: 0, changeGiven: 20 } }),
        order({ status: 'cancelled', total: 999 }),
      ],
      all
    );
    expect(report.orderCount).toBe(5);
    expect(report.booked).toEqual({ count: 4, revenue: 430 });
    expect(report.fulfilled).toEqual({ count: 2, revenue: 280 });
    expect(report.cancelled).toEqual({ count: 1, revenue: 999 });
    expect(report.open).toEqual({ count: 2, revenue: 150 });
    expect(report.averageOrderValue).toBe(107.5);
    expect(report.byStatus.cancelled.count).toBe(1);
  });

  it('a corrected POS sale counts at its current total; a cancelled one counts nothing', () => {
    const report = buildSalesReport(
      [
        order({ source: 'pos', status: 'completed', total: 90, correctionCount: 1, customerPhone: null }),
        order({ source: 'pos', status: 'cancelled', total: 300, customerPhone: null }),
      ],
      all
    );
    expect(report.pos).toEqual({ count: 1, revenue: 90 });
    expect(report.booked.revenue).toBe(90);
  });
});

describe('channels, POS money and shipping', () => {
  it('splits web/POS, counts POS cash net of change, and sums discounts and shipping', () => {
    const report = buildSalesReport(
      [
        order({ total: 120, shippingCost: 20 }),
        order({ source: 'pos', status: 'completed', total: 95, shippingCost: 0, payment: { method: 'split', cashAmount: 50, cardAmount: 50, changeGiven: 5 }, discount: { mode: 'amount', value: 5, amount: 5 } }),
        order({ status: 'cancelled', total: 70, shippingCost: 30 }),
      ],
      all
    );
    expect(report.web).toEqual({ count: 1, revenue: 120 });
    expect(report.pos).toEqual({ count: 1, revenue: 95 });
    expect(report.posCash).toBe(45);
    expect(report.posCard).toBe(50);
    expect(report.posDiscounts).toBe(5);
    expect(report.shippingCharged).toBe(20); // charged on booked web orders; not proof of payment
  });
});

describe('date range filtering and the daily series', () => {
  it('only includes orders in range and fills empty days with zeros (local days)', () => {
    const range = resolveDateRange('7d', now); // 18..24 Oct
    const report = buildSalesReport(
      [
        order({ createdAt: new Date(2026, 9, 18, 0, 5), total: 10 }),
        order({ createdAt: new Date(2026, 9, 24, 23, 59), total: 20 }),
        order({ createdAt: new Date(2026, 9, 17, 23, 59), total: 999 }), // before range
        order({ createdAt: new Date(2026, 9, 25, 0, 0), total: 999 }), // after range
        order({ createdAt: null, total: 999 }),
      ],
      range
    );
    expect(report.orderCount).toBe(2);
    expect(report.byDay).toHaveLength(7);
    expect(report.byDay[0]).toMatchObject({ date: '2026-10-18', orders: 1, revenue: 10 });
    expect(report.byDay[6]).toMatchObject({ date: '2026-10-24', orders: 1, revenue: 20 });
    expect(report.byDay.slice(1, 6).every((d) => d.orders === 0 && d.revenue === 0)).toBe(true);
  });

  it('an empty range produces a zeroed report without errors', () => {
    const report = buildSalesReport([], resolveDateRange('today', now));
    expect(report.booked).toEqual({ count: 0, revenue: 0 });
    expect(report.averageOrderValue).toBe(0);
    expect(report.byDay).toHaveLength(1);
    expect(report.topProducts).toEqual([]);
  });

  it('rounds money to 2 decimals', () => {
    const report = buildSalesReport([order({ total: 0.1 }), order({ total: 0.2 })], all);
    expect(report.booked.revenue).toBe(0.3);
  });

  it('localDayKey uses local time', () => {
    expect(localDayKey(new Date(2026, 0, 2, 23, 30))).toBe('2026-01-02');
  });
});

describe('top products and customers', () => {
  it('groups products by id and color (not by name) from booked orders only', () => {
    const report = buildSalesReport(
      [
        order({ items: [line({ quantity: 2 }), line({ colorId: 'blue', colorName: 'Blue', name: 'Dress (Blue / S)', size: 'S' })] }),
        order({ items: [line({ quantity: 3, name: 'Dress renamed (Red / L)', size: 'L' })] }),
        order({ status: 'cancelled', items: [line({ quantity: 50 })] }),
      ],
      all
    );
    expect(report.topProducts[0]).toMatchObject({ productId: 'p1', color: 'Red', quantity: 5, revenue: 500 });
    expect(report.topProducts[1]).toMatchObject({ color: 'Blue', quantity: 1 });
    expect(report.itemsSold).toBe(6);
  });

  it('ranks customers by booked revenue and ignores walk-in POS sales', () => {
    const report = buildSalesReport(
      [
        order({ customerName: 'Lina', total: 100 }),
        order({ customerName: 'Lina', total: 50 }),
        order({ customerName: 'Omar', customerPhone: '0560000000', total: 120 }),
        order({ source: 'pos', status: 'completed', customerPhone: null, userId: 'cashier-1', total: 1000 }),
      ],
      all
    );
    expect(report.topCustomers.map((c) => [c.name, c.orders, c.revenue])).toEqual([
      ['Lina', 2, 150],
      ['Omar', 1, 120],
    ]);
  });
});

describe('helpers and CSV', () => {
  it('percentChange returns null without a baseline', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });

  it('summary CSV lists both revenue definitions; line CSV has one row per line', () => {
    const range = resolveDateRange('custom', now, { from: '2026-10-01', to: '2026-10-31' });
    const orders = [order({ items: [line(), line({ productId: 'p2', name: 'Top' })] })];
    const summary = reportSummaryCsvRows(buildSalesReport(orders, range), range);
    expect(summary).toEqual(expect.arrayContaining([['Booked revenue', 120], ['Fulfilled revenue', 0], ['To', '2026-10-31']]));
    expect(orderLinesCsvRows(orders, range)).toHaveLength(3);
  });
});
