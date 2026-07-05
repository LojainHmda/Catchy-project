import { useEffect, useMemo, useState } from 'react';
import {
  peekStoreCategories,
  subscribeStoreCategories,
  type StoreCategory,
} from '../lib/categoriesService';

/** Live storefront categories (shared Firestore subscription). */
export function useStoreCategories() {
  const [categories, setCategories] = useState<StoreCategory[]>(() => peekStoreCategories());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeStoreCategories((cats) => {
      setCategories(cats);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories]
  );
  const visibleCategories = useMemo(() => sorted.filter((c) => !c.hidden), [sorted]);

  return { categories: sorted, visibleCategories, loading };
}
