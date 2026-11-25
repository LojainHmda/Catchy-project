import { db, doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from '../../firebase';
import {
  DELIVERY_PRICES_COLLECTION,
  DELIVERY_PRICES_DOC_ID,
  normalizeDeliveryPrice,
  parseDeliveryPriceSettings,
} from '../../../server/lib/delivery/deliveryPricing.js';
import { DELIVERY_REGIONS } from '../../../server/lib/delivery/deliveryRegions.js';

export type DeliveryPriceSettings = {
  regionPrices: Record<string, number>;
  locationPrices: Record<string, number>;
};

export type DeliveryPriceSettingsInfo = DeliveryPriceSettings & {
  /** When an admin last saved prices (null = never: starting prices apply). */
  updatedAt: Date | null;
  updatedByName: string | null;
};

const priceDocRef = () => doc(db, DELIVERY_PRICES_COLLECTION, DELIVERY_PRICES_DOC_ID);

function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

export function deliveryPriceSettingsFromDoc(data: Record<string, unknown> | null | undefined): DeliveryPriceSettingsInfo {
  return {
    ...parseDeliveryPriceSettings(data ?? null),
    updatedAt: toDate(data?.updatedAt),
    updatedByName: typeof data?.updatedByName === 'string' && data.updatedByName.trim() ? data.updatedByName : null,
  };
}

/** Current prices straight from the server, never a cached copy (placing an order, admin page). */
export async function fetchDeliveryPriceSettings(): Promise<DeliveryPriceSettingsInfo> {
  const snap = await getDocFromServer(priceDocRef());
  return deliveryPriceSettingsFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
}

/** Live prices for checkout and the cart: delivered again whenever an admin saves new prices. */
export function subscribeDeliveryPriceSettings(
  onChange: (settings: DeliveryPriceSettingsInfo) => void,
  onError: (error: unknown) => void
): () => void {
  return onSnapshot(
    priceDocRef(),
    (snap) => onChange(deliveryPriceSettingsFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null)),
    onError
  );
}

export class DeliveryPriceValidationError extends Error {
  constructor(readonly key: string) {
    super(`Invalid delivery price for ${key}`);
    this.name = 'DeliveryPriceValidationError';
  }
}

/**
 * Save the whole price table: every region's price plus the places with their own price
 * (a place left out goes back to its region's price). Firestore rules allow only the
 * store owner to write site_settings. Throws DeliveryPriceValidationError before writing
 * anything if a price is unusable.
 */
export async function saveDeliveryPriceSettings(
  prices: DeliveryPriceSettings,
  actor: { uid: string; name: string | null }
): Promise<void> {
  const regionPrices: Record<string, number> = {};
  for (const region of DELIVERY_REGIONS) {
    const price = normalizeDeliveryPrice(prices.regionPrices[region.id]);
    if (price === null) throw new DeliveryPriceValidationError(region.id);
    regionPrices[region.id] = price;
  }
  const locationPrices: Record<string, number> = {};
  for (const [locationId, value] of Object.entries(prices.locationPrices)) {
    const price = normalizeDeliveryPrice(value);
    if (!locationId || price === null) throw new DeliveryPriceValidationError(locationId);
    locationPrices[locationId] = price;
  }
  await setDoc(priceDocRef(), {
    regionPrices,
    locationPrices,
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.name ?? null,
  });
}
