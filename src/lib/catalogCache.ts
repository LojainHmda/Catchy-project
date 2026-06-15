import type { CatalogListProduct } from './catalogProductList';
import type { CoordinateLook } from '../types/coordinates';

const COORDINATE_TTL_MS = 2 * 60 * 1000;
const COUNTS_TTL_MS = 5 * 60 * 1000;
const PRODUCTS_TTL_MS = 3 * 60 * 1000;
const PRODUCTS_STORAGE_KEY = 'catchy.catalog.products';

type CacheEntry<T> = { value: T; at: number };

let coordinateLooksCache: CacheEntry<CoordinateLook[]> | null = null;
let categoryCountsCache: CacheEntry<Map<string, number>> | null = null;
const productsPageCache = new Map<string, CacheEntry<CatalogListProduct[]>>();

function isFresh<T>(entry: CacheEntry<T> | null, ttlMs: number): entry is CacheEntry<T> {
  return Boolean(entry && Date.now() - entry.at < ttlMs);
}

function readProductsStorage(): Record<string, CacheEntry<CatalogListProduct[]>> {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CacheEntry<CatalogListProduct[]>>;
  } catch {
    return {};
  }
}

function writeProductsStorage(data: Record<string, CacheEntry<CatalogListProduct[]>>) {
  try {
    sessionStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

export function catalogProductsCacheKey(selectedCats: string[], sortBy: string): string {
  return JSON.stringify({ cats: selectedCats.map((c) => c.toLowerCase()).sort(), sortBy });
}

export function getCachedCatalogProducts(key: string): CatalogListProduct[] | null {
  const memory = productsPageCache.get(key);
  if (isFresh(memory ?? null, PRODUCTS_TTL_MS)) return memory!.value;

  const stored = readProductsStorage()[key];
  if (isFresh(stored ?? null, PRODUCTS_TTL_MS)) {
    productsPageCache.set(key, stored!);
    return stored!.value;
  }
  return null;
}

export function setCachedCatalogProducts(key: string, items: CatalogListProduct[]) {
  if (items.length === 0) return;
  const entry = { value: items, at: Date.now() };
  productsPageCache.set(key, entry);
  const stored = readProductsStorage();
  stored[key] = entry;
  writeProductsStorage(stored);
}

export function getCachedCoordinateLooks(): CoordinateLook[] | null {
  return isFresh(coordinateLooksCache, COORDINATE_TTL_MS) ? coordinateLooksCache.value : null;
}

export function setCachedCoordinateLooks(looks: CoordinateLook[]) {
  coordinateLooksCache = { value: looks, at: Date.now() };
}

export function getCachedCategoryCounts(): Map<string, number> | null {
  return isFresh(categoryCountsCache, COUNTS_TTL_MS) ? categoryCountsCache.value : null;
}

export function setCachedCategoryCounts(counts: Map<string, number>) {
  categoryCountsCache = { value: counts, at: Date.now() };
}
