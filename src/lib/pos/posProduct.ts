import { canonicalCategory } from '../category';
import { isProductDiscounted } from '../catalogSale';
import { productCollectionKeys } from '../catalogProductList';
import { coerceProductImages, sanitizeImageSrc } from '../productImages';
import { totalFromSizeStock, type SizeStock } from '../productInventory';
import { createdAtMillis, hasStock, isSellableInPos } from '../productAvailability';
import { hasNewArrivalTag } from '../productTags';
import { parseColorVariants, resolveListingInventory } from '../productVariants';
import type { ProductColorVariant } from '../../types/product';

/**
 * Full-fidelity product shape for the POS terminal — unlike the customer catalog's
 * CatalogListProduct (a lean summary), this keeps every color variant's own
 * per-size stock so the terminal can offer size/color selection inline on each
 * tile without a second fetch.
 */
export type PosProduct = {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  onSale: boolean;
  category?: string;
  collections?: string[];
  tags?: string[];
  visible: boolean;
  barcode?: string;
  createdAt?: number;
  images: string[];
  stock: number;
  sizeStock: SizeStock;
  colorVariants: ProductColorVariant[];
};

export function toPosProduct(id: string, data: Record<string, unknown>): PosProduct {
  const colorVariants = parseColorVariants(data.colorVariants);
  const { sizeStock, stock } = resolveListingInventory(data);
  return {
    id,
    name: String(data.name ?? 'Product'),
    price: Number(data.price) || 0,
    compareAtPrice: Number.isFinite(Number(data.compareAtPrice)) ? Number(data.compareAtPrice) : undefined,
    onSale: data.onSale === true || data.sale === true,
    category: typeof data.category === 'string' ? data.category : undefined,
    collections: Array.isArray(data.collections)
      ? (data.collections as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
    visible: data.visible !== false,
    barcode: typeof data.barcode === 'string' && data.barcode.trim() ? data.barcode.trim() : undefined,
    createdAt: createdAtMillis(data.createdAt),
    images: coerceProductImages(data),
    stock,
    sizeStock,
    colorVariants,
  };
}

export function posProductInStock(product: Pick<PosProduct, 'sizeStock' | 'stock'>): boolean {
  return hasStock(product);
}

/**
 * What the register offers: every product with stock — including products hidden from the
 * online store (they stay sellable in the shop) — and no sold-out ones (productAvailability.ts).
 */
export function filterPosSellable(products: PosProduct[]): PosProduct[] {
  return products.filter(isSellableInPos);
}

/** Size/stock + display image scoped to a color, when the product has variants. */
export function posVariantScope(
  product: PosProduct,
  colorId: string | null
): { colorId: string | null; colorName: string | null; sizeStock: SizeStock; stock: number; image: string | null } {
  if (!product.colorVariants.length) {
    return {
      colorId: null,
      colorName: null,
      sizeStock: product.sizeStock,
      stock: product.stock,
      image: sanitizeImageSrc(product.images[0]),
    };
  }
  const variant =
    (colorId && product.colorVariants.find((v) => v.id === colorId)) ||
    product.colorVariants.find((v) => totalFromSizeStock(v.sizeStock) > 0) ||
    product.colorVariants[0]!;
  return {
    colorId: variant.id,
    colorName: variant.name,
    sizeStock: variant.sizeStock,
    stock: totalFromSizeStock(variant.sizeStock),
    image: sanitizeImageSrc(variant.images[0] ?? product.images[0]),
  };
}

export type PosCategorySelection = { kind: 'all' } | { kind: 'sale' } | { kind: 'new' } | { kind: 'category'; id: string };

export function filterPosProductsByCategory(products: PosProduct[], selection: PosCategorySelection): PosProduct[] {
  if (selection.kind === 'all') return products;
  if (selection.kind === 'sale') return products.filter(isProductDiscounted);
  if (selection.kind === 'new') return products.filter(hasNewArrivalTag);
  const key = canonicalCategory(selection.id).toLowerCase();
  return products.filter((p) => productCollectionKeys(p).some((k) => k.toLowerCase() === key));
}

export type PosBarcodeScanResult =
  | { kind: 'open'; productId: string }
  | { kind: 'outOfStock'; name: string }
  | { kind: 'search' };

/**
 * A scanned barcode (the admin-entered value, or the product id when none was set — see
 * productBarcodeValue): open the first match that has stock. If every match is sold out, say
 * so — sold-out products are not listed in the register, so searching would only show "no
 * match". Unknown codes fall back to the search box.
 */
export function resolvePosBarcodeScan(products: PosProduct[], code: string): PosBarcodeScanResult {
  const matches = products.filter((p) => (p.barcode && p.barcode === code) || p.id === code);
  const sellable = matches.find(isSellableInPos);
  if (sellable) return { kind: 'open', productId: sellable.id };
  if (matches.length > 0) return { kind: 'outOfStock', name: matches[0]!.name };
  return { kind: 'search' };
}

/** How many products the register offers in a category — same rule as the grid (filterPosSellable). */
export function posCategoryCount(products: PosProduct[], selection: PosCategorySelection): number {
  return filterPosSellable(filterPosProductsByCategory(products, selection)).length;
}

/** Newest first — same missing-timestamp-safe comparison as the customer catalog (lib/catalog/catalogSelectors.ts). */
export function sortPosProductsNewestFirst(products: PosProduct[]): PosProduct[] {
  return [...products].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function filterPosProductsBySearch(products: PosProduct[], needle: string): PosProduct[] {
  const q = needle.trim().toLowerCase();
  if (!q) return products;
  return products.filter((p) => {
    const haystack = [p.name, p.barcode ?? '', ...productCollectionKeys(p)].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
