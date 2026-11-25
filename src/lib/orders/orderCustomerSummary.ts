import type { OrderRecord } from '../../types/order';
import { CANCELLED_ORDER_STATUS } from '../../types/order';
import { orderAddressLine, orderDeliveryArea, orderDeliveryLine } from './orderDelivery';

export type OrderCustomerSummary = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  deliveryLocations: string[];
  /**
   * Stable delivery-area keys of this customer's orders ('region:<id>' for newer orders,
   * 'zone:<id>' for the former zones) — never translated labels, so filtering keeps
   * working after an admin-language switch. See orderDelivery.ts.
   */
  areas: string[];
  latestAddress: string | null;
  orderCount: number;
  newCount: number;
  inProgressCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

export function orderDeliveryLabel(order: OrderRecord, t: (key: string) => string, language = 'en'): string {
  return orderDeliveryLine(order, t, language) ?? t('admin.customers.unknownLocationFallback');
}

/** Groups orders into one customer: phone, then account uid, then email, then name. */
export function customerKey(order: OrderRecord): string {
  const phone = order.customerPhone?.replace(/\s+/g, '').trim();
  if (phone) return `phone:${phone}`;

  if (order.userId && order.userId !== 'guest') return `uid:${order.userId}`;

  const email = order.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = order.customerName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return `order:${order.id}`;
}

export function aggregateOrderCustomers(
  orders: OrderRecord[],
  t: (key: string) => string,
  language = 'en'
): OrderCustomerSummary[] {
  const map = new Map<string, OrderCustomerSummary>();

  for (const order of orders) {
    const key = customerKey(order);
    let row = map.get(key);
    const address = orderAddressLine(order, t, language);

    if (!row) {
      row = {
        key,
        name: order.customerName?.trim() || t('admin.customers.guestName'),
        phone: order.customerPhone?.trim() || null,
        email: order.customerEmail?.trim() || null,
        deliveryLocations: [],
        areas: [],
        latestAddress: address,
        orderCount: 0,
        newCount: 0,
        inProgressCount: 0,
        shippedCount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
      };
      map.set(key, row);
    }

    row.orderCount += 1;
    // A cancelled order (web — never fulfilled/paid; POS — voided, stock
    // restored) never contributes to spend, even though it still counts
    // toward orderCount/cancelledCount below — same rule as sumOrderRevenue.
    if (order.status !== CANCELLED_ORDER_STATUS) {
      row.totalSpent += order.total;
    }

    if (order.customerName?.trim()) row.name = order.customerName.trim();
    if (order.customerPhone?.trim()) row.phone = order.customerPhone.trim();
    if (order.customerEmail?.trim()) row.email = order.customerEmail.trim();

    const location = orderDeliveryLabel(order, t, language);
    if (!row.deliveryLocations.includes(location)) {
      row.deliveryLocations.push(location);
    }

    const area = orderDeliveryArea(order);
    if (area.kind !== 'unknown' && !row.areas.includes(area.key)) {
      row.areas.push(area.key);
    }

    if (address) {
      row.latestAddress = address;
    }

    const orderTime = order.createdAt?.getTime() ?? 0;
    const lastTime = row.lastOrderAt?.getTime() ?? 0;
    if (orderTime >= lastTime) {
      row.lastOrderAt = order.createdAt;
      if (address) {
        row.latestAddress = address;
      }
    }

    switch (order.status) {
      case 'pending':
        row.newCount += 1;
        break;
      case 'processing':
        row.inProgressCount += 1;
        break;
      case 'shipped':
        row.shippedCount += 1;
        break;
      case 'delivered':
        row.deliveredCount += 1;
        break;
      case 'cancelled':
        row.cancelledCount += 1;
        break;
    }
  }

  return [...map.values()].sort(
    (a, b) => (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0)
  );
}
