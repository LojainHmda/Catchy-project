import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { getDocsFromCache } from 'firebase/firestore';
import {
  collection,
  db,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from '../firebase';
import { canonicalCategory } from './category';
import {
  categoryCountsFromProducts,
  toCatalogListProduct,
  type CatalogListProduct,
} from './catalogProductList';

export const CATALOG_FETCH_SIZE = 24;
export const CATALOG_VIEW_PAGE_SIZE = 24;
const FIRESTORE_TIMEOUT_MS = 8_000;
const CATEGORY_COUNTS_LIMIT = 120;

export type CatalogSortKey = 'priceAsc' | 'priceDesc';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function buildProductQuery(options: {
  selectedCats: string[];
  sortBy: CatalogSortKey;
  cursor: QueryDocumentSnapshot | null;
  pageSize: number;
}) {
  const constraints: QueryConstraint[] = [];
  const categories = options.selectedCats.map(canonicalCategory).filter(Boolean);

  if (categories.length === 1) {
    constraints.push(where('category', '==', categories[0]!));
  } else if (categories.length > 1) {
    constraints.push(where('category', 'in', categories.slice(0, 10)));
  }

  if (categories.length === 0) {
    constraints.push(orderBy('price', options.sortBy === 'priceDesc' ? 'desc' : 'asc'));
  }

  constraints.push(limit(options.pageSize));
  if (options.cursor) constraints.push(startAfter(options.cursor));

  return query(collection(db, 'products'), ...constraints);
}

async function runQuery(q: ReturnType<typeof buildProductQuery>) {
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached;
  } catch {
    /* persistent cache not warm yet */
  }
  return withTimeout(getDocs(q), FIRESTORE_TIMEOUT_MS, 'Catalog products');
}

/** @deprecated Catalog page uses `loadCatalogIndex` — kept for admin/tools. */
export async function fetchCatalogProductsPage(options: {
  selectedCats: string[];
  sortBy: CatalogSortKey;
  cursor: QueryDocumentSnapshot | null;
  pageSize?: number;
}): Promise<{
  items: CatalogListProduct[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}> {
  const pageSize = options.pageSize ?? CATALOG_FETCH_SIZE;
  const q = buildProductQuery({ ...options, pageSize });
  const snap = await runQuery(q);
  const items = snap.docs.map((d) => toCatalogListProduct(d.id, d.data() as Record<string, unknown>));
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;
  return {
    items,
    lastDoc,
    hasMore: snap.docs.length === pageSize,
  };
}

/** @deprecated Catalog page derives counts from the index. */
export async function fetchCatalogCategoryCounts(): Promise<Map<string, number>> {
  const q = query(collection(db, 'products'), limit(CATEGORY_COUNTS_LIMIT));
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) {
      const items = cached.docs.map((d) =>
        toCatalogListProduct(d.id, d.data() as Record<string, unknown>)
      );
      return categoryCountsFromProducts(items);
    }
  } catch {
    /* persistent cache not warm yet */
  }
  const snap = await withTimeout(getDocs(q), FIRESTORE_TIMEOUT_MS, 'Category counts');
  const items = snap.docs.map((d) => toCatalogListProduct(d.id, d.data() as Record<string, unknown>));
  return categoryCountsFromProducts(items);
}
