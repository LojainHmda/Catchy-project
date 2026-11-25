import {
  categoryCountsFromProducts,
  toCatalogListProduct,
  type CatalogListProduct,
} from '../catalogProductList';
import { fetchProductsByIds } from '../fetchProductsByIds';
import { fetchAllCoordinateLooks } from '../coordinatesService';
import { publishedLinkedProductIds } from '../coordinatesValidation';
import { invalidateCache, loadResource, readCache, readStaleCache, writeCache } from '../asyncResource';
import { sortNewestFirst } from '../productAvailability';
import { collection, db, getDocsFromServer } from '../../firebase';
import type { CatalogCoordinatesBundle, CatalogIndex } from './catalogTypes';
import type { CoordinateLook } from '../../types/coordinates';

const INDEX_KEY = 'catalog:index';
const COORDINATES_KEY = 'catalog:coordinates';
// v8: the index now holds EVERY product (it used to stop at the newest 80) — bumped so a
// saved v7 snapshot, which may be missing older products, is never shown as a fallback.
const INDEX_LOCAL_KEY = 'catchy.catalog.index.v8';
/**
 * Products are always read from the SERVER. A result is reused only if it was fetched
 * in the last few seconds (the app-boot prefetch feeding the catalog page) — never a
 * minutes-old list, so a product the owner just added or changed shows on the next view.
 */
const RECENT_REUSE_MS = 10_000;
/**
 * Extreme case only: when the server is this slow, the catalog may show the last saved
 * copy while it keeps waiting, and swaps in the real list as soon as it arrives.
 */
export const CATALOG_SLOW_MS = 6_000;
/** The saved copy is an emergency fallback (server slow/unreachable), never shown otherwise. */
const INDEX_FALLBACK_MAX_MS = 24 * 60 * 60 * 1000;
/** Give up on one request after this long (the page offers Retry). */
const NETWORK_GIVE_UP_MS = 30_000;

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

/** Exported for regression testing only — see catalogService.test.ts. */
export function mapIndexFromSnap(snap: Awaited<ReturnType<typeof getDocsFromServer>>): CatalogIndex {
  const products = sortNewestFirst(
    snap.docs.map((d) => toCatalogListProduct(d.id, d.data() as Record<string, unknown>)),
    (p) => p.createdAt
  );
  return {
    products,
    counts: categoryCountsFromProducts(products),
  };
}

type StoredIndex = {
  products: CatalogListProduct[];
  counts: Record<string, number>;
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

/**
 * Call right after any product mutation that changes catalog membership (permanent
 * delete, visibility toggle, etc). Without this, the in-memory index/coordinates
 * cache stays "fresh" for up to INDEX_FRESH_TTL_MS/COORDINATES_TTL_MS and the
 * localStorage snapshot for up to INDEX_STALE_MAX_MS, so a deleted product can keep
 * appearing in the catalog grid, search results, and coordinate sets — even across a
 * manual retry — until the next load call is forced to treat the cache as gone.
 */
export function invalidateCatalogCaches(): void {
  invalidateCache(INDEX_KEY);
  invalidateCache(COORDINATES_KEY);
  try {
    localStorage.removeItem(INDEX_LOCAL_KEY);
  } catch {
    /* quota / private mode */
  }
}

/**
 * EVERY product — no limit() and no orderBy(). The store (grid, category counts, header
 * search, home page) and the admin order-edit picker all list from this one index, so a
 * cap here hides products everywhere at once: it used to stop at the newest 80, and each
 * new product pushed an older, in-stock one out of the store. orderBy('createdAt') is
 * avoided too, because Firestore leaves out documents that lack the ordered field;
 * newest-first sorting happens in mapIndexFromSnap instead.
 */
/** Exported for regression testing only — see catalogService.test.ts. */
export function catalogIndexQuery() {
  return collection(db, 'products');
}

/**
 * Server only (getDocsFromServer): never answered from the Firestore SDK's local cache,
 * which can hold just a subset of products and would then look like the whole catalog.
 */
async function fetchCatalogIndexFromFirestore(): Promise<CatalogIndex> {
  const snap = await withTimeout(getDocsFromServer(catalogIndexQuery()), NETWORK_GIVE_UP_MS, 'Catalog index');
  return persistIndex(mapIndexFromSnap(snap));
}

/** Start loading as soon as the app boots — catalog is often the next page. */
export function prefetchCatalogIndex(): void {
  if (prefetchStarted || typeof window === 'undefined') return;
  prefetchStarted = true;
  void loadCatalogIndex().catch(() => undefined);
}

/** A server result from the last few seconds (e.g. the boot prefetch), else null. */
export function peekCatalogIndex(): CatalogIndex | null {
  return readCache<CatalogIndex>(INDEX_KEY, RECENT_REUSE_MS);
}

/**
 * Emergency fallback only — the last list that came from the server (this visit, or
 * saved in the browser up to 24 h). Show it only when the server is slow or unreachable.
 */
export function peekCatalogIndexFallback(): CatalogIndex | null {
  return readStaleCache<CatalogIndex>(INDEX_KEY) ?? readIndexLocal(INDEX_FALLBACK_MAX_MS);
}

/** The current product list from the server (a request already running is shared). */
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  return loadResource(INDEX_KEY, RECENT_REUSE_MS, fetchCatalogIndexFromFirestore);
}

export async function loadCatalogCoordinates(): Promise<CatalogCoordinatesBundle> {
  return loadResource(COORDINATES_KEY, RECENT_REUSE_MS, async () => {
    const looks = await fetchAllCoordinateLooks();
    const ids = publishedLinkedProductIds(looks);
    const linkedById = ids.length > 0 ? await fetchProductsByIds(ids) : {};
    return { looks, linkedById };
  });
}

/** Coordinate sets loaded in the last few seconds, else null (they are re-read each time). */
export function peekCatalogCoordinates(): CatalogCoordinatesBundle | null {
  return readCache<CatalogCoordinatesBundle>(COORDINATES_KEY, RECENT_REUSE_MS);
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
