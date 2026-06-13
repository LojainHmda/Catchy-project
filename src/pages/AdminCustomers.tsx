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

type ZoneFilter = 'all' | string;
type StatusFilter = 'all' | 'new' | 'in_progress' | 'shipped';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'shipped', label: 'Shipped' },
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

function locationDisplay(row: OrderCustomerSummary): { primary: string; secondary: string | null } {
  const primary = row.zones.length ? row.zones.join(', ') : 'Unknown zone';
  const secondary = row.latestAddress;
  return { primary, secondary };
}

const AdminCustomers = () => {
  const { orders, loading, refreshing, reload } = useOrdersList('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const customers = useMemo(() => aggregateOrderCustomers(orders), [orders]);

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
        row.zones.some((zone) => zone.toLowerCase().includes(q)) ||
        row.deliveryLocations.some((loc) => loc.toLowerCase().includes(q))
      );
    });
  }, [customers, searchTerm, zoneFilter, statusFilter]);

  const summary = useMemo(() => {
    const withOrders = customers.length;
    const newOrders = orders.filter((o) => o.status === 'pending').length;
    const inProgress = orders.filter((o) => o.status === 'processing').length;
    const shipped = orders.filter((o) => o.status === 'shipped').length;
    const zones = new Set(
      orders.map((o) => shippingZoneLabel(o.deliveryZone)).filter(Boolean)
    ).size;
    return { withOrders, newOrders, inProgress, shipped, zones };
  }, [customers, orders]);

  const zoneFilters: { key: ZoneFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All zones', count: zoneCounts.all },
    ...SHIPPING_ZONES.map((zone) => ({
      key: shippingZoneLabel(zone.id) as string,
      label: shippingZoneLabel(zone.id) as string,
      count: zoneCounts[shippingZoneLabel(zone.id) as string] ?? 0,
    })),
  ];

  return (
    <div className="min-w-0" dir="ltr">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              Customer summary
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Customers who placed orders — search by name, phone, or delivery area.
            </p>
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
            <dt className="text-gray-500">Customers</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.withOrders}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">New</dt>
            <dd className="font-medium tabular-nums text-orange-700">{summary.newOrders}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">In progress</dt>
            <dd className="font-medium tabular-nums text-amber-700">{summary.inProgress}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Shipped</dt>
            <dd className="font-medium tabular-nums text-blue-700">{summary.shipped}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Delivery zones</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.zones}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <div className="flex flex-col gap-2 border-b border-gray-200 pb-3">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, phone, address, zone…"
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
                <span className="ml-1 tabular-nums opacity-70">{statusCounts[f.key]}</span>
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
                  <span className="ml-1 tabular-nums opacity-80">{f.count}</span>
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
            <p className="py-10 text-center text-sm text-gray-500">No customers match your filters.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                      <th className="px-4 py-2.5 font-medium">Customer</th>
                      <th className="px-4 py-2.5 font-medium">Phone</th>
                      <th className="px-4 py-2.5 font-medium">Delivery location</th>
                      <th className="px-4 py-2.5 text-center font-medium">New</th>
                      <th className="px-4 py-2.5 text-center font-medium">In progress</th>
                      <th className="px-4 py-2.5 text-center font-medium">Shipped</th>
                      <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((row) => {
                      const { primary, secondary } = locationDisplay(row);
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
                            <StatusCountBadge count={row.newCount} label="New orders" tone="new" />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusCountBadge count={row.inProgressCount} label="In progress" tone="progress" />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusCountBadge count={row.shippedCount} label="Shipped" tone="shipped" />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              to="/admin/orders"
                              className="font-medium tabular-nums text-catchy hover:underline"
                              title="View orders"
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
                  const { primary, secondary } = locationDisplay(row);
                  return (
                    <li key={row.key} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{row.name}</p>
                          <p className="truncate text-xs text-gray-500" dir="ltr">
                            {row.phone || 'No phone'}
                          </p>
                        </div>
                        <Link to="/admin/orders" className="shrink-0 text-sm font-medium text-catchy">
                          {row.orderCount} orders
                        </Link>
                      </div>
                      <p className="mt-1 truncate text-xs font-medium text-gray-800">{primary}</p>
                      {secondary ? (
                        <p className="truncate text-xs text-gray-500">{secondary}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusCountBadge count={row.newCount} label="New" tone="new" />
                        <StatusCountBadge count={row.inProgressCount} label="In progress" tone="progress" />
                        <StatusCountBadge count={row.shippedCount} label="Shipped" tone="shipped" />
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
