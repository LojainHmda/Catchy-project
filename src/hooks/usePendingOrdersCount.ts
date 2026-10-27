import { useEffect, useState } from 'react';
import { collection, db, onSnapshot, query, where } from '../firebase';

/**
 * Live count of pending orders for the admin nav badge and dashboard.
 * Single-field equality query → served by Firestore's automatic index (no new
 * index). Returns null while loading or when the listener is not permitted
 * (orders are owner-readable only), so callers simply hide the badge.
 */
export function usePendingOrdersCount(enabled = true): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, 'orders'), where('status', '==', 'pending')),
      (snap) => setCount(snap.size),
      (error) => {
        console.warn('Pending orders badge unavailable:', error?.code || error);
        setCount(null);
      }
    );
    return () => unsubscribe();
  }, [enabled]);

  return count;
}
