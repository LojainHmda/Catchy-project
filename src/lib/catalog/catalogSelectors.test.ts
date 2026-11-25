import { describe, it, expect } from 'vitest';
import { filterCatalogProducts, nextCategorySelection, sortCatalogProducts } from './catalogSelectors';
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

describe('nextCategorySelection — a category chip replaces the previous category instead of adding to it', () => {
  const tops = product('top-1', { category: 'Tops', stock: 3 });
  const dress = product('dress-1', { category: 'Dresses', stock: 2 });
  const skirt = product('skirt-1', { category: 'Skirts', stock: 1 });
  const shown = (selectedCats: string[]) =>
    filterCatalogProducts([tops, dress, skirt], { selectedCats, saleOnly: false, search: '' }).map((p) => p.id);

  it('selecting "Dresses" after "Tops" shows only the dresses', () => {
    const afterTops = nextCategorySelection([], 'Tops');
    expect(afterTops).toEqual(['Tops']);
    expect(shown(afterTops)).toEqual(['top-1']);

    const afterDresses = nextCategorySelection(afterTops, 'Dresses');
    expect(afterDresses).toEqual(['Dresses']);
    expect(shown(afterDresses)).toEqual(['dress-1']);
  });

  it('works in both directions and when returning to a previously selected category', () => {
    let selected: string[] = [];
    for (const [clicked, expected] of [
      ['Dresses', 'dress-1'],
      ['Tops', 'top-1'],
      ['Skirts', 'skirt-1'],
      ['Tops', 'top-1'],
      ['Dresses', 'dress-1'],
    ] as const) {
      selected = nextCategorySelection(selected, clicked);
      expect(selected).toEqual([clicked]);
      expect(shown(selected)).toEqual([expected]);
    }
  });

  it('clicking the selected category again clears the filter (all products shown)', () => {
    const selected = nextCategorySelection(['Tops'], 'Tops');
    expect(selected).toEqual([]);
    expect(shown(selected)).toEqual(['top-1', 'dress-1', 'skirt-1']);
  });

  it('matches the current selection case-insensitively (URL values like ?category=tops)', () => {
    expect(nextCategorySelection(['tops'], 'Tops')).toEqual([]);
    expect(nextCategorySelection(['tops'], 'Dresses')).toEqual(['Dresses']);
  });

  it('an old multi-category link (?cats=Tops,Dresses) collapses to the clicked category', () => {
    expect(nextCategorySelection(['Tops', 'Dresses'], 'Dresses')).toEqual(['Dresses']);
    expect(nextCategorySelection(['Tops', 'Dresses'], 'Skirts')).toEqual(['Skirts']);
  });

  it('does not mutate the current selection', () => {
    const current = ['Tops'];
    nextCategorySelection(current, 'Dresses');
    expect(current).toEqual(['Tops']);
  });
});

describe('filterCatalogProducts — what the online store lists (grid and header search share it)', () => {
  const list = [
    product('shown-in-stock', { name: 'قميص مخمل', category: 'Shirts', stock: 3, sizeStock: { S: 1, M: 2 } }),
    product('hidden-in-stock', { name: 'قميص طويل', category: 'Shirts', stock: 4, visible: false }),
    product('sold-out', { name: 'قميص براشوت', category: 'Shirts', stock: 0, sizeStock: { S: 0, M: 0 } }),
    product('no-visible-field', { name: 'Dress', category: 'Dresses', stock: 2 }),
  ];
  const all = { selectedCats: [] as string[], saleOnly: false, search: '' };

  it('lists only products shown online AND in stock', () => {
    expect(filterCatalogProducts(list, all).map((p) => p.id)).toEqual(['shown-in-stock', 'no-visible-field']);
  });

  it('search never surfaces a hidden or sold-out product', () => {
    expect(filterCatalogProducts(list, { ...all, search: 'قميص' }).map((p) => p.id)).toEqual(['shown-in-stock']);
    expect(filterCatalogProducts(list, { ...all, search: 'قميص مخمل' }).map((p) => p.id)).toEqual(['shown-in-stock']);
    expect(filterCatalogProducts(list, { ...all, search: 'براشوت' })).toEqual([]);
    expect(filterCatalogProducts(list, { ...all, search: 'طويل' })).toEqual([]);
  });

  it('category counts count exactly what the grid lists', async () => {
    const { categoryCountsFromProducts } = await import('../catalogProductList');
    const counts = categoryCountsFromProducts(list);
    expect(counts.get('Shirts')).toBe(filterCatalogProducts(list, { ...all, selectedCats: ['Shirts'] }).length);
    expect(counts.get('Shirts')).toBe(1);
    expect(counts.get('Dresses')).toBe(1);
  });
});
