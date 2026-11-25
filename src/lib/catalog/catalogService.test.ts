import { describe, it, expect, beforeEach, vi } from 'vitest';

// catalogService.ts (and the coordinatesService/fetchProductsByIds modules it pulls
// in) import `db` and friends from src/firebase.ts, which eagerly calls
// initializeApp() and throws without real Firebase env vars. Stub it so this test
// never touches real Firebase/network — invalidateCatalogCaches() itself only
// touches the in-memory cache and localStorage, so none of these need to behave
// like the real SDK.
vi.mock('../../firebase', () => ({
  db: {},
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromCache: vi.fn(),
  getDocsFromServer: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  documentId: vi.fn(),
}));

import { orderBy, limit, query, collection, getDocs, getDocsFromCache, getDocsFromServer } from '../../firebase';
import { readCache, writeCache } from '../asyncResource';
import {
  catalogIndexQuery,
  invalidateCatalogCaches,
  loadCatalogIndex,
  peekCatalogIndex,
  peekCatalogIndexFallback,
} from './catalogService';

const INDEX_KEY = 'catalog:index';
const COORDINATES_KEY = 'catalog:coordinates';
const INDEX_LOCAL_KEY = 'catchy.catalog.index.v8';
const TTL = 10 * 60 * 1000; // generous — these tests only care whether the entry exists at all

describe('catalogIndexQuery — the source of the store grid, search, category counts, home page and order picker', () => {
  it('REGRESSION: reads EVERY product — no limit() (the store used to stop at the newest 80, so older in-stock products such as "قميص مخمل" never appeared online) and no orderBy (Firestore would silently drop products without createdAt)', () => {
    vi.mocked(collection).mockReturnValue('products-collection-ref' as never);
    vi.mocked(collection).mockClear();
    vi.mocked(orderBy).mockClear();
    vi.mocked(limit).mockClear();
    vi.mocked(query).mockClear();

    expect(catalogIndexQuery()).toBe('products-collection-ref');

    expect(collection).toHaveBeenCalledWith({}, 'products');
    expect(limit).not.toHaveBeenCalled();
    expect(orderBy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('invalidateCatalogCaches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears the in-memory catalog index cache so the next read is a real miss', () => {
    writeCache(INDEX_KEY, { products: [{ id: 'deleted-product' }], counts: new Map() });
    expect(readCache(INDEX_KEY, TTL)).not.toBeNull();

    invalidateCatalogCaches();

    expect(readCache(INDEX_KEY, TTL)).toBeNull();
  });

  it('clears the in-memory coordinates/linked-products cache', () => {
    writeCache(COORDINATES_KEY, { looks: [], linkedById: { 'deleted-product': {} } });
    expect(readCache(COORDINATES_KEY, TTL)).not.toBeNull();

    invalidateCatalogCaches();

    expect(readCache(COORDINATES_KEY, TTL)).toBeNull();
  });

  it('REGRESSION: clears the localStorage snapshot too, so a hard refresh cannot resurrect the deleted product via the up-to-24h stale fallback', () => {
    localStorage.setItem(
      INDEX_LOCAL_KEY,
      JSON.stringify({ products: [{ id: 'deleted-product' }], counts: {}, at: Date.now() })
    );
    expect(localStorage.getItem(INDEX_LOCAL_KEY)).not.toBeNull();

    invalidateCatalogCaches();

    expect(localStorage.getItem(INDEX_LOCAL_KEY)).toBeNull();
  });

  it('does not throw when localStorage is unavailable (private mode / quota)', () => {
    const original = globalThis.localStorage;
    delete (globalThis as { localStorage?: Storage }).localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });

    expect(() => invalidateCatalogCaches()).not.toThrow();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: original,
      writable: true,
    });
  });
});

// The product list must not come from a cache that can be out of date: a product the
// owner just added or edited has to show on the next view. Saved copies are an
// emergency fallback only (server slow/unreachable).
describe('loadCatalogIndex — always from the server', () => {
  const serverSnap = (ids: string[]) => ({ docs: ids.map((id) => ({ id, data: () => ({ name: id, price: 10 }) })) });

  beforeEach(() => {
    localStorage.clear();
    invalidateCatalogCaches();
    vi.mocked(getDocsFromServer).mockReset();
    vi.mocked(getDocsFromCache).mockReset();
    vi.mocked(getDocs).mockReset();
    vi.useRealTimers();
  });

  it('asks the server, never the SDK local cache', async () => {
    vi.mocked(getDocsFromServer).mockResolvedValueOnce(serverSnap(['a', 'b']) as never);
    const index = await loadCatalogIndex();
    expect(index.products.map((p) => p.id)).toEqual(['a', 'b']);
    expect(getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(getDocsFromCache).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('reuses a result only for a few seconds; after that a newly added product shows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.mocked(getDocsFromServer)
      .mockResolvedValueOnce(serverSnap(['a']) as never)
      .mockResolvedValueOnce(serverSnap(['new-product', 'a']) as never);
    await loadCatalogIndex();
    expect((await loadCatalogIndex()).products.map((p) => p.id)).toEqual(['a']); // same moment: shared
    expect(getDocsFromServer).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 11_000);
    expect(peekCatalogIndex()).toBeNull();
    expect((await loadCatalogIndex()).products.map((p) => p.id)).toEqual(['new-product', 'a']);
    expect(getDocsFromServer).toHaveBeenCalledTimes(2);
  });

  it('REGRESSION: keeps every product — 130, well past the old cap of 80 — newest first; undated products last, never dropped', async () => {
    const base = Date.UTC(2026, 9, 1);
    const docs = Array.from({ length: 130 }, (_, i) => ({
      id: `p${i}`,
      data: () => ({
        name: i === 85 ? 'قميص مخمل' : `Product ${i}`,
        price: 100,
        stock: 3,
        visible: true,
        createdAt: { toDate: () => new Date(base + (130 - i) * 60_000) }, // p0 newest … p129 oldest
      }),
    }));
    const undated = { id: 'undated', data: () => ({ name: 'Undated', price: 50, stock: 2 }) };
    // Server order is arbitrary (document id) — the newest-first order must not depend on it.
    vi.mocked(getDocsFromServer).mockResolvedValueOnce({ docs: [undated, ...docs].reverse() } as never);

    const index = await loadCatalogIndex();

    expect(index.products).toHaveLength(131);
    expect(index.products[0].id).toBe('p0');
    expect(index.products[85]).toMatchObject({ id: 'p85', name: 'قميص مخمل' }); // position 86, as in production
    expect(index.products[129].id).toBe('p129');
    expect(index.products[130].id).toBe('undated');
    expect(index).not.toHaveProperty('complete');
  });

  it('the saved copy is kept only as an emergency fallback (and refreshed by every server load)', async () => {
    vi.mocked(getDocsFromServer).mockResolvedValueOnce(serverSnap(['a', 'b']) as never);
    await loadCatalogIndex();
    invalidateCache_inMemoryOnly();
    expect(peekCatalogIndex()).toBeNull(); // not shown as current
    expect(peekCatalogIndexFallback()?.products.map((p) => p.id)).toEqual(['a', 'b']); // available if the server fails

    vi.mocked(getDocsFromServer).mockRejectedValueOnce(new Error('unavailable'));
    await expect(loadCatalogIndex()).rejects.toThrow('unavailable');
  });
});

function invalidateCache_inMemoryOnly() {
  // Simulates a later visit: the in-memory copy is gone, the browser-saved copy remains.
  const saved = localStorage.getItem(INDEX_LOCAL_KEY);
  invalidateCatalogCaches();
  if (saved) localStorage.setItem(INDEX_LOCAL_KEY, saved);
}

