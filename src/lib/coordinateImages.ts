import type { CoordinateLook } from '../types/coordinates';
import { coerceProductImages, isUsableImageSrc, PRODUCT_IMAGE_PLACEHOLDER } from './productImages';
import { resolveCoordinate, type ProductLike } from './coordinateResolve';

export const MAX_COORDINATE_IMAGES = 4;

/** Collage images from linked product photos (fallback to legacy manual uploads). */
export function getCoordinateImages(
  look: Pick<CoordinateLook, 'images' | 'image' | 'productIds'>,
  products: ProductLike[] = []
): string[] {
  const ordered = (look.productIds ?? [])
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is ProductLike => Boolean(p));

  if (ordered.length > 0) {
    const fromProducts = ordered
      .map((p) => coerceProductImages(p)[0])
      .filter((u): u is string => typeof u === 'string' && isUsableImageSrc(u));
    if (fromProducts.length > 0) return fromProducts.slice(0, MAX_COORDINATE_IMAGES);
  }

  if (Array.isArray(look.images)) {
    const list = look.images.filter((u) => typeof u === 'string' && isUsableImageSrc(u));
    if (list.length > 0) return list.slice(0, MAX_COORDINATE_IMAGES);
  }
  const legacy = typeof look.image === 'string' ? look.image.trim() : '';
  return isUsableImageSrc(legacy) ? [legacy] : [];
}

export function primaryCoordinateImage(
  look: Pick<CoordinateLook, 'images' | 'image' | 'productIds'>,
  products: ProductLike[] = []
): string {
  return getCoordinateImages(look, products)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
}

export function displayCoordinatePrice(look: CoordinateLook, products: ProductLike[] = []): number {
  return resolveCoordinate(look, products)?.price ?? 0;
}
