import { canonicalCategory } from './category';
import { coerceProductImages, isRemoteImageUrl, isUsableImageSrc, sanitizeImageSrc } from './productImages';
import { colorCount } from './productVariants';
import { resolveProductInventory } from './productInventory';

export type CatalogListProduct = {
  id: string;
  name: string;
  price: number;
  category?: string;
  sizes?: string[];
  images: string[];
  colorCount: number;
  compareAtPrice?: number;
  onSale?: boolean;
  sale?: boolean;
  stock?: number;
  sizeStock?: Record<string, number>;
};

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
  const { sizeStock, stock } = resolveProductInventory(data);
  return {
    id,
    name: String(data.name ?? 'Product'),
    price: Number(data.price) || 0,
    category: typeof data.category === 'string' ? data.category : undefined,
    sizes: Array.isArray(data.sizes) ? (data.sizes as string[]) : undefined,
    images: thumb ? [thumb] : [],
    colorCount: colorCount(data),
    compareAtPrice: Number.isFinite(Number(data.compareAtPrice)) ? Number(data.compareAtPrice) : undefined,
    onSale: data.onSale === true || data.sale === true,
    sale: data.sale === true,
    stock,
    ...(Object.keys(sizeStock).length > 0 ? { sizeStock } : {}),
  };
}

export function categoryCountsFromProducts(products: CatalogListProduct[]): Map<string, number> {
  const map = new Map<string, number>();
  products.forEach((p) => {
    const key = canonicalCategory(p.category);
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  return map;
}
