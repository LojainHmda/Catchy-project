import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import AdminOrderDetailModal from '../components/orders/AdminOrderDetailModal';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import OrderSourceBadge from '../components/orders/OrderSourceBadge';
import { useOrdersList } from '../hooks/useOrdersList';
import { formatOrderDate, formatOrderMoney, shortOrderId, sumOrderRevenue } from '../lib/orders';
import { ORDER_STATUSES, type OrderStatus } from '../types/order';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

type StatusFilter = 'all' | OrderStatus;
type SourceFilter = 'all' | 'web' | 'pos';

/** labelKey, not label — resolved via t() at render time so the admin language switch applies. */
const STATUS_FILTERS: { key: StatusFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'cat.all' },
  ...ORDER_STATUSES.map((status) => ({
    key: status as StatusFilter,
    labelKey: `orders.status.${status}`,
  })),
];

const SOURCE_FILTERS: { key: SourceFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'admin.orders.page.sourceAll' },
  { key: 'web', labelKey: 'admin.orders.sourceWeb' },
  { key: 'pos', labelKey: 'admin.orders.sourcePos' },
];

const AdminOrders = () => {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, refreshing, reload, patchOrder } = useOrdersList('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
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
      if (sourceFilter !== 'all' && (o.source ?? 'web') !== sourceFilter) return false;
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
  }, [orders, searchTerm, statusFilter, sourceFilter]);

  const selected = useMemo(
    () => filtered.find((o) => o.id === selectedId) ?? orders.find((o) => o.id === selectedId) ?? null,
    [filtered, orders, selectedId]
  );

  const summary = useMemo(() => {
    // Cancelled orders stay in the list/counts below (full order history), but
    // never count toward revenue — a cancelled web order was never fulfilled
    // or paid, and a cancelled POS sale has had its stock restored and is
    // void. See sumOrderRevenue.
    const revenue = sumOrderRevenue(orders);
    const pending = orders.filter((o) => o.status === 'pending').length;
    const webOrders = orders.filter((o) => (o.source ?? 'web') === 'web');
    const posOrders = orders.filter((o) => o.source === 'pos');
    return {
      count: orders.length,
      revenue,
      pending,
      web: { count: webOrders.length, revenue: sumOrderRevenue(webOrders) },
      pos: { count: posOrders.length, revenue: sumOrderRevenue(posOrders) },
    };
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
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{t('admin.nav.orders')}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('admin.orders.page.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={loading || refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            {t('admin.common.refresh')}
          </button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.nav.orders')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.count}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.orders.page.statRevenue')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{formatOrderMoney(summary.revenue)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('orders.status.pending')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.pending}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.orders.page.statWebRevenue')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">
              {formatOrderMoney(summary.web.revenue)} <span className="text-gray-400">({summary.web.count})</span>
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.orders.page.statPosRevenue')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">
              {formatOrderMoney(summary.pos.revenue)} <span className="text-gray-400">({summary.pos.count})</span>
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('admin.orders.page.searchPlaceholder')}
                className="h-9 w-full rounded-md border border-gray-200 bg-white ps-9 pe-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {SOURCE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSourceFilter(f.key)}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                    sourceFilter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {t(f.labelKey)}
                </button>
              ))}
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
                  {t(f.labelKey)}
                  {statusCounts[f.key] != null ? (
                    <span className="ms-1 tabular-nums opacity-70">{statusCounts[f.key]}</span>
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
                {t('admin.common.loading')}
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">{t('admin.orders.page.noMatch')}</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-start text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="px-4 py-2.5 font-medium">{t('admin.orders.page.colOrder')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('admin.orders.page.colSource')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('admin.orders.detail.customer')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('admin.common.date')}</th>
                        <th className="px-4 py-2.5 font-medium">{t('admin.common.status')}</th>
                        <th className="px-4 py-2.5 text-end font-medium">{t('admin.common.total')}</th>
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
                          <td className="px-4 py-2.5">
                            <OrderSourceBadge source={row.source} className="px-2 py-0.5" />
                          </td>
                          <td className="max-w-[12rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">{row.customerName || t('admin.orders.detail.guest')}</p>
                            <p className="truncate text-xs text-gray-500">{row.customerEmail || row.userId || '—'}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                            {formatOrderDate(row.createdAt, language === 'ar' ? 'ar' : 'en-GB')}
                          </td>
                          <td className="px-4 py-2.5">
                            <OrderStatusBadge status={row.status} showDot={false} className="px-2 py-0.5" />
                          </td>
                          <td className="px-4 py-2.5 text-end font-medium tabular-nums text-gray-900">
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
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-start',
                          selectedId === row.id && 'bg-catchy/5'
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-mono text-xs text-gray-900">{shortOrderId(row.id)}</p>
                            <OrderSourceBadge source={row.source} className="px-1.5 py-0" />
                          </div>
                          <p className="truncate text-xs text-gray-500">
                            {row.customerName || row.customerEmail || t('admin.orders.detail.guest')}
                          </p>
                        </div>
                        <div className="shrink-0 text-end">
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
