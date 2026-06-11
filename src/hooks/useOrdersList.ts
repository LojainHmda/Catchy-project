import { useCallback, useEffect, useRef, useState } from 'react';
import { db, collection, getDocs } from '../firebase';
import { fetchAllOrders, fetchOrdersForUser } from '../lib/orders';
import type { OrderRecord } from '../types/order';

type OrdersListScope = 'admin' | 'user';

export function useOrdersList(scope: OrdersListScope | null, userId?: string | null) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const reload = useCallback(
    async (background = false) => {
      if (!scope) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (scope === 'user' && !userId) {
        setOrders([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (background && hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        if (scope === 'user' && userId) {
          setOrders(await fetchOrdersForUser(userId));
          hasLoadedRef.current = true;
          return;
        }

        const [ordersRows, usersSnap] = await Promise.all([
          fetchAllOrders(),
          getDocs(collection(db, 'users')),
        ]);

        const profiles = new Map<string, { email: string | null; displayName: string | null }>();
        usersSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          profiles.set(docSnap.id, {
            email: (data.email as string) ?? null,
            displayName: (data.displayName as string) ?? null,
          });
        });

        setOrders(
          ordersRows.map((order) => {
            const profile = profiles.get(order.userId);
            if (!profile) return order;
            return {
              ...order,
              customerEmail: profile.email ?? order.customerEmail,
              customerName: profile.displayName ?? order.customerName,
            };
          })
        );
        hasLoadedRef.current = true;
      } catch (err) {
        console.error('Failed to load orders:', err);
        setError('load_failed');
        if (!hasLoadedRef.current) setOrders([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scope, userId]
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    reload(false);
  }, [reload]);

  const patchOrder = useCallback((orderId: string, patch: Partial<OrderRecord>) => {
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
  }, []);

  return { orders, loading, refreshing, error, reload, patchOrder };
}
