import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { db, collection, getDocs } from '../firebase';
import { cn } from '../lib/utils';

type CustomerRecord = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  createdAt: Date | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
};

type RoleFilter = 'all' | 'customer' | 'admin';
type SortKey = 'recent' | 'spent' | 'orders' | 'name';

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

function formatMoney(n: number): string {
  return `ILS ${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const AdminCustomers = () => {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('customer');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersSnap, ordersSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
      ]);

      const orderStats = new Map<
        string,
        { count: number; spent: number; lastOrderAt: Date | null }
      >();

      ordersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const uid = String(data.userId ?? '');
        if (!uid) return;
        const total = Number(data.total) || 0;
        const orderDate = toDate(data.createdAt);
        const prev = orderStats.get(uid) ?? { count: 0, spent: 0, lastOrderAt: null };
        const lastOrderAt =
          prev.lastOrderAt && orderDate
            ? prev.lastOrderAt > orderDate
              ? prev.lastOrderAt
              : orderDate
            : prev.lastOrderAt ?? orderDate;
        orderStats.set(uid, {
          count: prev.count + 1,
          spent: prev.spent + total,
          lastOrderAt,
        });
      });

      const rows: CustomerRecord[] = usersSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        const stats = orderStats.get(docSnap.id);
        return {
          id: docSnap.id,
          email: (data.email as string) ?? null,
          displayName: (data.displayName as string) ?? null,
          role: String(data.role ?? 'customer'),
          createdAt: toDate(data.createdAt),
          orderCount: stats?.count ?? 0,
          totalSpent: stats?.spent ?? 0,
          lastOrderAt: stats?.lastOrderAt ?? null,
        };
      });

      setCustomers(rows);
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (roleFilter === 'customer' && c.role === 'admin') return false;
      if (roleFilter === 'admin' && c.role !== 'admin') return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.displayName?.toLowerCase().includes(q) ?? false)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '');
      }
      if (sortBy === 'spent') return b.totalSpent - a.totalSpent;
      if (sortBy === 'orders') return b.orderCount - a.orderCount;
      return (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0);
    });

    return list;
  }, [customers, searchTerm, roleFilter, sortBy]);

  const selected = useMemo(
    () =>
      filtered.find((c) => c.id === selectedId) ??
      customers.find((c) => c.id === selectedId) ??
      null,
    [filtered, customers, selectedId]
  );

  const summary = useMemo(() => {
    const shoppers = customers.filter((c) => c.role !== 'admin');
    const active = shoppers.filter((c) => c.orderCount > 0).length;
    const revenue = shoppers.reduce((sum, c) => sum + c.totalSpent, 0);
    return { total: shoppers.length, active, revenue };
  }, [customers]);

  const roleCounts = useMemo(() => {
    const all = customers.length;
    const customer = customers.filter((c) => c.role !== 'admin').length;
    const admin = customers.filter((c) => c.role === 'admin').length;
    return { all, customer, admin };
  }, [customers]);

  const roleFilters: { key: RoleFilter; label: string; count: number }[] = [
    { key: 'customer', label: 'Customers', count: roleCounts.customer },
    { key: 'admin', label: 'Admins', count: roleCounts.admin },
    { key: 'all', label: 'All', count: roleCounts.all },
  ];

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Customers</h1>
        <p className="mt-0.5 text-sm text-gray-500">Profiles, orders, and lifetime value.</p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Total</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.total}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">With orders</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.active}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Revenue</dt>
            <dd className="font-medium tabular-nums text-gray-900">{formatMoney(summary.revenue)}</dd>
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
                placeholder="Search name, email, ID…"
                className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {roleFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRoleFilter(f.key)}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                    roleFilter === f.key
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">{f.count}</span>
                </button>
              ))}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none focus:border-gray-400"
                aria-label="Sort customers"
              >
                <option value="recent">Last order</option>
                <option value="spent">Lifetime value</option>
                <option value="orders">Orders</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>

          <div className="mt-0 overflow-hidden rounded-md border border-gray-200 bg-white">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">No customers match your filters.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                        <th className="px-4 py-2.5 font-medium">Customer</th>
                        <th className="px-4 py-2.5 font-medium">Role</th>
                        <th className="px-4 py-2.5 font-medium">Orders</th>
                        <th className="px-4 py-2.5 font-medium">LTV</th>
                        <th className="px-4 py-2.5 font-medium">Last order</th>
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
                          <td className="max-w-[14rem] px-4 py-2.5">
                            <p className="truncate font-medium text-gray-900">
                              {row.displayName || 'Unnamed'}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {row.email || row.id}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-xs capitalize text-gray-600">
                            {row.role}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-gray-900">{row.orderCount}</td>
                          <td className="px-4 py-2.5 font-medium tabular-nums text-gray-900">
                            {formatMoney(row.totalSpent)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                            {formatDate(row.lastOrderAt)}
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
                          <p className="truncate text-sm font-medium text-gray-900">
                            {row.displayName || 'Unnamed'}
                          </p>
                          <p className="truncate text-xs text-gray-500">{row.email}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums text-gray-900">
                            {formatMoney(row.totalSpent)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {row.orderCount} orders
                          </p>
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
              <div className="border-b border-gray-100 pb-3">
                <p className="text-sm font-medium text-gray-900">
                  {selected.displayName || 'Unnamed customer'}
                </p>
                <p className="mt-0.5 break-all text-xs text-gray-500">
                  {selected.email || 'No email'}
                </p>
                <p className="mt-1 text-xs capitalize text-gray-600">{selected.role}</p>
              </div>

              <dl className="space-y-2 border-b border-gray-100 py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Orders</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{selected.orderCount}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Lifetime value</dt>
                  <dd className="font-medium tabular-nums text-gray-900">
                    {formatMoney(selected.totalSpent)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Last order</dt>
                  <dd className="text-gray-700">{formatDate(selected.lastOrderAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Joined</dt>
                  <dd className="text-gray-700">{formatDate(selected.createdAt)}</dd>
                </div>
              </dl>

              {selected.email ? (
                <a
                  href={`mailto:${selected.email}`}
                  className="mt-3 block text-xs font-medium text-gray-900 underline-offset-2 hover:underline"
                >
                  {selected.email}
                </a>
              ) : null}

              <p className="mt-3 break-all font-mono text-[10px] text-gray-400">{selected.id}</p>
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-500">Select a customer to view details.</p>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AdminCustomers;
