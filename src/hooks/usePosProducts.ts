import { useEffect, useState } from 'react';
import { collection, db, onSnapshot } from '../firebase';
import { toPosProduct, type PosProduct } from '../lib/pos/posProduct';

/**
 * Live product listing for the POS terminal. Unlike the customer catalog (which
 * uses a cached index — see catalogService.ts), the register needs real-time
 * stock visibility while actively selling, so this listens directly. Keeps full
 * color-variant/size data (not just a summary) so tiles can offer inline
 * size/color selection without a second fetch per product.
 */
export function usePosProducts() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        setProducts(snap.docs.map((d) => toPosProduct(d.id, d.data())));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { products, loading };
}
