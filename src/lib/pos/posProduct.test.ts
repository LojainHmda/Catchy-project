import { describe, it, expect } from 'vitest';
import {
  filterPosSellable,
  posCategoryCount,
  resolvePosBarcodeScan,
  sortPosProductsNewestFirst,
  type PosProduct,
} from './posProduct';

function product(id: string, createdAt?: number): PosProduct {
  return {
    id,
    name: id,
    price: 100,
    onSale: false,
    visible: true,
    createdAt,
    images: [],
    stock: 5,
    sizeStock: {},
    colorVariants: [],
  };
}

describe('sortPosProductsNewestFirst — POS terminal grid ordering', () => {
  it('orders products newest first by createdAt', () => {
    const products = [product('oldest', 1000), product('newest', 3000), product('middle', 2000)];

    const sorted = sortPosProductsNewestFirst(products);

    expect(sorted.map((p) => p.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('LEGACY: a product with no createdAt sorts to the end, without crashing or being dropped', () => {
    const products = [product('has-timestamp', 1000), product('legacy-no-timestamp')];

    const sorted = sortPosProductsNewestFirst(products);

    expect(sorted).toHaveLength(2);
    expect(sorted.map((p) => p.id)).toEqual(['has-timestamp', 'legacy-no-timestamp']);
  });

  it('does not mutate the input array (the cashier-facing grid re-renders from the same source list)', () => {
    const products = [product('a', 1), product('b', 2)];
    const original = [...products];

    sortPosProductsNewestFirst(products);

    expect(products).toEqual(original);
  });
});

describe('filterPosSellable — what the register offers', () => {
  const list: PosProduct[] = [
    { ...product('in-stock'), category: 'Shirts' },
    { ...product('hidden-online-in-stock'), category: 'Shirts', visible: false },
    { ...product('sold-out'), category: 'Shirts', stock: 0 },
    { ...product('sold-out-sizes'), category: 'Shirts', stock: 0, sizeStock: { S: 0, M: 0 } },
    { ...product('hidden-and-sold-out'), category: 'Shirts', stock: 0, visible: false },
  ];

  it('keeps every in-stock product — including ones hidden from the online store — and drops sold-out ones', () => {
    expect(filterPosSellable(list).map((p) => p.id)).toEqual(['in-stock', 'hidden-online-in-stock']);
  });

  it('category counts follow the same rule', () => {
    expect(posCategoryCount(list, { kind: 'category', id: 'Shirts' })).toBe(2);
    expect(posCategoryCount(list, { kind: 'all' })).toBe(2);
  });
});

describe('resolvePosBarcodeScan', () => {
  const list: PosProduct[] = [
    { ...product('a'), barcode: '111' },
    { ...product('b-sold-out'), barcode: '222', stock: 0 },
    { ...product('c-sold-out'), barcode: '333', stock: 0 },
    { ...product('c-in-stock'), barcode: '333' },
    { ...product('hidden-online'), barcode: '444', visible: false },
  ];

  it('opens an in-stock match (by barcode or by product id)', () => {
    expect(resolvePosBarcodeScan(list, '111')).toEqual({ kind: 'open', productId: 'a' });
    expect(resolvePosBarcodeScan(list, 'a')).toEqual({ kind: 'open', productId: 'a' });
  });

  it('opens a product hidden from the online store when it has stock', () => {
    expect(resolvePosBarcodeScan(list, '444')).toEqual({ kind: 'open', productId: 'hidden-online' });
  });

  it('says "out of stock" for a sold-out product instead of a search that finds nothing', () => {
    expect(resolvePosBarcodeScan(list, '222')).toEqual({ kind: 'outOfStock', name: 'b-sold-out' });
  });

  it('prefers an in-stock product when two share a barcode', () => {
    expect(resolvePosBarcodeScan(list, '333')).toEqual({ kind: 'open', productId: 'c-in-stock' });
  });

  it('falls back to the search box for an unknown code', () => {
    expect(resolvePosBarcodeScan(list, '999')).toEqual({ kind: 'search' });
  });
});
