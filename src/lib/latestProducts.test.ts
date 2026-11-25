import { describe, it, expect, vi } from 'vitest';
import type { CatalogListProduct } from './catalogProductList';

const fx = vi.hoisted(() => ({ products: [] as unknown[] }));
vi.mock('./catalog/catalogService', () => ({
  loadCatalogIndex: vi.fn(async () => ({ products: fx.products, counts: new Map() })),
}));

import { fetchLatestProducts, latestSellableProducts, LATEST_PRODUCTS_COUNT } from './latestProducts';
import { loadCatalogIndex } from './catalog/catalogService';

const item = (i: number, overrides: Partial<CatalogListProduct> = {}): CatalogListProduct => ({
  id: `p${i}`,
  name: `Product ${i}`,
  price: 100,
  images: [],
  colorCount: 0,
  visible: true,
  stock: 2,
  createdAt: 1_000_000 - i, // p0 newest
  ...overrides,
});

describe('home page "Latest Arrivals"', () => {
  it('shows the newest products that are shown online and in stock', () => {
    const list = [item(0, { visible: false }), item(1, { stock: 0 }), item(2), item(3), item(4)];
    expect(latestSellableProducts(list, 2).map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('REGRESSION: stays full even when more than the old 40-product window is hidden or sold out', () => {
    // The 50 newest are sold out; the section must still find 10 sellable ones further back.
    const list = Array.from({ length: 120 }, (_, i) => item(i, i < 50 ? { stock: 0 } : {}));
    const latest = latestSellableProducts(list);
    expect(latest).toHaveLength(LATEST_PRODUCTS_COUNT);
    expect(latest[0].id).toBe('p50');
  });

  it('reads the same complete index as the catalog and search (no separate limited query)', async () => {
    fx.products = [item(5), item(1), item(3, { visible: false })];
    const latest = await fetchLatestProducts();
    expect(loadCatalogIndex).toHaveBeenCalled();
    expect(latest.map((p) => p.id)).toEqual(['p1', 'p5']);
  });
});
