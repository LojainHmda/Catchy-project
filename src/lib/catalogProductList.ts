import { canonicalCategory } from './category';
import { coerceProductImages, isRemoteImageUrl, isUsableImageSrc, sanitizeImageSrc } from './productImages';
import { colorCount, parseColorVariants, resolveListingInventory } from './productVariants';
import { hasSizedInventory, sortedSizeStockEntries, totalFromSizeStock } from './productInventory';

/** Compact color swatch for catalog cards — hex + labels, no heavy image payload. */
export type CatalogColorSwatch = {
  hex: string;
  name: string;
  nameAr?: string;
};

export type CatalogListProduct = {
  id: string;
  name: string;
  price: number;
  category?: string;
  /** Extra collections this product also appears in, alongside `category` (e.g. `["Offers"]`). */
  collections?: string[];
  sizes?: string[];
  images: string[];
  colorCount: number;
  colorSwatches?: CatalogColorSwatch[];
  compareAtPrice?: number;
  onSale?: boolean;
  sale?: boolean;
  stock?: number;
  sizeStock?: Record<string, number>;
  /** Admin-controlled storefront visibility, independent of stock. */
  visible: boolean;
  /** Creation time in epoch milliseconds, for "newest first" sorting. */
  createdAt?: number;
  /** POS barcode/SKU, when set. */
  barcode?: string;
};

/** Coerce a Firestore Timestamp / ISO string / number into epoch millis. */
function toMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  const date = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  const ms = new Date(date as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

const MAX_CATALOG_SWATCHES = 5;

/** Small list of color swatches (hex + label) for storefront cards. */
export function catalogColorSwatches(product: { colorVariants?: unknown }): CatalogColorSwatch[] {
  return parseColorVariants(product.colorVariants)
    .slice(0, MAX_CATALOG_SWATCHES)
    .map((variant) => ({
      hex: variant.hex?.trim() || '#d1d5db',
      name: variant.name,
      ...(variant.nameAr ? { nameAr: variant.nameAr } : {}),
    }));
}

/** Prefer CDN/storage URLs; fall back to legacy embedded images so nothing disappears in the grid. */
export function catalogThumbnailUrl(product: { images?: unknown; image?: unknown }): string {
  const imgs = coerceProductImages(product);
  const remote = imgs.find((url) => isRemoteImageUrl(url) && isUsableImageSrc(url));
  if (remote) return remote;
  const legacy = imgs.find((url) => isUsableImageSrc(url));
  return legacy ?? '';
}

export function toCatalogListProduct(id: string, data: Record<string, unknown>): CatalogListProduct {
  const thumb = sanitizeImageSrc(catalogThumbnailUrl(data)) ?? '';
  const { sizeStock, stock } = resolveListingInventory(data);
  const swatches = catalogColorSwatches(data);
  return {
    id,
    name: String(data.name ?? 'Product'),
    price: Number(data.price) || 0,
    category: typeof data.category === 'string' ? data.category : undefined,
    ...(Array.isArray(data.collections)
      ? {
          collections: (data.collections as unknown[]).filter(
            (c): c is string => typeof c === 'string' && c.trim().length > 0
          ),
        }
      : {}),
    sizes: Array.isArray(data.sizes) ? (data.sizes as string[]) : undefined,
    images: thumb ? [thumb] : [],
    colorCount: colorCount(data),
    ...(swatches.length > 0 ? { colorSwatches: swatches } : {}),
    compareAtPrice: Number.isFinite(Number(data.compareAtPrice)) ? Number(data.compareAtPrice) : undefined,
    onSale: data.onSale === true || data.sale === true,
    sale: data.sale === true,
    stock,
    ...(Object.keys(sizeStock).length > 0 ? { sizeStock } : {}),
    visible: data.visible !== false,
    ...(toMillis(data.createdAt) !== undefined ? { createdAt: toMillis(data.createdAt) } : {}),
    ...(typeof data.barcode === 'string' && data.barcode.trim() ? { barcode: data.barcode.trim() } : {}),
  };
}

/**
 * Whether a catalog product is buyable. Mirrors the product page: a sized product
 * needs at least one size with stock; an unsized product needs total stock.
 */
export function catalogProductInStock(
  product: Pick<CatalogListProduct, 'sizeStock' | 'stock'>
): boolean {
  const sizeStock = product.sizeStock ?? {};
  if (hasSizedInventory(sizeStock)) return totalFromSizeStock(sizeStock) > 0;
  return (product.stock ?? 0) > 0;
}

/** Sizes to show on a catalog card — only those still in stock (finished sizes hidden). */
export function catalogDisplaySizes(
  product: Pick<CatalogListProduct, 'sizeStock' | 'sizes'>
): string[] {
  const sizeStock = product.sizeStock ?? {};
  if (hasSizedInventory(sizeStock)) {
    return sortedSizeStockEntries(sizeStock, { includeZero: false }).map(([size]) => size);
  }
  return Array.isArray(product.sizes) ? product.sizes : [];
}

/** Canonical set of every collection a product belongs to: its primary `category` plus any extra `collections`. */
export function productCollectionKeys(product: Pick<CatalogListProduct, 'category' | 'collections'>): string[] {
  const keys = new Set<string>();
  const primary = canonicalCategory(product.category);
  if (primary) keys.add(primary);
  (product.collections ?? []).forEach((c) => {
    const key = canonicalCategory(c);
    if (key) keys.add(key);
  });
  return [...keys];
}

/** Counts only buyable products so chip counts match what the grid actually shows. A product in
 *  multiple collections (primary category + extras) is counted once per collection it belongs to. */
export function categoryCountsFromProducts(products: CatalogListProduct[]): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((p) => {
    if (!p.visible) return;
    if (!catalogProductInStock(p)) return;
    productCollectionKeys(p).forEach((key) => {
      map.set(key, (map.get(key) ?? 0) + 1);
    });
  });
  return map;
}
