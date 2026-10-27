import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, PackageOpen, RefreshCw, Search } from 'lucide-react';
import ReturnStatusBadge from '../components/returns/ReturnStatusBadge';
import ReturnDetailModal from '../components/returns/ReturnDetailModal';
import { fetchReturns } from '../lib/returns/returnsApi';
import { filterReturns, returnShelfCounts, type ReturnShelfFilter } from '../lib/returns/returnsShelf';
import { formatOrderDate, shortOrderId } from '../lib/orders';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import type { ReturnRecord } from '../types/returns';

const FILTERS: { key: ReturnShelfFilter; labelKey: string }[] = [
  { key: 'open', labelKey: 'admin.returns.filter.open' },
  { key: 'quarantine', labelKey: 'admin.returns.status.quarantine' },
  { key: 'needs_repair', labelKey: 'admin.returns.status.needs_repair' },
  { key: 'resolved', labelKey: 'admin.returns.status.resolved' },
  { key: 'all', labelKey: 'cat.all' },
];

/**
 * Returns shelf (owner-only). Units on the shelf are NOT sellable; only an
 * owner's "sellable — restock" resolution puts them back into stock.
 */
const AdminReturns = () => {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<ReturnShelfFilter>('open');
  const [search, setSearch] = useState('');
  const selectedId = searchParams.get('return');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRecords(await fetchReturns());
    } catch (err) {
      console.error('Returns could not be loaded:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => returnShelfCounts(records), [records]);
  const visible = useMemo(() => filterReturns(records, filter, search), [records, filter, search]);
  const selected = useMemo(() => records.find((r) => r.id === selectedId) ?? null, [records, selectedId]);

  const openRecord = (id: string) => {
    searchParams.set('return', id);
    setSearchParams(searchParams, { replace: true });
  };
  const closeRecord = () => {
    searchParams.delete('return');
    setSearchParams(searchParams, { replace: true });
  };
  const onChanged = (updated: ReturnRecord) =>
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              <PackageOpen size={22} className="text-amber-600" />
              {t('admin.nav.returns')}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('admin.returns.page.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            {t('admin.common.refresh')}
          </button>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.returns.filter.open')}</dt>
            <dd className="font-medium tabular-nums text-amber-700">{counts.open}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.returns.page.unitsOnShelf')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{counts.unitsOnShelf}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.returns.disposition.restocked')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{counts.restocked}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.returns.disposition.damaged')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{counts.damaged}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.returns.disposition.manual_review')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{counts.manualReview}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4 flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.returns.page.searchPlaceholder')}
            aria-label={t('admin.returns.page.searchPlaceholder')}
            className="h-9 w-full rounded-md border border-gray-200 bg-white ps-9 pe-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                filter === f.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {t(f.labelKey)}
              <span className="ms-1 tabular-nums opacity-70">{counts.byFilter[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('admin.common.loading')}
          </div>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-600">{t('admin.returns.page.loadFailed')}</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">{t('admin.returns.page.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => openRecord(r.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-start hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {r.productName} <span className="text-gray-500">× {r.quantity}</span>
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {[r.colorName, r.size].filter(Boolean).join(' / ') || '—'} ·{' '}
                      {r.reason ? t(`admin.returns.reason.${r.reason}`) : '—'} · {r.customerName || '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
                    <Link
                      to={`/admin/orders?order=${r.orderId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-catchy hover:underline"
                    >
                      {shortOrderId(r.orderId)}
                    </Link>
                    <span>{formatOrderDate(r.createdAt, locale)}</span>
                    <ReturnStatusBadge status={r.status} disposition={r.disposition} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReturnDetailModal open={!!selected} record={selected} onClose={closeRecord} onChanged={onChanged} />
    </div>
  );
};

export default AdminReturns;
