/** Local fallback — never use third-party URLs (avoids CORB / hotlink blocks). */
export const PRODUCT_IMAGE_PLACEHOLDER = '/images/product-placeholder.svg';

export function isRemoteImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src.trim());
}

/** True when the URL is safe to put on an `<img src>` (avoids CORB from JSON/API responses). */
export function isUsableImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s || s.length < 12) return false;
  if (s.startsWith('data:image/')) return true;
  if (s.startsWith('/')) return true;
  if (!/^https?:\/\//i.test(s)) return false;
  if (/firestore\.googleapis\.com|identitytoolkit|securetoken\.googleapis/i.test(s)) return false;
  if (/images\.unsplash\.com/i.test(s)) return false;
  return true;
}

export function sanitizeImageSrc(src: string | undefined | null): string | null {
  if (!src || !isUsableImageSrc(src)) return null;
  return src.trim();
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
