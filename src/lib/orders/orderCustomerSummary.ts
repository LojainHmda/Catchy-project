import type { OrderRecord } from '../../types/order';

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

const ZONE_LABELS: Record<string, string> = {
  west_bank: 'West Bank',
  jerusalem: 'Jerusalem',
  abu_ghosh: 'Abu Ghosh Areas',
  inside_israel: 'Inside Israel',
};

export function shippingZoneLabel(zoneId: string | null | undefined): string | null {
  if (!zoneId?.trim()) return null;
  return ZONE_LABELS[zoneId] ?? zoneId.replace(/_/g, ' ');
}

export function orderDeliveryLabel(order: OrderRecord): string {
  const zone = shippingZoneLabel(order.deliveryZone);
  const address = order.deliveryAddress?.trim();
  if (zone && address) return `${zone} · ${address}`;
  return zone ?? address ?? 'Unknown location';
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

export function aggregateOrderCustomers(orders: OrderRecord[]): OrderCustomerSummary[] {
  const map = new Map<string, OrderCustomerSummary>();

  for (const order of orders) {
    const key = customerKey(order);
    let row = map.get(key);

    if (!row) {
      row = {
        key,
        name: order.customerName?.trim() || 'Guest',
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
    row.totalSpent += order.total;

    if (order.customerName?.trim()) row.name = order.customerName.trim();
    if (order.customerPhone?.trim()) row.phone = order.customerPhone.trim();
    if (order.customerEmail?.trim()) row.email = order.customerEmail.trim();

    const location = orderDeliveryLabel(order);
    if (!row.deliveryLocations.includes(location)) {
      row.deliveryLocations.push(location);
    }

    const zone = shippingZoneLabel(order.deliveryZone);
    if (zone && !row.zones.includes(zone)) {
      row.zones.push(zone);
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

export function zoneOrderCounts(orders: OrderRecord[]): Record<string, number> {
  const counts: Record<string, number> = { all: orders.length };
  for (const order of orders) {
    const zone = shippingZoneLabel(order.deliveryZone) ?? 'Unknown';
    counts[zone] = (counts[zone] ?? 0) + 1;
  }
  return counts;
}
