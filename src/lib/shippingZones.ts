/**
 * The FOUR FORMER delivery zones (Catchy's checkout until the delivery-places system).
 * Customers no longer choose these — checkout uses Catchy's own places and regions
 * (server/lib/delivery/, src/lib/delivery/). They are kept ONLY so orders placed with
 * them keep showing their zone name and, for the oldest orders that were saved without
 * a shipping cost, the price that zone had.
 */
export const LEGACY_SHIPPING_ZONES = [
  { id: 'west_bank', cost: 20, labelKey: 'shipping.zone.westBank' },
  { id: 'jerusalem', cost: 30, labelKey: 'shipping.zone.jerusalem' },
  { id: 'abu_ghosh', cost: 50, labelKey: 'shipping.zone.abuGhosh' },
  { id: 'inside_israel', cost: 70, labelKey: 'shipping.zone.insideIsrael' },
] as const;

export type LegacyShippingZoneId = (typeof LEGACY_SHIPPING_ZONES)[number]['id'];

function legacyZone(zoneId: string | null | undefined) {
  return LEGACY_SHIPPING_ZONES.find((zone) => zone.id === zoneId) ?? null;
}

/** Price of a former zone (0 for anything else) — only for old orders stored without `shippingCost`. */
export function legacyShippingCost(zoneId: string | null | undefined): number {
  return legacyZone(zoneId)?.cost ?? 0;
}

/** Translated name of a former zone; an unknown stored value is shown as-is (underscores as spaces). */
export function legacyShippingZoneLabel(zoneId: string | null | undefined, t: (key: string) => string): string | null {
  if (!zoneId?.trim()) return null;
  const zone = legacyZone(zoneId);
  return zone ? t(zone.labelKey) : zoneId.replace(/_/g, ' ');
}
