import { db, deleteDoc, doc } from '../../firebase';
import { invalidateCatalogCaches } from '../catalog/catalogService';

/**
 * Permanently deletes a product's Firestore document — the single shared
 * operation used everywhere a product can be deleted (Catalog, Product Detail,
 * and the Admin Products dashboard). Not a visibility/hide toggle: once this
 * resolves, the product is gone from Firestore.
 *
 * Also invalidates the storefront's catalog/coordinates cache (see
 * catalogService.ts) so the deleted product can't keep appearing in the
 * catalog grid, search results, or coordinate sets from a stale snapshot —
 * that cache is time-based, not mutation-aware, so without this the deleted
 * product could linger for minutes (or up to 24h via the localStorage
 * fallback) even after a manual retry.
 */
export async function deleteProductPermanently(productId: string): Promise<void> {
  await deleteDoc(doc(db, 'products', productId));
  invalidateCatalogCaches();
}
