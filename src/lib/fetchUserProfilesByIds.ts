import { collection, db, documentId, getDocs, query, where } from '../firebase';

const CHUNK = 30;

export type UserProfileLite = { email: string | null; displayName: string | null };

/** Batch-fetch only the user profiles actually referenced (e.g. by a page of orders), instead of the whole `users` collection. */
export async function fetchUserProfilesByIds(ids: string[]): Promise<Map<string, UserProfileLite>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, UserProfileLite>();

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    snap.docs.forEach((d) => {
      const data = d.data();
      result.set(d.id, {
        email: (data.email as string) ?? null,
        displayName: (data.displayName as string) ?? null,
      });
    });
  }

  return result;
}
