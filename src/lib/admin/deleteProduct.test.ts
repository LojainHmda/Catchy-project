import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above this file's other top-level code, so the
// mock functions they reference must be created via vi.hoisted() rather than
// plain `const` — otherwise they'd be accessed before initialization.
const { deleteDocMock, docMock, invalidateCatalogCachesMock } = vi.hoisted(() => ({
  deleteDocMock: vi.fn().mockResolvedValue(undefined),
  docMock: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  invalidateCatalogCachesMock: vi.fn(),
}));

vi.mock('../../firebase', () => ({
  db: {},
  deleteDoc: deleteDocMock,
  doc: docMock,
}));

vi.mock('../catalog/catalogService', () => ({
  invalidateCatalogCaches: invalidateCatalogCachesMock,
}));

import { deleteProductPermanently } from './deleteProduct';

describe('deleteProductPermanently', () => {
  beforeEach(() => {
    deleteDocMock.mockClear();
    docMock.mockClear();
    invalidateCatalogCachesMock.mockClear();
  });

  it('deletes the product document by id', async () => {
    await deleteProductPermanently('product-123');

    expect(docMock).toHaveBeenCalledWith({}, 'products', 'product-123');
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: invalidates the catalog cache after a successful delete — this is the fix for the stale-product bug, and it must apply no matter which page the delete was triggered from (Catalog, Product Detail, or Admin Products all call this same function)', async () => {
    await deleteProductPermanently('product-123');

    expect(invalidateCatalogCachesMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate the cache if the Firestore delete itself fails — nothing was actually removed, so the cache is still correct', async () => {
    deleteDocMock.mockRejectedValueOnce(new Error('permission denied'));

    await expect(deleteProductPermanently('product-123')).rejects.toThrow('permission denied');
    expect(invalidateCatalogCachesMock).not.toHaveBeenCalled();
  });
});
