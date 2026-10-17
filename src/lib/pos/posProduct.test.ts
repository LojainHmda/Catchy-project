import { describe, it, expect } from 'vitest';
import { sortPosProductsNewestFirst, type PosProduct } from './posProduct';

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
