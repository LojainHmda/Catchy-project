import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
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

export const CATALOG_FETCH_SIZE = 24;
export const CATALOG_VIEW_PAGE_SIZE = 24;

export type CatalogSortKey = 'priceAsc' | 'priceDesc';

export async function fetchCatalogProductsPage(options: {
  selectedCats: string[];
  sortBy: CatalogSortKey;
  cursor: QueryDocumentSnapshot | null;
  pageSize?: number;
}): Promise<{
  items: { id: string; [key: string]: unknown }[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}> {
  const pageSize = options.pageSize ?? CATALOG_FETCH_SIZE;
  const constraints: QueryConstraint[] = [];
  const categories = options.selectedCats.map(canonicalCategory).filter(Boolean);

  if (categories.length === 1) {
    constraints.push(where('category', '==', categories[0]!));
  } else if (categories.length > 1) {
    constraints.push(where('category', 'in', categories.slice(0, 10)));
  }

  // category + orderBy(price) needs a composite Firestore index; sort client-side when filtered
  if (categories.length === 0) {
    constraints.push(
      orderBy('price', options.sortBy === 'priceDesc' ? 'desc' : 'asc')
    );
  }

  constraints.push(limit(pageSize));
  if (options.cursor) constraints.push(startAfter(options.cursor));

  const snap = await getDocs(query(collection(db, 'products'), ...constraints));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;

  return {
    items,
    lastDoc,
    hasMore: snap.docs.length === pageSize,
  };
}

/** Lightweight fetch for sidebar category counts (cap avoids huge reads). */
export async function fetchCatalogCategoryCounts(): Promise<Map<string, number>> {
  const snap = await getDocs(query(collection(db, 'products'), limit(500)));
  const map = new Map<string, number>();
  snap.docs.forEach((d) => {
    const key = canonicalCategory(d.data().category);
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  return map;
}
