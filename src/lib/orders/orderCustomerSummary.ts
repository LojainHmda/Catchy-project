import type { OrderRecord } from '../../types/order';
import { CANCELLED_ORDER_STATUS } from '../../types/order';

export type OrderCustomerSummary = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  deliveryLocations: string[];
  zones: string[];
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

const ZONE_LABEL_KEYS: Record<string, string> = {
  west_bank: 'shipping.zone.westBank',
  jerusalem: 'shipping.zone.jerusalem',
  abu_ghosh: 'shipping.zone.abuGhosh',
  inside_israel: 'shipping.zone.insideIsrael',
};

/** Translated zone label for display. `zoneId` stays the stable identity (used for filtering/grouping) — only this label is language-dependent. */
export function shippingZoneLabel(zoneId: string | null | undefined, t: (key: string) => string): string | null {
  if (!zoneId?.trim()) return null;
  const labelKey = ZONE_LABEL_KEYS[zoneId];
  return labelKey ? t(labelKey) : zoneId.replace(/_/g, ' ');
}

export function orderDeliveryLabel(order: OrderRecord, t: (key: string) => string): string {
  const zone = shippingZoneLabel(order.deliveryZone, t);
  const address = order.deliveryAddress?.trim();
  if (zone && address) return `${zone} · ${address}`;
  return zone ?? address ?? t('admin.customers.unknownLocationFallback');
}

function customerKey(order: OrderRecord): string {
  const phone = order.customerPhone?.replace(/\s+/g, '').trim();
  if (phone) return `phone:${phone}`;

  if (order.userId && order.userId !== 'guest') return `uid:${order.userId}`;

  const email = order.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;

  const name = order.customerName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return `order:${order.id}`;
}

export function aggregateOrderCustomers(orders: OrderRecord[], t: (key: string) => string): OrderCustomerSummary[] {
  const map = new Map<string, OrderCustomerSummary>();

  for (const order of orders) {
    const key = customerKey(order);
    let row = map.get(key);

    if (!row) {
      row = {
        key,
        name: order.customerName?.trim() || t('admin.customers.guestName'),
        phone: order.customerPhone?.trim() || null,
        email: order.customerEmail?.trim() || null,
        deliveryLocations: [],
        zones: [],
        latestAddress: order.deliveryAddress?.trim() || null,
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

    const location = orderDeliveryLabel(order, t);
    if (!row.deliveryLocations.includes(location)) {
      row.deliveryLocations.push(location);
    }

    // row.zones stores the stable zone id (not the translated label) so zone
    // filtering keeps working correctly after an admin-language switch.
    const zoneId = order.deliveryZone?.trim();
    if (zoneId && !row.zones.includes(zoneId)) {
      row.zones.push(zoneId);
    }

    if (order.deliveryAddress?.trim()) {
      row.latestAddress = order.deliveryAddress.trim();
    }

    const orderTime = order.createdAt?.getTime() ?? 0;
    const lastTime = row.lastOrderAt?.getTime() ?? 0;
    if (orderTime >= lastTime) {
      row.lastOrderAt = order.createdAt;
      if (order.deliveryAddress?.trim()) {
        row.latestAddress = order.deliveryAddress.trim();
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

/** Keyed by the stable zone id (e.g. "west_bank"), not the translated label — see shippingZoneLabel. */
export function zoneOrderCounts(orders: OrderRecord[]): Record<string, number> {
  const counts: Record<string, number> = { all: orders.length };
  for (const order of orders) {
    const zoneId = order.deliveryZone?.trim() || 'unknown';
    counts[zoneId] = (counts[zoneId] ?? 0) + 1;
  }
  return counts;
}
