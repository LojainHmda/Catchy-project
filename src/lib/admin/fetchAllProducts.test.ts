import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase', () => ({
  db: {},
  collection: vi.fn(() => 'products-collection-ref'),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));

import { collection, getDocs, limit, orderBy, query, startAfter } from '../../firebase';
import { fetchAllProducts } from './fetchAllProducts';

describe('fetchAllProducts — Admin → Products and the Hero picker', () => {
  it('REGRESSION: reads the whole collection (no page size, no limit, no orderBy) and sorts newest first', async () => {
    const at = (iso: string) => ({ toDate: () => new Date(iso) });
    const docs = [
      ...Array.from({ length: 128 }, (_, i) => ({
        id: `p${i}`,
        data: () => ({ name: i === 85 ? 'قميص مخمل' : `P${i}`, createdAt: at(new Date(Date.UTC(2026, 5, 1) + (128 - i) * 3_600_000).toISOString()) }),
      })),
      { id: 'undated', data: () => ({ name: 'No date' }) },
    ].reverse();
    vi.mocked(getDocs).mockResolvedValueOnce({ docs } as never);

    const products = await fetchAllProducts();

    expect(collection).toHaveBeenCalledWith({}, 'products');
    expect(getDocs).toHaveBeenCalledWith('products-collection-ref');
    for (const fn of [query, orderBy, limit, startAfter]) expect(fn).not.toHaveBeenCalled();
    expect(products).toHaveLength(129);
    expect(products[0].id).toBe('p0');
    expect(products[85]).toMatchObject({ id: 'p85', name: 'قميص مخمل' });
    expect(products[128].id).toBe('undated');
  });
});
