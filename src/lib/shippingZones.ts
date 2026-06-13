export const SHIPPING_ZONE_IDS = [
  'west_bank',
  'jerusalem',
  'abu_ghosh',
  'inside_israel',
] as const;

export type ShippingZoneId = (typeof SHIPPING_ZONE_IDS)[number];

export type ShippingZone = {
  id: ShippingZoneId;
  cost: number;
  labelKey: string;
};

export const SHIPPING_ZONES: ShippingZone[] = [
  { id: 'west_bank', cost: 20, labelKey: 'shipping.zone.westBank' },
  { id: 'jerusalem', cost: 50, labelKey: 'shipping.zone.jerusalem' },
  { id: 'abu_ghosh', cost: 30, labelKey: 'shipping.zone.abuGhosh' },
  { id: 'inside_israel', cost: 70, labelKey: 'shipping.zone.insideIsrael' },
];

export function isShippingZoneId(value: string): value is ShippingZoneId {
  return (SHIPPING_ZONE_IDS as readonly string[]).includes(value);
}

export function getShippingCost(zoneId: ShippingZoneId | string | null | undefined): number {
  const zone = SHIPPING_ZONES.find((entry) => entry.id === zoneId);
  return zone?.cost ?? 0;
}

export function computeOrderTotals(subtotal: number, zoneId: ShippingZoneId | string | null | undefined) {
  const shippingCost = getShippingCost(zoneId);
  return {
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
  };
}
