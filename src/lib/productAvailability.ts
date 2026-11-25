import { hasSizedInventory, totalFromSizeStock, type SizeStock } from './productInventory';

/**
 * Where a product may appear — ONE definition shared by every screen (store owner's rules):
 *
 *   Online store (catalog grid, search, category counts, home page): shown online AND in stock.
 *   POS:               in stock — including products hidden from the online store, which stay
 *                      sellable in the shop. Sold-out products are not offered.
 *   Admin → Products:  every product, sold-out ones included (for management).
 *
 * "In stock" uses the resolved inventory (color variants summed — see resolveListingInventory):
 * a product that tracks sizes needs at least one size with stock; one that doesn't needs a
 * total above 0. Nothing here changes a product record — it only decides where it is listed.
 */

/** Inventory that has already been resolved (CatalogListProduct, PosProduct, resolveListingInventory()). */
export type InventorySummary = { sizeStock?: SizeStock; stock?: number };

export function hasStock(inventory: InventorySummary): boolean {
  const sizeStock = inventory.sizeStock ?? {};
  if (hasSizedInventory(sizeStock)) return totalFromSizeStock(sizeStock) > 0;
  return (inventory.stock ?? 0) > 0;
}

/** The admin "show online" switch. A missing field means shown (older products never had it). */
export function isShownOnline(product: { visible?: unknown }): boolean {
  return product.visible !== false;
}

/** Listed in the public online store: shown online and in stock. */
export function isSellableOnline(product: InventorySummary & { visible?: unknown }): boolean {
  return isShownOnline(product) && hasStock(product);
}

/** Offered in the POS: in stock, whether or not it is shown online. */
export function isSellableInPos(product: InventorySummary): boolean {
  return hasStock(product);
}

/** Firestore Timestamp / Date / ISO string / epoch number → epoch millis; undefined when missing or invalid. */
export function createdAtMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  const date = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  const ms = new Date(date as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Newest first by creation time. Products without one go last — never dropped (a Firestore
 * orderBy('createdAt') query would silently leave them out). Does not mutate the input.
 */
export function sortNewestFirst<T>(items: readonly T[], createdAt: (item: T) => number | undefined): T[] {
  return [...items].sort((a, b) => (createdAt(b) ?? 0) - (createdAt(a) ?? 0));
}
