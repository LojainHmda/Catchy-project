/**
 * Product barcodes are never a separately-generated stored id — a product's
 * printed barcode encodes either an admin-entered value (e.g. a manufacturer
 * code already on the item, stored in `products/{id}.barcode`) or, when none
 * was set, the product's own permanent Firestore document id. Either way the
 * value is derived on demand, so every product has always had a working
 * barcode since the moment it was created, with no backfill/migration.
 */
export function productBarcodeValue(product: { id: string; barcode?: string | null }): string {
  const manual = product.barcode?.trim();
  return manual ? manual : product.id;
}
