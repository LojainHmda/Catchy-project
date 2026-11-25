import type { OrderRecord } from '../../types/order';
import { legacyShippingZoneLabel } from '../shippingZones';

type Translate = (key: string) => string;
type OrderDeliveryFields = Pick<OrderRecord, 'deliveryLocation' | 'deliveryZone' | 'deliveryAddress'>;

/**
 * Where an order goes, for grouping and filters. Built ONLY from what the order itself
 * stores, so a placed order reads the same after places or prices are edited:
 *  - newer orders: the region of the chosen place (from the order's snapshot);
 *  - older orders: one of the four former zones;
 *  - otherwise (POS sales, incomplete records): unknown.
 */
export type OrderDeliveryArea =
  | { key: string; kind: 'region'; id: string; nameAr: string; nameEn: string | null }
  | { key: string; kind: 'zone'; id: string }
  | { key: 'unknown'; kind: 'unknown' };

export function orderDeliveryArea(order: Pick<OrderRecord, 'deliveryLocation' | 'deliveryZone'>): OrderDeliveryArea {
  const place = order.deliveryLocation;
  const regionId = place?.regionId?.trim() || place?.regionName?.trim();
  if (place && regionId) {
    return { key: `region:${regionId}`, kind: 'region', id: regionId, nameAr: place.regionName || regionId, nameEn: place.regionNameEn };
  }
  const zone = order.deliveryZone?.trim();
  if (zone) return { key: `zone:${zone}`, kind: 'zone', id: zone };
  return { key: 'unknown', kind: 'unknown' };
}

/** Region (newer orders) or former-zone name in the current language; null when unknown. */
export function deliveryAreaLabel(area: OrderDeliveryArea, t: Translate, language: string): string | null {
  if (area.kind === 'region') return language === 'ar' ? area.nameAr : area.nameEn || area.nameAr;
  if (area.kind === 'zone') return legacyShippingZoneLabel(area.id, t);
  return null;
}

export function orderDeliveryAreaLabel(order: Pick<OrderRecord, 'deliveryLocation' | 'deliveryZone'>, t: Translate, language: string): string | null {
  return deliveryAreaLabel(orderDeliveryArea(order), t, language);
}

/** "برقين · جنين" (place · region) for newer orders, the former zone's name for older ones. */
export function orderDeliveryPlaceLabel(order: Pick<OrderRecord, 'deliveryLocation' | 'deliveryZone'>, t: Translate, language: string): string | null {
  const place = order.deliveryLocation;
  if (place?.name) {
    const region = orderDeliveryAreaLabel(order, t, language);
    return region && region !== place.name ? `${place.name} · ${region}` : place.name;
  }
  return orderDeliveryAreaLabel(order, t, language);
}

/** Place (or former zone) plus the optional address details, on one line. */
export function orderDeliveryLine(order: OrderDeliveryFields, t: Translate, language: string): string | null {
  const place = orderDeliveryPlaceLabel(order, t, language);
  const details = order.deliveryAddress?.trim() || null;
  if (place && details) return `${place} · ${details}`;
  return place ?? details;
}

/**
 * The address as the customer gave it: newer orders "place · region · details" (details
 * optional), older orders their free-text address exactly as before.
 */
export function orderAddressLine(order: OrderDeliveryFields, t: Translate, language: string): string | null {
  if (order.deliveryLocation?.name) return orderDeliveryLine(order, t, language);
  return order.deliveryAddress?.trim() || null;
}

/** Orders per delivery area (stable keys), most orders first. */
export function deliveryAreaCounts(orders: Pick<OrderRecord, 'deliveryLocation' | 'deliveryZone'>[]): {
  all: number;
  areas: { area: OrderDeliveryArea; count: number }[];
} {
  const byKey = new Map<string, { area: OrderDeliveryArea; count: number }>();
  for (const order of orders) {
    const area = orderDeliveryArea(order);
    const row = byKey.get(area.key);
    if (row) row.count += 1;
    else byKey.set(area.key, { area, count: 1 });
  }
  return { all: orders.length, areas: [...byKey.values()].sort((a, b) => b.count - a.count) };
}
