import { useEffect, useState } from 'react';
import { collection, db, onSnapshot, query, where } from '../firebase';

/**
 * Live count of returns still on the shelf (quarantine or needs_repair) for the
 * admin nav badge. Single-field `in` query → Firestore's automatic index. Returns
 * null while loading or when not permitted (returns are owner-readable only).
 */
export function useOpenReturnsCount(enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, 'returns'), where('status', 'in', ['quarantine', 'needs_repair'])),
      (snap) => setCount(snap.size),
      (error) => {
        console.warn('Returns badge unavailable:', error?.code || error);
        setCount(null);
      }
    );
    return () => unsubscribe();
  }, [enabled]);

  return count;
}
