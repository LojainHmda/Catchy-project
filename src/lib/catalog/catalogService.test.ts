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

import { orderBy, limit, collection } from '../../firebase';
import { readCache, writeCache } from '../asyncResource';
import { catalogIndexQuery, invalidateCatalogCaches } from './catalogService';

const INDEX_KEY = 'catalog:index';
const COORDINATES_KEY = 'catalog:coordinates';
const INDEX_LOCAL_KEY = 'catchy.catalog.index.v7';
const TTL = 10 * 60 * 1000; // generous — these tests only care whether the entry exists at all

describe('catalogIndexQuery — the Catalog grid / Search source query', () => {
  it('REGRESSION: orders by createdAt desc server-side, not just client-side — a bare limit() with no orderBy would use an arbitrary document order, risking a brand-new product falling outside the limit() window once the catalog grows past it', () => {
    vi.mocked(collection).mockReturnValue('products-collection-ref' as never);
    vi.mocked(orderBy).mockReturnValue('orderBy-constraint' as never);
    vi.mocked(limit).mockReturnValue('limit-constraint' as never);
    vi.mocked(orderBy).mockClear();
    vi.mocked(limit).mockClear();

    catalogIndexQuery();

    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(80);
  });
});

describe('invalidateCatalogCaches', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears the in-memory catalog index cache so the next read is a real miss', () => {
    writeCache(INDEX_KEY, { products: [{ id: 'deleted-product' }], counts: new Map(), complete: true });
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
      JSON.stringify({ products: [{ id: 'deleted-product' }], counts: {}, complete: true, at: Date.now() })
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
