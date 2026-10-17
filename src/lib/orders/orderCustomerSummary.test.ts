import { describe, it, expect } from 'vitest';
import { aggregateOrderCustomers } from './orderCustomerSummary';
import type { OrderRecord, OrderStatus } from '../../types/order';

let autoId = 0;
function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  autoId += 1;
  return {
    id: `order-${autoId}`,
    userId: 'user-1',
    isGuest: false,
    customerEmail: 'customer@example.com',
    customerName: 'Jane Customer',
    customerPhone: '+970500000000',
    deliveryAddress: '123 Main St',
    deliveryZone: 'west_bank',
    status: 'completed',
    subtotal: 100,
    shippingCost: 0,
    total: 100,
    itemCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    items: [],
    ...overrides,
  };
}

describe('aggregateOrderCustomers — cancelled orders never contribute to totalSpent (Catchy-only fix)', () => {
  it('a completed POS sale counts toward totalSpent', () => {
    const order = makeOrder({ source: 'pos', status: 'completed', total: 200 });
    const [customer] = aggregateOrderCustomers([order], (key) => key);
    expect(customer!.totalSpent).toBe(200);
    expect(customer!.orderCount).toBe(1);
    expect(customer!.cancelledCount).toBe(0);
  });

  it('REGRESSION: a cancelled POS sale contributes nothing to totalSpent, but still counts toward orderCount/cancelledCount', () => {
    const order = makeOrder({ source: 'pos', status: 'cancelled', total: 200 });
    const [customer] = aggregateOrderCustomers([order], (key) => key);
    expect(customer!.totalSpent).toBe(0);
    expect(customer!.orderCount).toBe(1); // still counted in order history
    expect(customer!.cancelledCount).toBe(1);
  });

  it('a non-cancelled website order counts toward totalSpent — existing behavior preserved', () => {
    const order = makeOrder({ status: 'delivered', total: 349.99 });
    const [customer] = aggregateOrderCustomers([order], (key) => key);
    expect(customer!.totalSpent).toBe(349.99);
    expect(customer!.deliveredCount).toBe(1);
  });

  it('REGRESSION: a cancelled website order (never fulfilled/paid) contributes nothing to totalSpent', () => {
    const order = makeOrder({ status: 'cancelled', total: 349.99 });
    const [customer] = aggregateOrderCustomers([order], (key) => key);
    expect(customer!.totalSpent).toBe(0);
    expect(customer!.cancelledCount).toBe(1);
  });

  it('REGRESSION: a mixed history (one completed POS sale + one cancelled website order, same customer) only spends the completed one', () => {
    const posSale = makeOrder({ source: 'pos', status: 'completed', total: 200, createdAt: new Date('2026-01-02T00:00:00Z') });
    const cancelledWebOrder = makeOrder({ status: 'cancelled', total: 150, createdAt: new Date('2026-01-01T00:00:00Z') });
    const customers = aggregateOrderCustomers([posSale, cancelledWebOrder], (key) => key);

    expect(customers).toHaveLength(1); // same phone -> same customer row
    const customer = customers[0]!;
    expect(customer.orderCount).toBe(2);
    expect(customer.cancelledCount).toBe(1);
    expect(customer.totalSpent).toBe(200); // only the completed sale, not 350
  });

  it('REGRESSION: a customer whose entire order history is cancelled has totalSpent of 0, not undefined/NaN', () => {
    const first = makeOrder({ status: 'cancelled', total: 100 });
    const second = makeOrder({ status: 'cancelled', source: 'pos', total: 250 });
    const customers = aggregateOrderCustomers([first, second], (key) => key);

    expect(customers).toHaveLength(1);
    const customer = customers[0]!;
    expect(customer.orderCount).toBe(2);
    expect(customer.cancelledCount).toBe(2);
    expect(customer.totalSpent).toBe(0);
  });

  it('every other non-cancelled status still spends normally — existing behavior preserved for valid orders', () => {
    const statuses: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'completed'];
    for (const status of statuses) {
      autoId += 1000; // force a distinct customer per iteration (different phone below)
      const order = makeOrder({ status, total: 100, customerPhone: `+970500000${autoId}` });
      const [customer] = aggregateOrderCustomers([order], (key) => key);
      expect(customer!.totalSpent).toBe(100);
    }
  });

  it('two different customers (different phones) are kept separate, each with their own correctly-excluded totalSpent', () => {
    const customerA = [
      makeOrder({ customerPhone: '+970500000001', status: 'completed', total: 100 }),
      makeOrder({ customerPhone: '+970500000001', status: 'cancelled', total: 500 }),
    ];
    const customerB = [makeOrder({ customerPhone: '+970500000002', status: 'delivered', total: 300 })];

    const customers = aggregateOrderCustomers([...customerA, ...customerB], (key) => key);
    expect(customers).toHaveLength(2);

    const a = customers.find((c) => c.phone === '+970500000001')!;
    const b = customers.find((c) => c.phone === '+970500000002')!;
    expect(a.totalSpent).toBe(100); // the 500 cancelled order excluded
    expect(a.orderCount).toBe(2);
    expect(b.totalSpent).toBe(300);
  });
});
