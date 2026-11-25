import type { CatalogListProduct } from '../catalogProductList';
import type { CoordinateLook } from '../../types/coordinates';

export type CatalogSortKey = 'newest' | 'priceAsc' | 'priceDesc';

export type CatalogIndex = {
  /** Every product in the store, newest first (hidden and sold-out ones are filtered where listed). */
  products: CatalogListProduct[];
  counts: Map<string, number>;
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
