import type { CoordinateLook } from '../types/coordinates';
import { getCoordinateImages, primaryCoordinateImage } from './coordinateImages';
import type { ResolvedCoordinate, ProductLike } from './coordinateResolve';
import {
  hasSizedInventory,
  resolveProductInventory,
  stockForSelection,
} from './productInventory';

export const COORDINATE_CART_PREFIX = 'coord:';

export type CoordinateItemSizes = Record<string, string>;

export function coordinateCartId(lookId: string): string {
  return `${COORDINATE_CART_PREFIX}${lookId}`;
}

export function isCoordinateCartId(id: string): boolean {
  return id.startsWith(COORDINATE_CART_PREFIX);
}

export function coordinateLookIdFromCart(cartId: string): string {
  const raw = cartId.startsWith(COORDINATE_CART_PREFIX)
    ? cartId.slice(COORDINATE_CART_PREFIX.length)
    : cartId;
  const sep = raw.indexOf('::');
  return sep >= 0 ? raw.slice(0, sep) : raw;
}

/** Unique cart line key including per-item size picks. */
export function coordinateLineKey(lookId: string, itemSizes: CoordinateItemSizes): string {
  const parts = Object.entries(itemSizes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, size]) => `${productId}:${size}`)
    .join('|');
  return parts ? `${coordinateCartId(lookId)}::${parts}` : coordinateCartId(lookId);
}

export function formatCoordinateItemSizes(
  itemSizes: CoordinateItemSizes,
  products: ProductLike[]
): string {
  return Object.entries(itemSizes)
    .map(([pid, size]) => {
      const name = products.find((p) => p.id === pid)?.name;
      return name ? `${name}: ${size}` : size;
    })
    .join(' · ');
}

export function validateCoordinateItemSizes(
  products: ProductLike[],
  itemSizes: CoordinateItemSizes
): string | null {
  for (const product of products) {
    const pid = String(product.id ?? '');
    if (!pid) continue;
    const { sizeStock, stock } = resolveProductInventory(product);
    const sized = hasSizedInventory(sizeStock);
    const size = itemSizes[pid]?.trim() || null;
    if (sized && !size) {
      return `Select a size for ${String(product.name ?? 'each item')}.`;
    }
    if (stockForSelection(sizeStock, stock, size) <= 0) {
      return `${String(product.name ?? 'An item')} is out of stock for the selected size.`;
    }
  }
  return null;
}

/** How many full sets can be bought with the chosen per-item sizes. */
export function coordinateAvailableSets(
  products: ProductLike[],
  itemSizes: CoordinateItemSizes
): number {
  if (products.length === 0) return 0;
  let min = Infinity;
  for (const product of products) {
    const pid = String(product.id ?? '');
    const { sizeStock, stock } = resolveProductInventory(product);
    const size = itemSizes[pid]?.trim() || null;
    min = Math.min(min, stockForSelection(sizeStock, stock, size));
  }
  return min === Infinity ? 0 : min;
}

export function coordinateHasAnyStock(products: ProductLike[]): boolean {
  if (products.length === 0) return false;
  return products.every((product) => {
    const { sizeStock, stock } = resolveProductInventory(product);
    if (hasSizedInventory(sizeStock)) return Object.values(sizeStock).some((n) => n > 0);
    return stock > 0;
  });
}

/** Shape a coordinate look for cart using resolved pricing and per-item sizes. */
export function coordinateLookAsCartProduct(
  look: CoordinateLook,
  resolved: ResolvedCoordinate,
  products: ProductLike[],
  itemSizes: CoordinateItemSizes
) {
  return {
    id: coordinateCartId(look.id),
    name: look.title,
    price: resolved.price,
    images: getCoordinateImages(look, products),
    image: primaryCoordinateImage(look, products),
    stock: coordinateAvailableSets(products, itemSizes),
    compareAtPrice: resolved.compareAtPrice ?? undefined,
    onSale: resolved.onSale,
    coordinateProductIds: look.productIds,
    itemSizes,
    itemSizeSummary: formatCoordinateItemSizes(itemSizes, products),
  };
}
