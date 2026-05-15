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

export const CATALOG_FETCH_SIZE = 24;
export const CATALOG_VIEW_PAGE_SIZE = 24;

export type CatalogSortKey = 'popularity' | 'priceAsc' | 'priceDesc' | 'name';

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

  if (options.selectedCats.length === 1) {
    constraints.push(where('category', '==', options.selectedCats[0]));
  } else if (options.selectedCats.length > 1) {
    constraints.push(where('category', 'in', options.selectedCats.slice(0, 10)));
  }

  if (options.sortBy === 'priceAsc') constraints.push(orderBy('price', 'asc'));
  else if (options.sortBy === 'priceDesc') constraints.push(orderBy('price', 'desc'));
  else if (options.sortBy === 'name') constraints.push(orderBy('name', 'asc'));
  else constraints.push(orderBy('createdAt', 'desc'));

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
    const raw = d.data().category;
    if (!raw || typeof raw !== 'string') return;
    const key = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  return map;
}
