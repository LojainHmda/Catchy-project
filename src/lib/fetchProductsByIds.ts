import { collection, db, documentId, getDocs, query, where } from '../firebase';
import { toCatalogListProduct, type CatalogListProduct } from './catalogProductList';
import { coerceProductImages, isUsableImageSrc } from './productImages';
import { resolveProductInventory } from './productInventory';

const CHUNK = 30;

function toCoordinateLinkedProduct(id: string, data: Record<string, unknown>): CatalogListProduct {
  const base = toCatalogListProduct(id, data);
  const { sizeStock, stock } = resolveProductInventory(data);
  const images = coerceProductImages(data).filter((u): u is string => isUsableImageSrc(u));
  return {
    ...base,
    images: images.length > 0 ? images : base.images,
    stock,
    ...(Object.keys(sizeStock).length > 0 ? { sizeStock } : {}),
  };
}

/** Batch-fetch product rows for coordinate sets (inventory + photos required for catalog visibility). */
export async function fetchProductsByIds(ids: string[]): Promise<Record<string, CatalogListProduct>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const result: Record<string, CatalogListProduct> = {};

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const snap = await getDocs(
      query(collection(db, 'products'), where(documentId(), 'in', chunk))
    );
    snap.docs.forEach((d) => {
      result[d.id] = toCoordinateLinkedProduct(d.id, d.data() as Record<string, unknown>);
    });
  }

  return result;
}
