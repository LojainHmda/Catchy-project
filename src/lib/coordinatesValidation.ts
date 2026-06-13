import type { CoordinateLook, CoordinatesPageSettings } from '../types/coordinates';
import { getCoordinateImages } from './coordinateImages';
import { isCoordinateAvailable, resolveCoordinate, type ProductLike } from './coordinateResolve';
import { formatSizeStockSummary, hasSizedInventory, parseSizeStock, resolveProductInventory, totalFromSizeStock } from './productInventory';

export function normalizeCoordinateLook(raw: Partial<CoordinateLook> & { id: string }): CoordinateLook {
  const images = Array.isArray(raw.images)
    ? raw.images.filter((u): u is string => typeof u === 'string' && u.trim().length > 12)
    : undefined;
  const legacyImage = typeof raw.image === 'string' ? raw.image.trim() : '';
  const normalizedImages = images?.length ? images : legacyImage.length > 12 ? [legacyImage] : [];
  const image = normalizedImages[0] ?? legacyImage;

  const sizeStock = parseSizeStock(raw.sizeStock);
  const hasSizeStock = Object.keys(sizeStock).length > 0;
  const sizes = hasSizeStock
    ? Object.keys(sizeStock)
    : Array.isArray(raw.sizes)
      ? raw.sizes.map((s) => String(s).trim()).filter(Boolean)
      : [];
  const stock = hasSizeStock
    ? totalFromSizeStock(sizeStock)
    : Math.max(0, Math.floor(Number(raw.stock) || 0));

  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title.trim() : 'Untitled look',
    titleAr: typeof raw.titleAr === 'string' ? raw.titleAr.trim() : undefined,
    tagline: typeof raw.tagline === 'string' ? raw.tagline.trim() : undefined,
    taglineAr: typeof raw.taglineAr === 'string' ? raw.taglineAr.trim() : undefined,
    images: normalizedImages.length > 0 ? normalizedImages : undefined,
    image,
    price: Number.isFinite(Number(raw.price)) && Number(raw.price) > 0 ? Number(raw.price) : undefined,
    priceAutoSync: raw.priceAutoSync !== false,
    compareAtPrice: Number.isFinite(Number(raw.compareAtPrice)) ? Number(raw.compareAtPrice) : undefined,
    onSale: raw.onSale === true,
    sizeStock: hasSizeStock ? sizeStock : undefined,
    sizes: sizes.length > 0 ? sizes : undefined,
    stock,
    productIds: Array.isArray(raw.productIds)
      ? raw.productIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : 0,
    published: raw.published !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function validateCoordinateLook(
  look: Pick<CoordinateLook, 'title' | 'image' | 'images' | 'productIds' | 'price' | 'priceAutoSync'>,
  products: ProductLike[] = []
): { ok: true } | { ok: false; message: string } {
  if (!look.title?.trim()) {
    return { ok: false, message: 'Title is required.' };
  }
  if (!look.productIds?.length) {
    return { ok: false, message: 'Add at least one product to this set.' };
  }
  if (getCoordinateImages(look, products).length === 0) {
    return { ok: false, message: 'Linked products need photos (set collage is built from item images).' };
  }

  const resolved = resolveCoordinate(look, products);
  if (!resolved) {
    return { ok: false, message: 'Linked products could not be loaded.' };
  }
  if (resolved.price <= 0) {
    return { ok: false, message: 'Set a price or ensure linked products have valid prices.' };
  }
  if (!products.every((p) => {
    const { sizeStock, stock } = resolveProductInventory(p);
    if (hasSizedInventory(sizeStock)) return Object.values(sizeStock).some((n) => n > 0);
    return stock > 0;
  })) {
    return { ok: false, message: 'All linked products need stock before publishing.' };
  }

  return { ok: true };
}

export function validatePageSettings(
  settings: CoordinatesPageSettings
): { ok: true } | { ok: false; message: string } {
  if (!settings.heroTitle?.trim()) {
    return { ok: false, message: 'Page title is required.' };
  }
  if (!settings.heroSubtitle?.trim()) {
    return { ok: false, message: 'Page subtitle is required.' };
  }
  return { ok: true };
}

export function isLookVisibleToCustomers(look: CoordinateLook, products: ProductLike[] = []): boolean {
  return isCoordinateAvailable(look, products, getCoordinateImages(look, products).length > 0);
}

/** Linked products resolved in set order; empty slots if not loaded yet. */
export function linkedProductsForLook(
  look: Pick<CoordinateLook, 'productIds'>,
  productsById: Record<string, ProductLike>
): ProductLike[] {
  return (look.productIds ?? [])
    .map((id) => productsById[id])
    .filter((p): p is ProductLike => Boolean(p));
}

/** True when every productId has been loaded from Firestore. */
export function hasLinkedProductsLoaded(
  look: Pick<CoordinateLook, 'productIds'>,
  products: ProductLike[]
): boolean {
  const expected = look.productIds?.length ?? 0;
  return expected > 0 && products.length === expected;
}

/** Catalog badge + grid use the same rules once linked products are loaded. */
export function catalogCoordinateLooks(
  looks: CoordinateLook[],
  productsById: Record<string, ProductLike>
): CoordinateLook[] {
  return looks.filter((look) => {
    if (look.published === false) return false;
    const linked = linkedProductsForLook(look, productsById);
    if (!hasLinkedProductsLoaded(look, linked)) return false;
    return isLookVisibleToCustomers(look, linked);
  });
}

export function coordinateLookStats(looks: CoordinateLook[], productsById: Record<string, ProductLike> = {}) {
  let published = 0;
  let hidden = 0;
  looks.forEach((l) => {
    const products = (l.productIds ?? []).map((id) => productsById[id]).filter(Boolean);
    if (isLookVisibleToCustomers(l, products)) published += 1;
    else hidden += 1;
  });
  return { total: looks.length, published, hidden };
}

export function coordinateSizesSummary(_look: CoordinateLook, products: ProductLike[] = []): string {
  if (!products.length) return '—';
  const parts = products.map((p) => {
    const { sizeStock } = resolveProductInventory(p);
    const summary = formatSizeStockSummary(sizeStock, 2);
    return summary !== '—' ? summary : 'OS';
  });
  return parts.join(' · ');
}
