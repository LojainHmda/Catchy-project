/** Used only when a product has no usable image URLs. */
export const PRODUCT_IMAGE_PLACEHOLDER =
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000';

export function isRemoteImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src.trim());
}

/**
 * Normalize `images` / `image` from API or localStorage into a list of non-empty URL strings.
 * Handles JSON-stringified arrays and legacy single `image` field.
 */
export function coerceProductImages(product: {
  images?: unknown;
  image?: unknown;
}): string[] {
  let raw: unknown = product?.images;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        raw = Array.isArray(parsed) ? parsed : [raw];
      } catch {
        raw = [raw];
      }
    } else if (t.length > 0) {
      raw = [raw];
    } else {
      raw = [];
    }
  }

  if (!Array.isArray(raw)) raw = [];

  const urls = (raw as unknown[])
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.length > 12);

  if (urls.length === 0 && typeof product?.image === 'string') {
    const t = product.image.trim();
    if (t.length > 12) urls.push(t);
  }

  return urls;
}
