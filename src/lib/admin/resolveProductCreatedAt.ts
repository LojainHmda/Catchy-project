/**
 * The value to write for a product's `createdAt` on save. New products get a fresh
 * server timestamp; editing an existing product must always keep its original
 * value — otherwise saving an edit would push the product to the top of every
 * newest-first listing as if it were brand new.
 *
 * A legacy product with no `createdAt` at all (shouldn't exist today — every
 * current product has one — but safe to handle) gets one assigned on its first
 * edit, rather than writing `undefined` (which Firestore rejects) or leaving the
 * field permanently missing.
 */
export function resolveProductCreatedAt<T>(
  existingProduct: { createdAt?: T } | null | undefined,
  createTimestamp: () => T
): T {
  if (existingProduct && existingProduct.createdAt != null) return existingProduct.createdAt;
  return createTimestamp();
}
