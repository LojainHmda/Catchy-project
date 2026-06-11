import { useCallback, useEffect, useState } from 'react';
import { fetchOrderById } from '../lib/orders';
import type { OrderRecord } from '../types/order';

export function useOrder(orderId: string | undefined) {
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const row = await fetchOrderById(orderId);
      setOrder(row);
      if (!row) setError('not_found');
    } catch (err) {
      console.error('Failed to load order:', err);
      setError('load_failed');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { order, loading, error, reload };
}
