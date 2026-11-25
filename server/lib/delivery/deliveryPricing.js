// Delivery prices: Catchy's own rules, shared by the server (guest checkout) and the
// browser (signed-in checkout, cart, admin). Pure functions, no I/O.
//
// A place's price, first match wins:
//   1. the place's own price       (Admin -> Delivery prices -> "Places with their own price")
//   2. its region's price          (Admin -> Delivery prices -> region table)
//   3. the region's starting price (deliveryRegions.js `defaultPrice`)
//
// Admin prices live in Firestore `site_settings/delivery_prices` (public read, owner write —
// the existing site_settings rules):
//   { regionPrices: { [regionId]: number }, locationPrices: { [locationId]: number },
//     updatedAt, updatedByUid, updatedByName }
// A missing document simply means "starting prices". Orders store a snapshot of the place
// and its price (deliveryLocationSnapshot), so editing prices never changes a placed order.
import { DELIVERY_GROUPS, DELIVERY_REGIONS } from './deliveryRegions.js';

export const DELIVERY_PRICES_COLLECTION = 'site_settings';
export const DELIVERY_PRICES_DOC_ID = 'delivery_prices';
/** Highest price the admin page accepts (ILS) — a typo guard, not a business rule. */
export const MAX_DELIVERY_PRICE = 1000;

const REGIONS_BY_ID = new Map(DELIVERY_REGIONS.map((region) => [region.id, region]));
const GROUPS_BY_ID = new Map(DELIVERY_GROUPS.map((group) => [group.id, group]));

/** @param {unknown} id */
export function deliveryRegionById(id) {
  return typeof id === 'string' ? REGIONS_BY_ID.get(id) ?? null : null;
}

/** @param {unknown} id */
export function deliveryGroupById(id) {
  return typeof id === 'string' ? GROUPS_BY_ID.get(id) ?? null : null;
}

/**
 * A usable price: a finite number from 0 to MAX_DELIVERY_PRICE, rounded to agorot.
 * Anything else (empty, negative, text, NaN, too large) -> null.
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeDeliveryPrice(value) {
  if (typeof value === 'number') return usablePrice(value);
  if (typeof value === 'string' && value.trim() !== '') return usablePrice(Number(value.trim()));
  return null;
}

/** @param {number} n */
function usablePrice(n) {
  if (!Number.isFinite(n) || n < 0 || n > MAX_DELIVERY_PRICE) return null;
  return Math.round(n * 100) / 100;
}

/**
 * @typedef {{ regionPrices: Record<string, number>, locationPrices: Record<string, number> }} DeliveryPriceSettings
 */

/**
 * Stored settings -> clean price maps. Unknown regions and unusable prices are ignored, so a
 * bad value can never zero a price: the place falls back to its region / starting price.
 * @param {unknown} raw
 * @returns {DeliveryPriceSettings}
 */
export function parseDeliveryPriceSettings(raw) {
  /** @type {Record<string, number>} */
  const regionPrices = {};
  /** @type {Record<string, number>} */
  const locationPrices = {};
  const data = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  if (data.regionPrices && typeof data.regionPrices === 'object') {
    for (const [regionId, value] of Object.entries(data.regionPrices)) {
      const price = normalizeDeliveryPrice(value);
      if (REGIONS_BY_ID.has(regionId) && price !== null) regionPrices[regionId] = price;
    }
  }
  if (data.locationPrices && typeof data.locationPrices === 'object') {
    for (const [locationId, value] of Object.entries(data.locationPrices)) {
      const price = normalizeDeliveryPrice(value);
      if (locationId && price !== null) locationPrices[locationId] = price;
    }
  }
  return { regionPrices, locationPrices };
}

/**
 * The region's current price (its admin price, else its starting price); null for an unknown region.
 * @param {unknown} regionId
 * @param {Partial<DeliveryPriceSettings> | null | undefined} settings
 * @returns {number | null}
 */
export function deliveryRegionPrice(regionId, settings) {
  const region = deliveryRegionById(regionId);
  if (!region) return null;
  const own = settings?.regionPrices?.[region.id];
  return typeof own === 'number' ? own : region.defaultPrice;
}

/**
 * A place's current price and where it comes from; null when its region is unknown.
 * @param {{ id: string, regionId: string } | null | undefined} location
 * @param {Partial<DeliveryPriceSettings> | null | undefined} settings
 * @returns {{ price: number, source: 'location' | 'region' } | null}
 */
export function deliveryLocationPrice(location, settings) {
  if (!location || typeof location.id !== 'string') return null;
  const own = settings?.locationPrices?.[location.id];
  if (typeof own === 'number') return { price: own, source: 'location' };
  const price = deliveryRegionPrice(location.regionId, settings);
  return price === null ? null : { price, source: 'region' };
}

/**
 * Cheapest and dearest delivery right now (the cart's "Delivery 20–70" line).
 * @param {Partial<DeliveryPriceSettings> | null | undefined} settings
 * @returns {{ min: number, max: number }}
 */
export function deliveryPriceRange(settings) {
  const prices = DELIVERY_REGIONS.map((region) => /** @type {number} */ (deliveryRegionPrice(region.id, settings)));
  for (const value of Object.values(settings?.locationPrices ?? {})) {
    if (typeof value === 'number') prices.push(value);
  }
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   regionId: string,
 *   regionName: string,
 *   regionNameEn: string | null,
 *   price: number,
 * }} DeliveryLocationSnapshotRecord
 */

/**
 * What an order stores about its delivery place: the names and price as they were at
 * checkout, so later edits to places or prices never change a placed order.
 * @param {{ id: string, nameAr: string, regionId: string } | null | undefined} location
 * @param {Partial<DeliveryPriceSettings> | null | undefined} settings
 * @returns {DeliveryLocationSnapshotRecord | null}
 */
export function deliveryLocationSnapshot(location, settings) {
  const region = location ? deliveryRegionById(location.regionId) : null;
  const priced = deliveryLocationPrice(location, settings);
  if (!location || !region || !priced) return null;
  return {
    id: location.id,
    name: location.nameAr,
    regionId: region.id,
    regionName: region.nameAr,
    regionNameEn: region.nameEn || null,
    price: priced.price,
  };
}
