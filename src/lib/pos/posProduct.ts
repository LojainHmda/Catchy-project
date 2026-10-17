import { canonicalCategory } from '../category';
import { isProductDiscounted } from '../catalogSale';
import { productCollectionKeys } from '../catalogProductList';
import { coerceProductImages, sanitizeImageSrc } from '../productImages';
import { hasSizedInventory, totalFromSizeStock, type SizeStock } from '../productInventory';
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

function toMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  const date = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  const ms = new Date(date as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

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
    createdAt: toMillis(data.createdAt),
    images: coerceProductImages(data),
    stock,
    sizeStock,
    colorVariants,
  };
}

export function posProductInStock(product: Pick<PosProduct, 'sizeStock' | 'stock'>): boolean {
  if (hasSizedInventory(product.sizeStock)) return totalFromSizeStock(product.sizeStock) > 0;
  return product.stock > 0;
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

export function posCategoryCount(products: PosProduct[], selection: PosCategorySelection): number {
  return filterPosProductsByCategory(products, selection).filter((p) => p.visible).length;
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
