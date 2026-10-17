import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import { useOrdersList } from '../hooks/useOrdersList';
import { formatOrderDate, formatOrderMoney } from '../lib/orders';
import {
  aggregateOrderCustomers,
  shippingZoneLabel,
  zoneOrderCounts,
  type OrderCustomerSummary,
} from '../lib/orders/orderCustomerSummary';
import { SHIPPING_ZONES } from '../lib/shippingZones';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';

type ZoneFilter = 'all' | string;
type StatusFilter = 'all' | 'new' | 'in_progress' | 'shipped';

const STATUS_FILTERS: { key: StatusFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'cat.all' },
  { key: 'new', labelKey: 'admin.customers.statusNew' },
  { key: 'in_progress', labelKey: 'admin.customers.statusInProgress' },
  { key: 'shipped', labelKey: 'orders.status.shipped' },
];

function StatusCountBadge({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: 'new' | 'progress' | 'shipped';
}) {
  if (!count) {
    return (
      <span className="inline-flex min-w-[2rem] justify-center text-xs tabular-nums text-gray-300" title={label}>
        —
      </span>
    );
  }

  const toneClass = {
    new: 'bg-orange-50 text-orange-800 ring-orange-600/20',
    progress: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    shipped: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  }[tone];

  return (
    <span
      title={label}
      className={cn(
        'inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
        toneClass
      )}
    >
      {count}
    </span>
  );
}

function locationDisplay(row: OrderCustomerSummary, t: (key: string) => string): { primary: string; secondary: string | null } {
  const primary = row.zones.length
    ? row.zones.map((id) => shippingZoneLabel(id, t) ?? id).join(', ')
    : t('admin.customers.unknownZone');
  const secondary = row.latestAddress;
  return { primary, secondary };
}

const AdminCustomers = () => {
  const { t, language, isRTL } = useLanguage();
  const { orders, loading, refreshing, reload } = useOrdersList('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // language is in the deps so zone-derived display strings (customer name
  // fallback, delivery location text) stay in sync with the admin's current language.
  const customers = useMemo(() => aggregateOrderCustomers(orders, t), [orders, t, language]);

  const zoneCounts = useMemo(() => zoneOrderCounts(orders), [orders]);

  const statusCounts = useMemo(() => {
    return {
      all: customers.length,
      new: customers.filter((c) => c.newCount > 0).length,
      in_progress: customers.filter((c) => c.inProgressCount > 0).length,
      shipped: customers.filter((c) => c.shippedCount > 0).length,
    };
  }, [customers]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return customers.filter((row) => {
      if (zoneFilter !== 'all' && !row.zones.includes(zoneFilter)) return false;

      if (statusFilter === 'new' && row.newCount === 0) return false;
      if (statusFilter === 'in_progress' && row.inProgressCount === 0) return false;
      if (statusFilter === 'shipped' && row.shippedCount === 0) return false;

      if (!q) return true;

      return (
        row.name.toLowerCase().includes(q) ||
        (row.phone?.toLowerCase().includes(q) ?? false) ||
        (row.email?.toLowerCase().includes(q) ?? false) ||
        (row.latestAddress?.toLowerCase().includes(q) ?? false) ||
        // deliveryLocations already carries the translated zone label + address,
        // so it covers zone-name search too — no need to also search row.zones (ids).
        row.deliveryLocations.some((loc) => loc.toLowerCase().includes(q))
      );
    });
  }, [customers, searchTerm, zoneFilter, statusFilter]);

  const summary = useMemo(() => {
    const withOrders = customers.length;
    const newOrders = orders.filter((o) => o.status === 'pending').length;
    const inProgress = orders.filter((o) => o.status === 'processing').length;
    const shipped = orders.filter((o) => o.status === 'shipped').length;
    const zones = new Set(orders.map((o) => o.deliveryZone?.trim()).filter(Boolean)).size;
    return { withOrders, newOrders, inProgress, shipped, zones };
  }, [customers, orders]);

  const zoneFilters: { key: ZoneFilter; label: string; count?: number }[] = [
    { key: 'all', label: t('admin.customers.allZones'), count: zoneCounts.all },
    ...SHIPPING_ZONES.map((zone) => ({
      key: zone.id as string,
      label: shippingZoneLabel(zone.id, t) as string,
      count: zoneCounts[zone.id] ?? 0,
    })),
  ];

  return (
    <div className="min-w-0" dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              {t('admin.customers.heading')}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {t('admin.customers.subtitle')}
            </p>
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
            <dt className="text-gray-500">{t('admin.customers.statCustomers')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.withOrders}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.customers.statusNew')}</dt>
            <dd className="font-medium tabular-nums text-orange-700">{summary.newOrders}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.customers.statusInProgress')}</dt>
            <dd className="font-medium tabular-nums text-amber-700">{summary.inProgress}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('orders.status.shipped')}</dt>
            <dd className="font-medium tabular-nums text-blue-700">{summary.shipped}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.customers.statZones')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.zones}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <div className="flex flex-col gap-2 border-b border-gray-200 pb-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('admin.customers.searchPlaceholder')}
              className="h-9 w-full rounded-md border border-gray-200 bg-white ps-9 pe-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
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
                {t(f.labelKey)}
                <span className="ms-1 tabular-nums opacity-70">{statusCounts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {zoneFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setZoneFilter(f.key)}
                className={cn(
                  'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                  zoneFilter === f.key
                    ? 'bg-catchy text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                {f.label}
                {f.count != null ? (
                  <span className="ms-1 tabular-nums opacity-80">{f.count}</span>
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
            <p className="py-10 text-center text-sm text-gray-500">{t('admin.customers.noMatch')}</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-start text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                      <th className="px-4 py-2.5 font-medium">{t('admin.orders.detail.customer')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('admin.customers.colPhone')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('admin.customers.colDeliveryLocation')}</th>
                      <th className="px-4 py-2.5 text-center font-medium">{t('admin.customers.statusNew')}</th>
                      <th className="px-4 py-2.5 text-center font-medium">{t('admin.customers.statusInProgress')}</th>
                      <th className="px-4 py-2.5 text-center font-medium">{t('orders.status.shipped')}</th>
                      <th className="px-4 py-2.5 text-end font-medium">{t('admin.customers.colOrders')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((row) => {
                      const { primary, secondary } = locationDisplay(row, t);
                      return (
                        <tr key={row.key} className="transition-colors hover:bg-gray-50/60">
                          <td className="max-w-[12rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">{row.name}</p>
                            {row.email ? (
                              <p className="truncate text-xs text-gray-500">{row.email}</p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-gray-900" dir="ltr">
                            {row.phone || '—'}
                          </td>
                          <td className="max-w-[16rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">{primary}</p>
                            {secondary ? (
                              <p className="truncate text-xs text-gray-500">{secondary}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusCountBadge count={row.newCount} label={t('admin.customers.statusNew')} tone="new" />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusCountBadge count={row.inProgressCount} label={t('admin.customers.statusInProgress')} tone="progress" />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusCountBadge count={row.shippedCount} label={t('orders.status.shipped')} tone="shipped" />
                          </td>
                          <td className="px-4 py-2.5 text-end">
                            <Link
                              to="/admin/orders"
                              className="font-medium tabular-nums text-catchy hover:underline"
                              title={t('admin.customers.viewOrders')}
                            >
                              {row.orderCount}
                            </Link>
                            <p className="text-[11px] tabular-nums text-gray-500">
                              {formatOrderMoney(row.totalSpent)}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-gray-100 md:hidden">
                {filtered.map((row) => {
                  const { primary, secondary } = locationDisplay(row, t);
                  return (
                    <li key={row.key} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{row.name}</p>
                          <p className="truncate text-xs text-gray-500" dir="ltr">
                            {row.phone || t('admin.customers.noPhone')}
                          </p>
                        </div>
                        <Link to="/admin/orders" className="shrink-0 text-sm font-medium text-catchy">
                          {t('admin.customers.ordersCountMobile').replace('{n}', String(row.orderCount)).replace('{plural}', row.orderCount === 1 ? '' : 's')}
                        </Link>
                      </div>
                      <p className="mt-1 truncate text-xs font-medium text-gray-800">{primary}</p>
                      {secondary ? (
                        <p className="truncate text-xs text-gray-500">{secondary}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusCountBadge count={row.newCount} label={t('admin.customers.statusNew')} tone="new" />
                        <StatusCountBadge count={row.inProgressCount} label={t('admin.customers.statusInProgress')} tone="progress" />
                        <StatusCountBadge count={row.shippedCount} label={t('orders.status.shipped')} tone="shipped" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCustomers;
