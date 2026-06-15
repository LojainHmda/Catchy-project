import { canonicalCategory } from './category';
import type { CoordinateLook } from '../types/coordinates';

/** Unique product IDs referenced by any coordinate set. */
export function coordinateLinkedProductIds(looks: CoordinateLook[]): Set<string> {
  const ids = new Set<string>();
  for (const look of looks) {
    for (const id of look.productIds ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** Products tagged Coordinates or linked inside a coordinate set. */
export function productMatchesCoordinatesFilter(
  product: { id: string; category?: string },
  linkedIds: Set<string>
): boolean {
  return canonicalCategory(product.category) === 'Coordinates' || linkedIds.has(product.id);
}
