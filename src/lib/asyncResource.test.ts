import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invalidateCache, loadResource, readCache, writeCache } from './asyncResource';

const KEY = 'test:resource';
const TTL = 1000;

describe('asyncResource cache', () => {
  beforeEach(() => {
    // Each test gets a clean slate — the store is module-level (shared across callers
    // by design, same as in the app), so stale entries from one test must not leak
    // into the next.
    invalidateCache(KEY);
  });

  it('readCache returns null when nothing has been written yet', () => {
    expect(readCache(KEY, TTL)).toBeNull();
  });

  it('readCache returns the value while within the TTL window', () => {
    writeCache(KEY, { products: ['a'] });
    expect(readCache<{ products: string[] }>(KEY, TTL)).toEqual({ products: ['a'] });
  });

  it('readCache returns null once the TTL has elapsed', () => {
    vi.useFakeTimers();
    try {
      writeCache(KEY, 'value');
      vi.advanceTimersByTime(TTL + 1);
      expect(readCache(KEY, TTL)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('loadResource serves the fresh cache without re-invoking the loader (the exact mechanism the bug relies on)', async () => {
    const loader = vi.fn().mockResolvedValue({ products: ['original'] });
    const first = await loadResource(KEY, TTL, loader);
    const second = await loadResource(KEY, TTL, loader);

    expect(first).toEqual({ products: ['original'] });
    expect(second).toEqual({ products: ['original'] });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: after invalidateCache, loadResource re-fetches instead of returning the stale snapshot — this is what a product delete must trigger', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ products: ['stale-product', 'other'] })
      .mockResolvedValueOnce({ products: ['other'] });

    const beforeDelete = await loadResource<{ products: string[] }>(KEY, TTL, loader);
    expect(beforeDelete).toEqual({ products: ['stale-product', 'other'] });

    // Without this call (what deleteProductPermanently now does via
    // invalidateCatalogCaches), the next loadResource call within the TTL window
    // would short-circuit on the fresh-cache check and return the deleted product
    // again — reproducing the reported bug exactly.
    invalidateCache(KEY);

    const afterDelete = await loadResource<{ products: string[] }>(KEY, TTL, loader);
    expect(afterDelete).toEqual({ products: ['other'] });
    expect(afterDelete.products).not.toContain('stale-product');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('without invalidation, a "retry" within the TTL window reproduces the original bug (documents the bug for contrast)', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ products: ['stale-product'] })
      .mockResolvedValueOnce({ products: [] });

    await loadResource<{ products: string[] }>(KEY, TTL, loader);
    // Simulates clicking "retry" right after a delete with no cache invalidation —
    // this is the Catalog page's old retryLoad() behavior.
    const retried = await loadResource<{ products: string[] }>(KEY, TTL, loader);

    expect(retried.products).toContain('stale-product');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
