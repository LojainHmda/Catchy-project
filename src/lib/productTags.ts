import {
  collection,
  getDocs,
  query,
  updateDoc,
  doc,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { ProductRecord } from '../types/product';
import { isProductInStock } from './productVariants';

/** Tag shown in the home page "Latest Arrivals" section (max 6 products). */
export const NEW_ARRIVAL_TAG = 'new-arrived';

export const MAX_NEW_ARRIVAL_PRODUCTS = 6;

const LEGACY_NEW_ARRIVAL_CATEGORY = 'new arrivals';

export type NewArrivalProduct = ProductRecord & { id: string };

export function isLegacyNewArrivalCategory(category: unknown): boolean {
  return typeof category === 'string' && category.trim().toLowerCase() === LEGACY_NEW_ARRIVAL_CATEGORY;
}

export function productTags(product: { tags?: unknown; category?: unknown } | null | undefined): string[] {
  if (!product || !Array.isArray(product.tags)) return [];
  return product.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

export function hasNewArrivalTag(product: { tags?: unknown; category?: unknown } | null | undefined): boolean {
  if (!product) return false;
  if (productTags(product).includes(NEW_ARRIVAL_TAG)) return true;
  return isLegacyNewArrivalCategory(product.category);
}

export function withNewArrivalTag(tags: string[], enabled: boolean): string[] {
  const without = tags.filter((t) => t !== NEW_ARRIVAL_TAG);
  return enabled ? [...without, NEW_ARRIVAL_TAG] : without;
}

function sortNewArrivalsNewestFirst(a: NewArrivalProduct, b: NewArrivalProduct): number {
  const aTime = new Date((a.createdAt as { toDate?: () => Date })?.toDate?.() ?? a.createdAt ?? 0).getTime();
  const bTime = new Date((b.createdAt as { toDate?: () => Date })?.toDate?.() ?? b.createdAt ?? 0).getTime();
  return bTime - aTime;
}

function mergeProductDocs(
  docLists: Array<Array<{ id: string; data: () => Record<string, unknown> }>>
): NewArrivalProduct[] {
  const byId = new Map<string, NewArrivalProduct>();
  for (const docs of docLists) {
    for (const d of docs) {
      if (!byId.has(d.id)) {
        byId.set(d.id, { id: d.id, ...(d.data() as Omit<NewArrivalProduct, 'id'>) });
      }
    }
  }
  return Array.from(byId.values()).filter(hasNewArrivalTag).sort(sortNewArrivalsNewestFirst);
}

/** Every product tagged for Latest Arrivals (tag + legacy category), newest first, no stock filter. */
async function fetchTaggedNewArrivalProducts(db: Firestore): Promise<NewArrivalProduct[]> {
  const [taggedResult, legacyResult] = await Promise.allSettled([
    getDocs(query(collection(db, 'products'), where('tags', 'array-contains', NEW_ARRIVAL_TAG))),
    getDocs(query(collection(db, 'products'), where('category', '==', 'New Arrivals'))),
  ]);

  const docLists: Array<Array<{ id: string; data: () => Record<string, unknown> }>> = [];
  if (taggedResult.status === 'fulfilled') docLists.push(taggedResult.value.docs);
  if (legacyResult.status === 'fulfilled') docLists.push(legacyResult.value.docs);

  let merged = mergeProductDocs(docLists);

  // Fallback: catch casing / data quirks — filter in memory (fine for typical catalog sizes).
  if (merged.length === 0) {
    const allSnap = await getDocs(collection(db, 'products'));
    merged = mergeProductDocs([allSnap.docs]);
  }

  return merged;
}

/**
 * Load products for the home page Latest Arrivals row. Sold-out products are
 * hidden (storefront-only) but stay tagged in admin; we filter before slicing so
 * the row still fills up to `max` from the in-stock arrivals.
 */
export async function fetchNewArrivalProducts(
  db: Firestore,
  max = MAX_NEW_ARRIVAL_PRODUCTS
): Promise<NewArrivalProduct[]> {
  const merged = await fetchTaggedNewArrivalProducts(db);
  return merged.filter((p) => isProductInStock(p)).slice(0, max);
}

/** Count tagged products excluding one id (for admin slot validation — counts all tagged). */
export async function countNewArrivalProducts(db: Firestore, excludeId?: string): Promise<number> {
  const all = await fetchTaggedNewArrivalProducts(db);
  return all.filter((p) => p.id !== excludeId).length;
}

/** Backfill `tags` for products that only used the old "New Arrivals" category. */
export async function migrateLegacyNewArrivalProducts(
  db: Firestore,
  products: Array<{ id: string; tags?: unknown; category?: unknown }>
): Promise<number> {
  const pending = products.filter(
    (p) => isLegacyNewArrivalCategory(p.category) && !productTags(p).includes(NEW_ARRIVAL_TAG)
  );
  if (pending.length === 0) return 0;

  await Promise.all(
    pending.map((p) =>
      updateDoc(doc(db, 'products', p.id), {
        tags: withNewArrivalTag(productTags(p), true),
        updatedAt: serverTimestamp(),
      })
    )
  );

  return pending.length;
}

/** Category label for admin — legacy placeholder category is not a real catalog category. */
export function productCategoryLabel(category: unknown): string {
  if (isLegacyNewArrivalCategory(category)) return '';
  return typeof category === 'string' ? category.trim() : '';
}
