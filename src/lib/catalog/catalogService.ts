import {
  categoryCountsFromProducts,
  toCatalogListProduct,
  type CatalogListProduct,
} from '../catalogProductList';
import { fetchProductsByIds } from '../fetchProductsByIds';
import { fetchAllCoordinateLooks } from '../coordinatesService';
import { publishedLinkedProductIds } from '../coordinatesValidation';
import { loadResource, readCache, readStaleCache, writeCache } from '../asyncResource';
import { collection, db, getDocs, getDocsFromCache, limit, query } from '../../firebase';
import type { CatalogCoordinatesBundle, CatalogIndex } from './catalogTypes';
import type { CoordinateLook } from '../../types/coordinates';

const INDEX_KEY = 'catalog:index';
const COORDINATES_KEY = 'catalog:coordinates';
const INDEX_LOCAL_KEY = 'catchy.catalog.index.v6';
const INDEX_FRESH_TTL_MS = 3 * 60 * 1000;
const INDEX_STALE_MAX_MS = 24 * 60 * 60 * 1000;
const COORDINATES_TTL_MS = 2 * 60 * 1000;
/** Enough for this store; smaller payload = faster first byte. */
const INDEX_LIMIT = 80;
const NETWORK_TIMEOUT_MS = 6_000;

let prefetchStarted = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
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

function mapIndexFromSnap(snap: Awaited<ReturnType<typeof getDocs>>): CatalogIndex {
  const products = snap.docs.map((d) =>
    toCatalogListProduct(d.id, d.data() as Record<string, unknown>)
  );
  return {
    products,
    counts: categoryCountsFromProducts(products),
    complete: snap.docs.length < INDEX_LIMIT,
  };
}

type StoredIndex = {
  products: CatalogListProduct[];
  counts: Record<string, number>;
  complete: boolean;
  at: number;
};

function readIndexLocal(maxAgeMs: number): CatalogIndex | null {
  try {
    const raw = localStorage.getItem(INDEX_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIndex;
    if (Date.now() - parsed.at >= maxAgeMs) return null;
    return {
      products: parsed.products,
      counts: new Map(Object.entries(parsed.counts)),
      complete: parsed.complete,
    };
  } catch {
    return null;
  }
}

function writeIndexLocal(index: CatalogIndex): void {
  try {
    const payload: StoredIndex = {
      products: index.products,
      counts: Object.fromEntries(index.counts),
      complete: index.complete,
      at: Date.now(),
    };
    localStorage.setItem(INDEX_LOCAL_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function persistIndex(index: CatalogIndex): CatalogIndex {
  writeCache(INDEX_KEY, index);
  writeIndexLocal(index);
  return index;
}

/** No orderBy — sort client-side; one simple read is faster to plan and cache. */
function catalogIndexQuery() {
  return query(collection(db, 'products'), limit(INDEX_LIMIT));
}

async function fetchCatalogIndexFromFirestore(): Promise<CatalogIndex> {
  const q = catalogIndexQuery();
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return persistIndex(mapIndexFromSnap(cached));
  } catch {
    /* cold persistent cache */
  }
  const snap = await withTimeout(getDocs(q), NETWORK_TIMEOUT_MS, 'Catalog index');
  return persistIndex(mapIndexFromSnap(snap));
}

/** Start loading as soon as the app boots — catalog is often the next page. */
export function prefetchCatalogIndex(): void {
  if (prefetchStarted || typeof window === 'undefined') return;
  prefetchStarted = true;
  void loadCatalogIndex({ revalidate: Boolean(peekCatalogIndexStale()) }).catch(() => undefined);
}

/** Fresh cache only (skip network when younger than TTL). */
export function peekCatalogIndex(): CatalogIndex | null {
  return readCache<CatalogIndex>(INDEX_KEY, INDEX_FRESH_TTL_MS) ?? readIndexLocal(INDEX_FRESH_TTL_MS);
}

/** Stale OK — show immediately while revalidating (up to 24h). */
export function peekCatalogIndexStale(): CatalogIndex | null {
  return (
    readCache<CatalogIndex>(INDEX_KEY, INDEX_FRESH_TTL_MS) ??
    readIndexLocal(INDEX_FRESH_TTL_MS) ??
    readIndexLocal(INDEX_STALE_MAX_MS) ??
    readStaleCache<CatalogIndex>(INDEX_KEY)
  );
}

export async function loadCatalogIndex(options?: { revalidate?: boolean }): Promise<CatalogIndex> {
  const stale = peekCatalogIndexStale();
  if (stale && !readStaleCache<CatalogIndex>(INDEX_KEY)) {
    writeCache(INDEX_KEY, stale);
  }

  return loadResource(
    INDEX_KEY,
    INDEX_FRESH_TTL_MS,
    fetchCatalogIndexFromFirestore,
    { revalidate: options?.revalidate ?? Boolean(stale) }
  );
}

export async function loadCatalogCoordinates(): Promise<CatalogCoordinatesBundle> {
  return loadResource(COORDINATES_KEY, COORDINATES_TTL_MS, async () => {
    const looks = await fetchAllCoordinateLooks();
    const ids = publishedLinkedProductIds(looks);
    const linkedById = ids.length > 0 ? await fetchProductsByIds(ids) : {};
    return { looks, linkedById };
  });
}

export function peekCatalogCoordinates(): CatalogCoordinatesBundle | null {
  return readStaleCache<CatalogCoordinatesBundle>(COORDINATES_KEY);
}

export function primeCatalogCoordinates(bundle: CatalogCoordinatesBundle): void {
  writeCache(COORDINATES_KEY, bundle);
}

export function coordinateLooksFromBundle(bundle: CatalogCoordinatesBundle | null): CoordinateLook[] {
  return bundle?.looks ?? [];
}

export function linkedProductsFromBundle(
  bundle: CatalogCoordinatesBundle | null
): Record<string, CatalogListProduct> {
  return bundle?.linkedById ?? {};
}
