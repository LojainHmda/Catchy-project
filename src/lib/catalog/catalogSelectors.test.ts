import { describe, it, expect } from 'vitest';
import { sortCatalogProducts } from './catalogSelectors';
import type { CatalogListProduct } from '../catalogProductList';

function product(id: string, overrides: Partial<CatalogListProduct> = {}): CatalogListProduct {
  return {
    id,
    name: id,
    price: 100,
    images: [],
    colorCount: 0,
    visible: true,
    ...overrides,
  };
}

describe('sortCatalogProducts — newest-first ordering (Catalog grid, category filters, search all share this)', () => {
  it('orders products newest first by createdAt', () => {
    const products = [
      product('oldest', { createdAt: 1000 }),
      product('newest', { createdAt: 3000 }),
      product('middle', { createdAt: 2000 }),
    ];

    const sorted = sortCatalogProducts(products, 'newest');

    expect(sorted.map((p) => p.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('REGRESSION: a newly-added product (highest createdAt) appears before older products', () => {
    const products = [
      product('existing-1', { createdAt: 5000 }),
      product('existing-2', { createdAt: 4000 }),
    ];
    const withNewProduct = [...products, product('just-added', { createdAt: 9999 })];

    const sorted = sortCatalogProducts(withNewProduct, 'newest');

    expect(sorted[0]!.id).toBe('just-added');
  });

  it('REGRESSION: editing an old product (createdAt unchanged) does not move it to the front', () => {
    const products = [
      product('a', { createdAt: 3000 }),
      product('b', { createdAt: 2000, name: 'edited after creation' }), // simulates an edit — createdAt stays original
      product('c', { createdAt: 1000 }),
    ];

    const sorted = sortCatalogProducts(products, 'newest');

    // 'b' keeps its original position (by createdAt), unaffected by being "edited"
    expect(sorted.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('LEGACY: a product with no createdAt sorts to the end, without crashing or being dropped', () => {
    const products = [
      product('has-timestamp', { createdAt: 1000 }),
      product('legacy-no-timestamp'), // createdAt is undefined
    ];

    const sorted = sortCatalogProducts(products, 'newest');

    expect(sorted).toHaveLength(2); // nothing silently omitted
    expect(sorted.map((p) => p.id)).toEqual(['has-timestamp', 'legacy-no-timestamp']);
  });

  it('other sort keys (price) are unaffected by this change', () => {
    const products = [product('expensive', { price: 300 }), product('cheap', { price: 50 })];

    expect(sortCatalogProducts(products, 'priceAsc').map((p) => p.id)).toEqual(['cheap', 'expensive']);
    expect(sortCatalogProducts(products, 'priceDesc').map((p) => p.id)).toEqual(['expensive', 'cheap']);
  });

  it('does not mutate the input array', () => {
    const products = [product('a', { createdAt: 1 }), product('b', { createdAt: 2 })];
    const original = [...products];

    sortCatalogProducts(products, 'newest');

    expect(products).toEqual(original);
  });
});
