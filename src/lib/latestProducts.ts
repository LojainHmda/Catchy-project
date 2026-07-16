import { collection, getDocs, limit, orderBy, query, type Firestore } from 'firebase/firestore';
import type { ProductRecord } from '../types/product';
import { isProductInStock } from './productVariants';

/** How many products the home page "Latest Arrivals" section shows. */
export const LATEST_PRODUCTS_COUNT = 10;

/** Fetch a deeper page than we need so filtering out hidden/sold-out items still leaves a full row. */
const FETCH_BUFFER_MULTIPLIER = 4;

export type LatestProduct = ProductRecord & { id: string };

/**
 * Home page "Latest Arrivals": the most recently created in-stock, visible products —
 * no manual tagging required. Sorted newest first by `createdAt`.
 */
export async function fetchLatestProducts(
  db: Firestore,
  max = LATEST_PRODUCTS_COUNT
): Promise<LatestProduct[]> {
  const snap = await getDocs(
    query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(max * FETCH_BUFFER_MULTIPLIER))
  );
  const products = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LatestProduct, 'id'>) }));
  return products
    .filter((p) => p.visible !== false)
    .filter((p) => isProductInStock(p))
    .slice(0, max);
}
