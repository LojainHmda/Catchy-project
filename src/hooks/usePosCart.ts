import { useCallback, useMemo, useState } from 'react';
import { cartLineKey } from '../lib/productInventory';
import type { PosCartItem } from '../types/pos';

export function usePosCart() {
  const [items, setItems] = useState<PosCartItem[]>([]);

  const addItem = useCallback((item: Omit<PosCartItem, 'lineKey'>) => {
    const lineKey = cartLineKey(item.productId, item.size, item.colorId);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.lineKey === lineKey);
      if (idx >= 0) {
        const existing = prev[idx]!;
        const nextQty = Math.min(existing.availableStock, existing.quantity + item.quantity);
        return prev.map((i, index) => (index === idx ? { ...i, quantity: nextQty } : i));
      }
      return [...prev, { ...item, lineKey, quantity: Math.min(item.availableStock, Math.max(1, item.quantity)) }];
    });
  }, []);

  const changeQty = useCallback((lineKey: string, nextQty: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.lineKey === lineKey ? { ...i, quantity: Math.max(0, Math.min(i.availableStock, nextQty)) } : i
        )
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((prev) => prev.filter((i) => i.lineKey !== lineKey));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  return { items, addItem, changeQty, removeItem, clear, subtotal, itemCount };
}
