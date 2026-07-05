import type { CatalogListProduct } from '../catalogProductList';
import type { CoordinateLook } from '../../types/coordinates';

export type CatalogSortKey = 'newest' | 'priceAsc' | 'priceDesc';

export type CatalogIndex = {
  products: CatalogListProduct[];
  counts: Map<string, number>;
  /** False when the store may have more products than we loaded. */
  complete: boolean;
};

export type CatalogCoordinatesBundle = {
  looks: CoordinateLook[];
  linkedById: Record<string, CatalogListProduct>;
};

export type CatalogQueryState = {
  selectedCats: string[];
  sortBy: CatalogSortKey;
  saleOnly: boolean;
  search: string;
};
