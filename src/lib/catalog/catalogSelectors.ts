import { canonicalCategory } from '../category';
import { isProductDiscounted } from '../catalogSale';
import { catalogProductInStock, type CatalogListProduct } from '../catalogProductList';
import type { StoreCategory } from '../categoriesService';
import {
  catalogCoordinateLooks,
  linkedProductsForLook,
} from '../coordinatesValidation';
import type { CoordinateLook } from '../../types/coordinates';
import type { CatalogQueryState, CatalogSortKey } from './catalogTypes';

export const CATALOG_VIEW_PAGE_SIZE = 24;

export function sortCatalogProducts(
  products: CatalogListProduct[],
  sortBy: CatalogSortKey
): CatalogListProduct[] {
  const list = [...products];
  if (sortBy === 'newest') {
    list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return list;
  }
  list.sort((a, b) => {
    const diff = (Number(a.price) || 0) - (Number(b.price) || 0);
    return sortBy === 'priceAsc' ? diff : -diff;
  });
  return list;
}

export function filterCatalogProducts(
  products: CatalogListProduct[],
  query: Pick<CatalogQueryState, 'selectedCats' | 'saleOnly' | 'search'>
): CatalogListProduct[] {
  const needle = query.search.trim().toLowerCase();

  return products.filter((p) => {
    if (!catalogProductInStock(p)) return false;
    if (query.saleOnly && !isProductDiscounted(p)) return false;
    if (needle && !String(p.name).toLowerCase().includes(needle)) return false;
    if (query.selectedCats.length) {
      const pc = p.category ? canonicalCategory(p.category).toLowerCase() : '';
      const ok = query.selectedCats.some((c) => canonicalCategory(c).toLowerCase() === pc);
      if (!ok) return false;
    }
    return true;
  });
}

export type CatalogCategoryOption = {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  count: number;
  isCoordinates: boolean;
};

export function buildCategoryOptions(
  categories: StoreCategory[],
  counts: Map<string, number>,
  coordinateLooks: CoordinateLook[],
  coordinatesActive: boolean,
  liveCoordinateCount: number
): CatalogCategoryOption[] {
  const publishedCoordinateCount = coordinateLooks.filter((look) => look.published !== false).length;
  return categories.map((cat) => {
    const key = canonicalCategory(cat.id);
    const isCoordinates = cat.id.toLowerCase() === 'coordinates';
    let count = counts.get(key) ?? 0;
    if (isCoordinates) {
      count = (coordinatesActive ? liveCoordinateCount : publishedCoordinateCount) + count;
    }
    return { id: cat.id, name: cat.name, nameAr: cat.nameAr, icon: cat.icon, count, isCoordinates };
  });
}

export type CatalogGridEntry =
  | { kind: 'look'; look: CoordinateLook }
  | { kind: 'product'; product: CatalogListProduct };

export function buildCatalogGridEntries(options: {
  products: CatalogListProduct[];
  query: CatalogQueryState;
  coordinatesActive: boolean;
  coordinateLooks: CoordinateLook[];
  linkedById: Record<string, CatalogListProduct>;
}): CatalogGridEntry[] {
  const filtered = filterCatalogProducts(options.products, options.query);
  const sorted = sortCatalogProducts(filtered, options.query.sortBy);
  const prods: CatalogGridEntry[] = sorted.map((product) => ({ kind: 'product', product }));

  if (!options.coordinatesActive) return prods;

  const liveLooks = catalogCoordinateLooks(options.coordinateLooks, options.linkedById);
  const needle = options.query.search.trim().toLowerCase();
  const looks = liveLooks
    .filter((look) => {
      if (!needle) return true;
      const hay = `${look.title} ${look.titleAr ?? ''} ${look.tagline ?? ''} ${look.taglineAr ?? ''}`.toLowerCase();
      return hay.includes(needle);
    })
    .map((look) => ({ kind: 'look' as const, look }));

  return [...looks, ...prods];
}

export function productsForCoordinateLook(
  look: CoordinateLook,
  linkedById: Record<string, CatalogListProduct>
) {
  return linkedProductsForLook(look, linkedById);
}
