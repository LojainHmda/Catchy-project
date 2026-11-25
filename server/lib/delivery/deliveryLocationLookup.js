// Find a delivery place by its Catchy id. Used by the server (guest checkout) and, loaded
// on demand, by the browser (signed-in checkout, admin), so the 1,000+ names stay out of
// the main storefront bundle.
import { DELIVERY_LOCATIONS } from './deliveryLocations.js';

const LOCATIONS_BY_ID = new Map(DELIVERY_LOCATIONS.map((location) => [location.id, location]));

/**
 * The place with this Catchy id, or null.
 * @param {unknown} id
 */
export function findDeliveryLocation(id) {
  return typeof id === 'string' ? LOCATIONS_BY_ID.get(id.trim()) ?? null : null;
}

export { DELIVERY_LOCATIONS };
