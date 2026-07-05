import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import AdminOrderDetailModal from '../components/orders/AdminOrderDetailModal';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import { useOrdersList } from '../hooks/useOrdersList';
import { formatOrderDate, formatOrderMoney, shortOrderId } from '../lib/orders';
import { ORDER_STATUSES, type OrderStatus } from '../types/order';
import { cn } from '../lib/utils';

type StatusFilter = 'all' | OrderStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  ...ORDER_STATUSES.map((status) => ({
    key: status as StatusFilter,
    label: status.charAt(0).toUpperCase() + status.slice(1),
  })),
];

const AdminOrders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, refreshing, reload, patchOrder } = useOrdersList('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const highlightId = searchParams.get('order');

  useEffect(() => {
    if (!orders.length) {
      setSelectedId(null);
      return;
    }

    if (highlightId && orders.some((o) => o.id === highlightId)) {
      setSelectedId(highlightId);
      return;
    }

    setSelectedId((prev) => (prev && orders.some((o) => o.id === prev) ? prev : null));
  }, [highlightId, orders]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.userId.toLowerCase().includes(q) ||
        (o.customerEmail?.toLowerCase().includes(q) ?? false) ||
        (o.customerName?.toLowerCase().includes(q) ?? false) ||
        (o.customerPhone?.toLowerCase().includes(q) ?? false) ||
        (o.deliveryAddress?.toLowerCase().includes(q) ?? false)
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

  const selectOrder = (id: string) => {
    setSelectedId(id);
    if (highlightId) {
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    if (highlightId) {
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
  };

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Orders</h1>
            <p className="mt-0.5 text-sm text-gray-500">Track and fulfil customer purchases.</p>
          </div>
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={loading || refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Orders</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.count}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Revenue</dt>
            <dd className="font-medium tabular-nums text-gray-900">{formatOrderMoney(summary.revenue)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Pending</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.pending}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <div className="min-w-0">
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
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                    statusFilter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
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

          <div className="relative mt-0 overflow-hidden rounded-md border border-gray-200 bg-white">
            {refreshing ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-gray-100">
                <div className="h-full w-1/3 animate-pulse bg-catchy/60" />
              </div>
            ) : null}
            {loading && orders.length === 0 ? (
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
                          onClick={() => selectOrder(row.id)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            selectedId === row.id ? 'bg-catchy/5' : 'hover:bg-gray-50/60',
                            highlightId === row.id && 'ring-1 ring-inset ring-catchy/30'
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-900">{shortOrderId(row.id)}</td>
                          <td className="max-w-[12rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">{row.customerName || 'Guest'}</p>
                            <p className="truncate text-xs text-gray-500">{row.customerEmail || row.userId || '—'}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                            {formatOrderDate(row.createdAt)}
                          </td>
                          <td className="px-4 py-2.5">
                            <OrderStatusBadge status={row.status} showDot={false} className="px-2 py-0.5" />
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                            {formatOrderMoney(row.total)}
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
                        onClick={() => selectOrder(row.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                          selectedId === row.id && 'bg-catchy/5'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-900">{shortOrderId(row.id)}</p>
                          <p className="truncate text-xs text-gray-500">
                            {row.customerName || row.customerEmail || 'Guest'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums text-gray-900">
                            {formatOrderMoney(row.total)}
                          </p>
                          <OrderStatusBadge status={row.status} showDot={false} className="mt-1 px-2 py-0.5" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <AdminOrderDetailModal
        open={!!selected}
        order={selected}
        onClose={closeDetail}
        onOrderPatch={patchOrder}
      />
    </div>
  );
};

export default AdminOrders;
