import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { db, collection, getDocs, query, orderBy, updateDoc, doc } from '../firebase';
import { cn } from '../lib/utils';

type OrderItem = { name?: string; quantity?: number; price?: number };
type OrderRecord = {
  id: string;
  userId: string;
  customerEmail: string | null;
  customerName: string | null;
  status: string;
  total: number;
  createdAt: Date | null;
  items: OrderItem[];
};

type StatusFilter = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const STATUS_OPTIONS = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') return maybe.toDate();
  }
  if (value instanceof Date) return value;
  return null;
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(n: number): string {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 8).toUpperCase()}` : `#${id}`;
}

function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? 'pending').toLowerCase();
  return STATUS_OPTIONS.includes(s as (typeof STATUS_OPTIONS)[number]) ? s : 'pending';
}

const AdminOrders = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'users')),
      ]);

      const users = new Map<string, { email: string | null; displayName: string | null }>();
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        users.set(d.id, {
          email: (data.email as string) ?? null,
          displayName: (data.displayName as string) ?? null,
        });
      });

      const rows: OrderRecord[] = ordersSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const uid = String(data.userId ?? '');
        const profile = users.get(uid);
        const rawItems = data.items;
        const items = Array.isArray(rawItems)
          ? rawItems.map((it) =>
              typeof it === 'object' && it !== null
                ? {
                    name: (it as OrderItem).name,
                    quantity: Number((it as OrderItem).quantity) || 1,
                    price: Number((it as OrderItem).price) || 0,
                  }
                : { name: String(it), quantity: 1, price: 0 }
            )
          : [];

        return {
          id: docSnap.id,
          userId: uid,
          customerEmail: profile?.email ?? (data.email as string) ?? null,
          customerName: profile?.displayName ?? (data.customerName as string) ?? null,
          status: normalizeStatus(data.status),
          total: Number(data.total) || 0,
          createdAt: toDate(data.createdAt),
          items,
        };
      });

      setOrders(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (error) {
      console.error('Error loading orders:', error);
      try {
        const fallback = await getDocs(collection(db, 'orders'));
        const rows: OrderRecord[] = fallback.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            userId: String(data.userId ?? ''),
            customerEmail: null,
            customerName: null,
            status: normalizeStatus(data.status),
            total: Number(data.total) || 0,
            createdAt: toDate(data.createdAt),
            items: [],
          };
        });
        rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
        setOrders(rows);
        setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
      } catch {
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.userId.toLowerCase().includes(q) ||
        (o.customerEmail?.toLowerCase().includes(q) ?? false) ||
        (o.customerName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [orders, searchTerm, statusFilter]);

  const selected = useMemo(
    () => filtered.find((o) => o.id === selectedId) ?? orders.find((o) => o.id === selectedId) ?? null,
    [filtered, orders, selectedId]
  );

  const summary = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + o.total, 0);
    const pending = orders.filter((o) => o.status === 'pending').length;
    return { count: orders.length, revenue, pending };
  }, [orders]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    orders.forEach((o) => {
      map[o.status] = (map[o.status] ?? 0) + 1;
    });
    return map;
  }, [orders]);

  const updateStatus = async (orderId: string, status: string) => {
    setSavingStatus(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (error) {
      console.error('Failed to update order status:', error);
    } finally {
      setSavingStatus(false);
    }
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Orders</h1>
        <p className="mt-0.5 text-sm text-gray-500">Track and fulfil customer purchases.</p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Orders</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.count}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Revenue</dt>
            <dd className="font-medium tabular-nums text-gray-900">{formatMoney(summary.revenue)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Pending</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.pending}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search order, customer, email…"
                className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                    statusFilter === f.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {f.label}
                  {statusCounts[f.key] != null ? (
                    <span className="ml-1 tabular-nums opacity-70">{statusCounts[f.key]}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-0 overflow-hidden rounded-md border border-gray-200 bg-white">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">No orders match your filters.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="px-4 py-2.5 font-medium">Order</th>
                        <th className="px-4 py-2.5 font-medium">Customer</th>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map((row) => (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedId(row.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selectedId === row.id ? 'bg-gray-50' : 'hover:bg-gray-50/60'
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-900">
                            {shortId(row.id)}
                          </td>
                          <td className="max-w-[12rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">
                              {row.customerName || 'Guest'}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {row.customerEmail || row.userId || '—'}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                            {formatDate(row.createdAt)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-gray-700">
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  row.status === 'delivered'
                                    ? 'bg-gray-900'
                                    : row.status === 'cancelled'
                                      ? 'bg-gray-300'
                                      : row.status === 'pending'
                                        ? 'bg-gray-500'
                                        : 'bg-gray-600'
                                )}
                              />
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                            {formatMoney(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="divide-y divide-gray-100 md:hidden">
                  {filtered.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                          selectedId === row.id && 'bg-gray-50'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-900">{shortId(row.id)}</p>
                          <p className="truncate text-xs text-gray-500">
                            {row.customerName || row.customerEmail || 'Guest'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums text-gray-900">
                            {formatMoney(row.total)}
                          </p>
                          <p className="text-xs capitalize text-gray-500">{row.status}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 border border-gray-200 bg-white lg:w-72 xl:w-80">
          {selected ? (
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <p className="font-mono text-sm font-medium text-gray-900">{shortId(selected.id)}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatDateTime(selected.createdAt)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-gray-900">
                  {formatMoney(selected.total)}
                </p>
              </div>

              <div className="border-b border-gray-100 py-3">
                <p className="text-xs font-medium text-gray-500">Customer</p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {selected.customerName || 'Guest'}
                </p>
                <p className="text-xs text-gray-600">{selected.customerEmail || selected.userId}</p>
              </div>

              <div className="border-b border-gray-100 py-3">
                <label htmlFor="order-status" className="text-xs font-medium text-gray-500">
                  Status
                </label>
                <select
                  id="order-status"
                  value={selected.status}
                  disabled={savingStatus}
                  onChange={(e) => updateStatus(selected.id, e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none focus:border-gray-400"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3">
                <p className="text-xs font-medium text-gray-500">Line items</p>
                {selected.items.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {selected.items.map((item, i) => (
                      <li
                        key={`${item.name}-${i}`}
                        className="flex justify-between gap-2 text-xs text-gray-700"
                      >
                        <span className="min-w-0 truncate">
                          {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ''}
                          {item.name || 'Item'}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-900">
                          {formatMoney((item.price ?? 0) * (item.quantity ?? 1))}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No line items recorded.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-500">Select an order to view details.</p>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AdminOrders;
