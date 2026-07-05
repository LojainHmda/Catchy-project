import { useEffect, useMemo, useState } from 'react';
import { db, doc, getDoc } from '../firebase';
import type { OrderLineItem } from '../types/order';
import { isCoordinateCartId } from '../lib/coordinateCart';
import { resolveVariantSelection } from '../lib/productVariants';
import { sanitizeImageSrc } from '../lib/productImages';

/** Key a line item by product + chosen color so the right variant photo is resolved. */
function itemImageKey(item: Pick<OrderLineItem, 'productId' | 'colorId'>): string {
  return `${item.productId}|${item.colorId ?? ''}`;
}

/**
 * One-shot (non-hook) resolver: looks up product photos for line items whose stored
 * `image` is empty. Same logic as {@link useOrderItemImages} but awaitable, for code
 * paths outside React render (e.g. building the invoice image).
 */
export async function resolveOrderItemImages(
  items: OrderLineItem[]
): Promise<Record<string, string>> {
  const missing = items.filter(
    (item) => !item.image && item.productId && !isCoordinateCartId(item.productId)
  );
  if (!missing.length) return {};

  const productIds = Array.from(new Set(missing.map((item) => item.productId)));
  const productById = new Map<string, Record<string, unknown> | null>();
  await Promise.all(
    productIds.map(async (productId) => {
      try {
        const snap = await getDoc(doc(db, 'products', productId));
        productById.set(productId, snap.exists() ? (snap.data() as Record<string, unknown>) : null);
      } catch {
        productById.set(productId, null);
      }
    })
  );

  const next: Record<string, string> = {};
  for (const item of missing) {
    const data = productById.get(item.productId);
    if (!data) continue;
    const selection = resolveVariantSelection(data, item.colorId);
    const src = sanitizeImageSrc(selection.images[0] ?? '');
    if (src) next[itemImageKey(item)] = src;
  }
  return next;
}

/**
 * Resolve a usable product photo for order line items whose stored `image` is empty.
 *
 * Older orders (and any saved before image links were captured) can have a blank
 * `item.image` because base64 data URLs are stripped before writing to Firestore.
 * For the invoice / order views we look the photo up live from the product document
 * so the real image shows instead of a placeholder. Products that still have an
 * image keep using the stored URL — nothing is fetched for them.
 */
export function useOrderItemImages(items: OrderLineItem[]): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  // Only regular products with a missing image need a lookup (skip coordinate sets).
  const missing: OrderLineItem[] = useMemo(
    () =>
      items.filter(
        (item) => !item.image && item.productId && !isCoordinateCartId(item.productId)
      ),
    [items]
  );

  // Stable signature so the effect only re-runs when the set of missing items changes.
  const signature = useMemo(
    () => Array.from(new Set(missing.map((item) => itemImageKey(item)))).sort().join(','),
    [missing]
  );

  useEffect(() => {
    if (!signature) {
      setResolved((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }

    let cancelled = false;
    void (async () => {
      const next = await resolveOrderItemImages(missing);
      if (!cancelled) setResolved(next);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return resolved;
}

/** Stored image if present, otherwise a live-resolved product photo. */
export function orderItemImageSrc(
  item: Pick<OrderLineItem, 'productId' | 'colorId' | 'image'>,
  resolved: Record<string, string>
): string {
  return item.image || resolved[itemImageKey(item)] || '';
}
