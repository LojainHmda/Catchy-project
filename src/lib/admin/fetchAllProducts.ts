import { collection, db, getDocs } from '../../firebase';
import { createdAtMillis, sortNewestFirst } from '../productAvailability';

/** Admin screens read product docs loosely typed (as they always have). */
export type AdminProductDoc = { id: string } & Record<string, any>;

/** Newest first; products without a creation time go last (never dropped). */
export function sortProductDocsNewestFirst<T extends Record<string, unknown>>(docs: readonly T[]): T[] {
  return sortNewestFirst(docs, (p) => createdAtMillis(p.createdAt));
}

/**
 * EVERY product document, newest first — for admin screens whose search, filters and totals
 * must cover the whole catalog (Admin → Products, the Hero product picker). The query has no
 * limit() (older products would be missing) and no orderBy('createdAt') (Firestore would leave
 * out any product without that field). Admin keeps sold-out and hidden products listed.
 */
export async function fetchAllProducts(): Promise<AdminProductDoc[]> {
  const snap = await getDocs(collection(db, 'products'));
  return sortProductDocsNewestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AdminProductDoc));
}
