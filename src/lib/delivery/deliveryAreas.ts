// Catchy's delivery places in the browser. The data and the price rules are shared with
// the server (server/lib/delivery/ — the production image ships only server/ and dist/).
import { DELIVERY_GROUPS, DELIVERY_REGIONS } from '../../../server/lib/delivery/deliveryRegions.js';
import { deliveryRegionById } from '../../../server/lib/delivery/deliveryPricing.js';
import { buildLocationSearchEntries, type LocationSearchEntry } from './locationSearch';

export { DELIVERY_GROUPS, DELIVERY_REGIONS };
export {
  MAX_DELIVERY_PRICE,
  deliveryGroupById,
  deliveryLocationPrice,
  deliveryLocationSnapshot,
  deliveryPriceRange,
  deliveryRegionById,
  deliveryRegionPrice,
  normalizeDeliveryPrice,
  parseDeliveryPriceSettings,
} from '../../../server/lib/delivery/deliveryPricing.js';

export type DeliveryGroup = (typeof DELIVERY_GROUPS)[number];
export type DeliveryRegion = (typeof DELIVERY_REGIONS)[number];
export type DeliveryLocation = { id: string; nameAr: string; regionId: string; regionItself?: boolean };

export type DeliveryLocationIndex = {
  locations: readonly DeliveryLocation[];
  byId: ReadonlyMap<string, DeliveryLocation>;
  search: LocationSearchEntry[];
};

/** Region name in the shopper's / admin's language (English names exist for regions only). */
export function deliveryRegionLabel(region: Pick<DeliveryRegion, 'nameAr' | 'nameEn'> | null | undefined, language: string): string {
  if (!region) return '';
  return language === 'ar' ? region.nameAr : region.nameEn || region.nameAr;
}

export function buildDeliveryLocationIndex(locations: readonly DeliveryLocation[]): DeliveryLocationIndex {
  return {
    locations,
    byId: new Map(locations.map((location) => [location.id, location])),
    search: buildLocationSearchEntries(locations, deliveryRegionById),
  };
}

let pending: Promise<DeliveryLocationIndex> | null = null;

/**
 * The 1,000+ place names ship as their own chunk, fetched the first time checkout or the
 * admin page needs them (they are part of the app build, not server data). A failed load
 * is not remembered, so the next call tries again.
 */
export function loadDeliveryLocationIndex(): Promise<DeliveryLocationIndex> {
  pending ??= import('../../../server/lib/delivery/deliveryLocations.js')
    .then(({ DELIVERY_LOCATIONS }) => buildDeliveryLocationIndex(DELIVERY_LOCATIONS))
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** The place with this Catchy id, or null. */
export async function findDeliveryLocationById(id: string | null | undefined): Promise<DeliveryLocation | null> {
  if (!id?.trim()) return null;
  const index = await loadDeliveryLocationIndex();
  return index.byId.get(id.trim()) ?? null;
}
