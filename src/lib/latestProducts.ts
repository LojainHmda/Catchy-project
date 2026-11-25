import { loadCatalogIndex } from './catalog/catalogService';
import type { CatalogListProduct } from './catalogProductList';
import { isSellableOnline, sortNewestFirst } from './productAvailability';

/** How many products the home page "Latest Arrivals" section shows. */
export const LATEST_PRODUCTS_COUNT = 10;

/**
 * The newest products the store can sell — shown online and in stock (productAvailability.ts),
 * newest first. Picks from the WHOLE catalog, so the section stays full however many of the
 * most recent products are hidden or sold out.
 */
export function latestSellableProducts(
  products: readonly CatalogListProduct[],
  max = LATEST_PRODUCTS_COUNT
): CatalogListProduct[] {
  return sortNewestFirst(products.filter(isSellableOnline), (p) => p.createdAt).slice(0, max);
}

/**
 * Home page "Latest Arrivals": the same complete product list as the catalog and search
 * (loadCatalogIndex — the app-boot prefetch is reused, so this is usually no extra request).
 */
export async function fetchLatestProducts(max = LATEST_PRODUCTS_COUNT): Promise<CatalogListProduct[]> {
  const index = await loadCatalogIndex();
  return latestSellableProducts(index.products, max);
}
