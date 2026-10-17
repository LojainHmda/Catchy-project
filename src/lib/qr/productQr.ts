/**
 * Product QR codes are never a stored field — they're derived on the fly from
 * the product's own (permanent, immutable) Firestore document id. This means
 * every product has always had a working QR code since the moment it was
 * created, with no backfill/migration and no risk of a stored code drifting
 * out of sync with the product it's supposed to identify.
 *
 * The payload is a real product-page URL rather than a bare id, so scanning
 * a printed tag with any phone's camera app (not just the POS) opens the
 * actual product page.
 */
export function productQrUrl(productId: string, origin: string = window.location.origin): string {
  return `${origin}/product/${encodeURIComponent(productId)}`;
}

/**
 * Recovers a product id from whatever a camera scan decoded — either one of
 * our own product URLs (any origin, in case a tag was printed before a
 * domain change) or a bare id typed/scanned some other way.
 */
export function parseProductIdFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/product\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    // Not a URL — fall through and treat it as a bare id.
  }

  return /^[A-Za-z0-9_-]{6,}$/.test(text) ? text : null;
}
