import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import AdminOrderDetailModal from '../components/orders/AdminOrderDetailModal';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import OrderStatusCards from '../components/orders/OrderStatusCards';
import OrderReturnsChip from '../components/orders/OrderReturnsChip';
import InvoiceDownloadButton from '../components/orders/InvoiceDownloadButton';
import ProcessReturnModal from '../components/orders/ProcessReturnModal';
import WebOrderCancelModal from '../components/orders/WebOrderCancelModal';
import AdminStrokeIcon, { type AdminStrokeIconName } from '../components/admin/AdminStrokeIcon';
import {
  ACCENT_CHECKBOX,
  ACCENT_FOCUS,
  ACTION_TONE,
  BADGE_TONE,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  OL,
} from '../components/orders/orderListTheme';
import { useOrdersList } from '../hooks/useOrdersList';
import { useAuth } from '../context/AuthContext';
import {
  checkoutErrorCode,
  formatOrderMoney,
  shortOrderId,
  sumOrderRevenue,
  updateOrderStatus,
} from '../lib/orders';
import {
  BULK_STATUS_TARGETS,
  ORDERS_PAGE_SIZE,
  bulkStatusSkipReason,
  canCancelWebOrder,
  canStartWebReturn,
  countOrdersByBucket,
  orderInDateRange,
  orderMatchesSearch,
  ordersCsvRows,
  pageCount,
  paginate,
  resolveDateRange,
  returnableLinesFor,
  sortOrders,
  type DateRangePreset,
  type OrderSortKey,
  type SortDirection,
} from '../lib/orders/orderListFilters';
import { orderListBucket } from '../lib/orders/orderUtils';
import { csvFileName, downloadCsv, toCsv } from '../lib/csv';
import { SHIPPING_ZONES } from '../lib/shippingZones';
import {
  NEEDS_REVIEW_BUCKET,
  ORDER_STATUSES,
  type OrderActor,
  type OrderListBucket,
  type OrderRecord,
  type OrderStatus,
} from '../types/order';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

type StatusFilter = 'all' | OrderListBucket;
type SourceFilter = 'all' | 'web' | 'pos';

/** Status filter dropdown: every status plus "Needs review" (never counted as pending). */
const STATUS_FILTER_OPTIONS: OrderListBucket[] = [...ORDER_STATUSES, NEEDS_REVIEW_BUCKET];

const SOURCE_FILTERS: { key: SourceFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'admin.orders.page.sourceAll' },
  { key: 'web', labelKey: 'admin.orders.sourceWeb' },
  { key: 'pos', labelKey: 'admin.orders.sourcePos' },
];

const DATE_PRESETS: { key: DateRangePreset; labelKey: string }[] = [
  { key: 'all', labelKey: 'admin.orders.page.dateAll' },
  { key: 'today', labelKey: 'admin.orders.page.dateToday' },
  { key: '7d', labelKey: 'admin.orders.page.date7d' },
  { key: '30d', labelKey: 'admin.orders.page.date30d' },
  { key: 'thisMonth', labelKey: 'admin.orders.page.dateThisMonth' },
  { key: 'lastMonth', labelKey: 'admin.orders.page.dateLastMonth' },
  { key: 'custom', labelKey: 'admin.orders.page.dateCustom' },
];

const SORT_OPTIONS: { value: string; key: OrderSortKey; dir: SortDirection; labelKey: string }[] = [
  { value: 'date-desc', key: 'date', dir: 'desc', labelKey: 'admin.orders.page.sortNewest' },
  { value: 'date-asc', key: 'date', dir: 'asc', labelKey: 'admin.orders.page.sortOldest' },
  { value: 'total-desc', key: 'total', dir: 'desc', labelKey: 'admin.orders.page.sortTotalHigh' },
  { value: 'total-asc', key: 'total', dir: 'asc', labelKey: 'admin.orders.page.sortTotalLow' },
  { value: 'status-asc', key: 'status', dir: 'asc', labelKey: 'admin.orders.page.sortStatus' },
  { value: 'customer-asc', key: 'customer', dir: 'asc', labelKey: 'admin.orders.page.sortCustomer' },
];

/** Clicking a sortable column header cycles through that column's sort options (Sisley-style headers). */
const HEADER_SORT_CYCLE: Partial<Record<OrderSortKey, string[]>> = {
  date: ['date-desc', 'date-asc'],
  total: ['total-desc', 'total-asc'],
  status: ['status-asc'],
  customer: ['customer-asc'],
};

const isStatusFilter = (value: string | null): value is StatusFilter =>
  value === 'all' || value === NEEDS_REVIEW_BUCKET || ORDER_STATUSES.includes(value as OrderStatus);

/** Sisley's numeric en-GB date + time (avoids mixed-direction text in Arabic). */
function rowDateTime(date: Date | null): { date: string; time: string } {
  if (!date) return { date: '—', time: '' };
  return {
    date: date.toLocaleDateString('en-GB'),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

/** Square, icon-only row action (Sisley's ActionIcon): the name lives in aria-label/title. */
function ActionIcon({
  icon,
  label,
  tone,
  onClick,
  href,
}: {
  icon: AdminStrokeIconName;
  label: string;
  tone: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = cn('flex h-7 w-7 items-center justify-center rounded-lg transition-colors', tone);
  const content = <AdminStrokeIcon name={icon} className="h-3.5 w-3.5" />;
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className={className} onClick={(e) => e.stopPropagation()}>
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {content}
    </button>
  );
}

function SourceChip({ source, label }: { source: OrderRecord['source']; label: string }) {
  const pos = source === 'pos';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        pos ? BADGE_TONE.success : BADGE_TONE.neutral
      )}
    >
      <AdminStrokeIcon name={pos ? 'box' : 'globe'} className="h-3 w-3" />
      {label}
    </span>
  );
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

const AdminOrders = () => {
  const { t, isRTL } = useLanguage();
  const { user, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orders, loading, refreshing, reload, patchOrder } = useOrdersList('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const initialStatus = searchParams.get('status');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(isStatusFilter(initialStatus) ? initialStatus : 'all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortValue, setSortValue] = useState('date-desc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<OrderStatus | ''>('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Row quick actions open the same guarded dialogs the order detail uses.
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [returnOrderId, setReturnOrderId] = useState<string | null>(null);

  const highlightId = searchParams.get('order');
  const actor: OrderActor | null = user ? { uid: user.uid, name: user.displayName || user.email } : null;
  const isAdmin = role === 'admin';

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

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, new Date(), { from: customFrom, to: customTo }),
    [datePreset, customFrom, customTo]
  );

  // Orders matching every filter except status — the status card counts are computed from this set.
  const baseFiltered = useMemo(
    () =>
      orders.filter((o) => {
        if (sourceFilter !== 'all' && (o.source ?? 'web') !== sourceFilter) return false;
        if (!orderInDateRange(o, dateRange)) return false;
        return orderMatchesSearch(o, searchTerm);
      }),
    [orders, sourceFilter, dateRange, searchTerm]
  );

  const activeSort = SORT_OPTIONS.find((s) => s.value === sortValue) ?? SORT_OPTIONS[0]!;

  const filtered = useMemo(() => {
    const rows = statusFilter === 'all' ? baseFiltered : baseFiltered.filter((o) => orderListBucket(o) === statusFilter);
    return sortOrders(rows, activeSort.key, activeSort.dir);
  }, [baseFiltered, statusFilter, activeSort]);

  const totalPages = pageCount(filtered.length);
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => paginate(filtered, currentPage), [filtered, currentPage]);

  // Back to page 1 whenever the filters change.
  useEffect(() => setPage(1), [searchTerm, statusFilter, sourceFilter, datePreset, customFrom, customTo, sortValue]);

  // Drop selections that are no longer visible in the filtered set.
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filtered.map((o) => o.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const selected = useMemo(
    () => filtered.find((o) => o.id === selectedId) ?? orders.find((o) => o.id === selectedId) ?? null,
    [filtered, orders, selectedId]
  );
  const cancelOrder = useMemo(() => orders.find((o) => o.id === cancelOrderId) ?? null, [orders, cancelOrderId]);
  const returnOrder = useMemo(() => orders.find((o) => o.id === returnOrderId) ?? null, [orders, returnOrderId]);

  const summary = useMemo(() => {
    // Cancelled orders stay in the list/counts below (full order history), but
    // never count toward revenue — a cancelled web order was never fulfilled
    // or paid, and a cancelled POS sale has had its stock restored and is
    // void. See sumOrderRevenue.
    const revenue = sumOrderRevenue(orders);
    // Exact bucket, same as the dashboard's live `status == 'pending'` count.
    const buckets = countOrdersByBucket(orders);
    const pending = buckets.pending ?? 0;
    const needsReview = buckets[NEEDS_REVIEW_BUCKET] ?? 0;
    const webOrders = orders.filter((o) => (o.source ?? 'web') === 'web');
    const posOrders = orders.filter((o) => o.source === 'pos');
    return {
      count: orders.length,
      revenue,
      pending,
      needsReview,
      web: { count: webOrders.length, revenue: sumOrderRevenue(webOrders) },
      pos: { count: posOrders.length, revenue: sumOrderRevenue(posOrders) },
    };
  }, [orders]);

  const statusCounts = useMemo(() => countOrdersByBucket(baseFiltered), [baseFiltered]);

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

  const changeStatusFilter = (key: StatusFilter) => {
    setStatusFilter(key);
    if (searchParams.has('status')) {
      searchParams.delete('status');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((o) => selectedIds.has(o.id));
  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((o) => next.delete(o.id));
      else pageRows.forEach((o) => next.add(o.id));
      return next;
    });
  };

  const runBulkStatus = async () => {
    if (!bulkTarget || bulkRunning) return;
    const chosen = orders.filter((o) => selectedIds.has(o.id));
    const eligible = chosen.filter((o) => bulkStatusSkipReason(o, bulkTarget) === null);
    const skipped = chosen.length - eligible.length;
    if (eligible.length === 0) {
      toast.error(t('admin.orders.page.bulkNoneEligible'));
      return;
    }
    const statusLabel = t(`orders.status.${bulkTarget}`);
    const confirmed = window.confirm(
      t('admin.orders.page.bulkConfirm')
        .replace('{n}', String(eligible.length))
        .replace('{status}', statusLabel)
        .replace('{skipped}', String(skipped))
    );
    if (!confirmed) return;

    setBulkRunning(true);
    let ok = 0;
    let changed = 0;
    const failedIds: string[] = [];
    // One at a time so a failure is attributed to the right order. Each change is a
    // transaction re-checked against the order's CURRENT state, so an order cancelled
    // (or otherwise changed) since this list loaded is refused, not overwritten.
    for (const order of eligible) {
      try {
        await updateOrderStatus(order.id, bulkTarget, actor);
        patchOrder(order.id, {
          status: bulkTarget,
          statusUpdatedAt: new Date(),
          statusUpdatedByUid: actor?.uid ?? null,
          statusUpdatedByName: actor?.name ?? null,
        });
        ok += 1;
      } catch (error) {
        if (checkoutErrorCode(error) === 'ORDER_CHANGED') {
          changed += 1;
        } else {
          console.error(`Bulk status change failed for ${order.id}:`, error);
          failedIds.push(order.id);
        }
      }
    }
    setBulkRunning(false);
    // Keep only the failures selected so they can be retried.
    setSelectedIds(new Set(failedIds));
    const message = t('admin.orders.page.bulkDone')
      .replace('{ok}', String(ok))
      .replace('{skipped}', String(skipped))
      .replace('{changed}', String(changed))
      .replace('{failed}', String(failedIds.length));
    if (failedIds.length || changed) toast.error(message);
    else toast.success(message);
    // Orders that changed elsewhere: reload so the list shows their real state.
    if (changed) void reload(true);
  };

  const exportCsv = () => {
    downloadCsv(csvFileName('catchy-orders'), toCsv(ordersCsvRows(filtered)));
  };

  const copyOrderLink = async (order: OrderRecord) => {
    const url = `${window.location.origin}/admin/orders?order=${encodeURIComponent(order.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('admin.orders.detail.linkCopied'));
    } catch {
      toast.error(t('admin.orders.detail.linkCopyFailed'));
    }
  };

  // Same eligibility rules as the order detail (the server re-checks everything).
  const canReturnRow = (o: OrderRecord) =>
    isAdmin && canStartWebReturn(o) && returnableLinesFor(o).lines.some((l) => l.remaining > 0);
  const canCancelRow = (o: OrderRecord) => isAdmin && canCancelWebOrder(o);

  const zoneLabel = (o: OrderRecord) => {
    const key = SHIPPING_ZONES.find((z) => z.id === o.deliveryZone)?.labelKey;
    return key ? t(key) : null;
  };

  const sourceLabel = (o: OrderRecord) => t(o.source === 'pos' ? 'admin.orders.sourcePos' : 'admin.orders.sourceWeb');

  const headerSort = (key: OrderSortKey) => {
    const cycle = HEADER_SORT_CYCLE[key];
    if (!cycle) return;
    const index = cycle.indexOf(sortValue);
    setSortValue(cycle[(index + 1) % cycle.length] ?? cycle[0]!);
  };

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * ORDERS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * ORDERS_PAGE_SIZE, filtered.length);

  const thClass = cn('px-4 py-3 text-xs font-bold uppercase tracking-wide', OL.inkFaint);

  const sortableHeader = (label: string, sortKey: OrderSortKey) => {
    const active = activeSort.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => headerSort(sortKey)}
        aria-label={t('admin.orders.page.sortByColumn').replace('{col}', label)}
        className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-[#1c1a17]"
      >
        {label}
        <AdminStrokeIcon
          name={active && activeSort.dir === 'desc' ? 'arrowDown' : 'arrowUp'}
          className={cn('h-3 w-3', active ? 'text-catchy' : 'text-[#a49d92]/50')}
        />
      </button>
    );
  };

  const statusCell = (row: OrderRecord) => {
    const canReturn = canReturnRow(row);
    const canCancel = canCancelRow(row);
    return (
      <div className="flex flex-col items-center gap-2">
        <OrderStatusBadge status={row.status} needsReview={row.statusNeedsReview} rawStatus={row.rawStatus} variant="admin" />
        <OrderReturnsChip order={row} />
        {canReturn || canCancel ? (
          <>
            <div className={cn('h-px w-10', OL.divider)} />
            <div className="flex items-center gap-1">
              {canReturn ? (
                <ActionIcon
                  icon="return"
                  label={t('admin.returns.processReturn')}
                  tone={ACTION_TONE.return}
                  onClick={() => setReturnOrderId(row.id)}
                />
              ) : null}
              {canCancel ? (
                <ActionIcon
                  icon="x"
                  label={t('admin.orders.detail.cancelOrder')}
                  tone={ACTION_TONE.cancel}
                  onClick={() => setCancelOrderId(row.id)}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={cn(
        // Full-bleed warm canvas for this page only (cancels the admin layout's own padding).
        // Viewport-based minimum so the canvas also fills short lists (the mobile top bar is ~4rem).
        '-m-4 min-h-[calc(100dvh-4rem)] min-w-0 p-4 sm:-m-6 sm:p-6 md:-m-10 md:min-h-screen md:p-10',
        OL.canvas,
        OL.ink
      )}
    >
      {/* Page header — Sisley PageHeader */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('admin.nav.orders')}</h1>
          <p className={cn('mt-1 text-sm', OL.inkSoft)}>
            {summary.count} {t('admin.orders.page.totalLabel')}
          </p>
          <dl className={cn('mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm', OL.inkSoft)}>
            <div className="flex gap-1.5">
              <dt>{t('admin.orders.page.statRevenue')}</dt>
              <dd className="font-semibold tabular-nums text-[#1c1a17]">{formatOrderMoney(summary.revenue)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t('orders.status.pending')}</dt>
              <dd className="font-semibold tabular-nums text-[#1c1a17]">{summary.pending}</dd>
            </div>
            {summary.needsReview ? (
              <div className="flex gap-1.5 text-[#6e1e36]">
                <dt>{t(`orders.status.${NEEDS_REVIEW_BUCKET}`)}</dt>
                <dd className="font-semibold tabular-nums">{summary.needsReview}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt>{t('admin.orders.page.statWebRevenue')}</dt>
              <dd className="font-semibold tabular-nums text-[#1c1a17]">
                {formatOrderMoney(summary.web.revenue)} <span className={OL.inkFaint}>({summary.web.count})</span>
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t('admin.orders.page.statPosRevenue')}</dt>
              <dd className="font-semibold tabular-nums text-[#1c1a17]">
                {formatOrderMoney(summary.pos.revenue)} <span className={OL.inkFaint}>({summary.pos.count})</span>
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={BUTTON_SECONDARY}>
            <AdminStrokeIcon name="download" className="h-4 w-4 shrink-0" />
            {t('admin.orders.page.exportCsv')}
          </button>
          <button type="button" onClick={() => reload(true)} disabled={loading || refreshing} className={BUTTON_SECONDARY}>
            <AdminStrokeIcon name="refresh" className={cn('h-4 w-4 shrink-0', refreshing && 'animate-spin')} />
            {t('admin.common.refresh')}
          </button>
        </div>
      </div>

      {/* Status summary cards — Sisley OrderStatusCards */}
      <OrderStatusCards counts={statusCounts} active={statusFilter} onSelect={changeStatusFilter} />

      {/* Filters — Sisley SearchInput + AdminSelect row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <AdminStrokeIcon
            name="search"
            className={cn('pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2', OL.inkFaint)}
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('admin.orders.page.searchPlaceholder')}
            aria-label={t('admin.orders.page.searchPlaceholder')}
            className={cn(
              'w-full rounded-lg border py-2.5 ps-9 pe-3 text-sm outline-none placeholder:text-[#a49d92]',
              OL.border,
              OL.surface,
              OL.ink,
              ACCENT_FOCUS
            )}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => changeStatusFilter(e.target.value as StatusFilter)}
          aria-label={t('admin.common.status')}
          className={cn(FIELD_CLASS, 'min-w-[calc(50%-0.375rem)] flex-1 sm:min-w-0 sm:w-auto sm:flex-none')}
        >
          <option value="all">{t('admin.orders.page.allStatuses')}</option>
          {STATUS_FILTER_OPTIONS.map((bucket) => (
            <option key={bucket} value={bucket}>
              {t(`orders.status.${bucket}`)}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          aria-label={t('admin.orders.page.colSource')}
          className={cn(FIELD_CLASS, 'min-w-[calc(50%-0.375rem)] flex-1 sm:min-w-0 sm:w-auto sm:flex-none')}
        >
          {SOURCE_FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {t(f.labelKey)}
            </option>
          ))}
        </select>
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
          aria-label={t('admin.orders.page.dateRange')}
          className={cn(FIELD_CLASS, 'min-w-[calc(50%-0.375rem)] flex-1 sm:min-w-0 sm:w-auto sm:flex-none')}
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>
        {datePreset === 'custom' ? (
          <>
            <label className={cn('flex items-center gap-2 text-sm', OL.inkSoft)}>
              {t('admin.orders.page.dateFrom')}
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={FIELD_CLASS} />
            </label>
            <label className={cn('flex items-center gap-2 text-sm', OL.inkSoft)}>
              {t('admin.orders.page.dateTo')}
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={FIELD_CLASS} />
            </label>
          </>
        ) : null}
        <select
          value={sortValue}
          onChange={(e) => setSortValue(e.target.value)}
          aria-label={t('admin.orders.page.sortBy')}
          className={cn(FIELD_CLASS, 'min-w-[calc(50%-0.375rem)] flex-1 sm:min-w-0 sm:w-auto sm:flex-none')}
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk actions — Sisley BulkActionBar (dark bar) */}
      {selectedIds.size > 0 ? (
        <div
          role="region"
          aria-label={t('admin.orders.page.bulkActions')}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#1c1a17] px-4 py-3 text-[#fffefc]"
        >
          <span className="text-sm font-semibold">
            {t('admin.orders.page.selectedCount').replace('{n}', String(selectedIds.size))}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value as OrderStatus | '')}
              aria-label={t('admin.orders.page.bulkSetStatus')}
              className="rounded-lg border border-[#fffefc]/25 bg-transparent px-3 py-2 text-sm text-[#fffefc] outline-none focus:border-[#fffefc]/60"
            >
              <option value="" className="text-[#1c1a17]">
                {t('admin.orders.page.bulkSetStatus')}
              </option>
              {BULK_STATUS_TARGETS.map((s) => (
                <option key={s} value={s} className="text-[#1c1a17]">
                  {t(`orders.status.${s}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runBulkStatus}
              disabled={!bulkTarget || bulkRunning}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#fffefc] transition-colors hover:bg-[#fffefc]/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkRunning ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
              {t('admin.orders.page.bulkApply')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ms-auto text-sm text-[#fffefc]/70 hover:text-[#fffefc]"
          >
            {t('admin.orders.page.bulkClear')}
          </button>
          <p className="w-full text-xs text-[#fffefc]/60">{t('admin.orders.page.bulkHint')}</p>
        </div>
      ) : null}

      {/* Orders — Sisley DataTable (desktop) / Sisley-styled cards (mobile) */}
      <div className="relative">
        {refreshing ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-[#e4ddd0]">
            <div className="h-full w-1/3 animate-pulse bg-catchy/70" />
          </div>
        ) : null}

        {loading && orders.length === 0 ? (
          <div className={cn('flex items-center justify-center py-24', OL.inkFaint)} role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="sr-only">{t('admin.common.loading')}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className={cn('flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center', OL.border)}>
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-full', OL.surfaceDim, OL.inkFaint)}>
              <AdminStrokeIcon name="bag" className="h-6 w-6" />
            </div>
            <p className="text-lg font-bold">
              {orders.length === 0 ? t('admin.orders.page.emptyTitle') : t('admin.orders.page.noMatch')}
            </p>
          </div>
        ) : (
          <>
            <div className={cn('hidden overflow-x-auto rounded-2xl border md:block', OL.border, OL.surface)}>
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className={cn('border-b text-start', OL.border, OL.headRow)}>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectPage}
                        aria-label={t('admin.orders.page.selectAll')}
                        className={cn('h-4 w-4 rounded', ACCENT_CHECKBOX)}
                      />
                    </th>
                    <th className={cn(thClass, 'w-28 text-start')}>{t('admin.orders.page.colOrder')}</th>
                    <th className={cn(thClass, 'text-start')}>
                      {sortableHeader(t('admin.orders.detail.customer'), 'customer')}
                    </th>
                    <th className={cn(thClass, 'w-36 text-start')}>
                      {sortableHeader(t('admin.common.status'), 'status')}
                    </th>
                    <th className={cn(thClass, 'w-32 text-start')}>
                      {sortableHeader(t('admin.orders.page.colItemsTotal'), 'total')}
                    </th>
                    <th className={cn(thClass, 'w-32 text-start')}>
                      {sortableHeader(t('admin.common.date'), 'date')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const when = rowDateTime(row.createdAt);
                    const zone = zoneLabel(row);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => selectOrder(row.id)}
                        className={cn(
                          'cursor-pointer border-b last:border-0',
                          OL.border,
                          OL.rowHover,
                          (selectedId === row.id || selectedIds.has(row.id)) && 'bg-[#efeae1]/50',
                          highlightId === row.id && 'ring-2 ring-inset ring-catchy/40'
                        )}
                      >
                        <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelected(row.id)}
                            aria-label={t('admin.orders.page.selectRow').replace('{id}', shortOrderId(row.id))}
                            className={cn('h-4 w-4 rounded', ACCENT_CHECKBOX)}
                          />
                        </td>

                        {/* Zone 1 — order number, source, view + invoice */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col items-center gap-1 text-center">
                            <span className="font-bold text-blue-700" dir="ltr">
                              {shortOrderId(row.id)}
                            </span>
                            <div className="flex flex-col items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <ActionIcon
                                icon="eye"
                                label={t('admin.orders.page.viewOrder')}
                                tone={ACTION_TONE.view}
                                onClick={() => selectOrder(row.id)}
                              />
                              <InvoiceDownloadButton order={row} variant="icon" />
                            </div>
                          </div>
                        </td>

                        {/* Zone 2 — customer */}
                        <td className="px-4 py-3 align-middle">
                          <p className="font-semibold">
                            {row.customerName || t('admin.orders.detail.guest')}
                            {zone ? <span className={cn('font-normal', OL.inkSoft)}>{` - ${zone}`}</span> : null}
                          </p>
                          {row.customerPhone ? (
                            <a
                              href={telHref(row.customerPhone)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                              <AdminStrokeIcon name="phone" className="h-3.5 w-3.5 shrink-0" />
                              <span dir="ltr">{row.customerPhone}</span>
                            </a>
                          ) : (
                            <p className="mt-0.5 truncate text-sm text-blue-600">{row.customerEmail || row.userId || '—'}</p>
                          )}
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                            <SourceChip source={row.source} label={sourceLabel(row)} />
                            {row.adminNote ? (
                              <p className="max-w-[16rem] truncate text-xs italic text-[#4f1526]" title={row.adminNote}>
                                {row.adminNote}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        {/* Zone 3 — status + return / cancel */}
                        <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                          {statusCell(row)}
                        </td>

                        {/* Zone 4 — items + total */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col items-center gap-0.5 text-center">
                            <span className="text-base font-bold tabular-nums">{row.itemCount}</span>
                            <span className="mt-1.5 font-bold tabular-nums">{formatOrderMoney(row.total)}</span>
                          </div>
                        </td>

                        {/* Zone 5 — date/time, customer actions, copy link */}
                        <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1 text-center">
                            <div className="text-xs font-medium tabular-nums" dir="ltr">
                              <p>{when.date}</p>
                              <p>{when.time}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              <ActionIcon
                                icon="users"
                                label={t('admin.orders.page.customerShipping')}
                                tone={ACTION_TONE.customer}
                                onClick={() => selectOrder(row.id)}
                              />
                              {row.customerPhone ? (
                                <ActionIcon
                                  icon="phone"
                                  label={t('admin.orders.detail.callCustomer')}
                                  tone={ACTION_TONE.call}
                                  href={telHref(row.customerPhone)}
                                />
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyOrderLink(row)}
                              className={cn('flex items-center gap-1 text-[11px] font-semibold hover:text-[#1c1a17]', OL.inkFaint)}
                              title={t('admin.orders.detail.copyLink')}
                            >
                              <AdminStrokeIcon name="copy" className="h-3 w-3" />
                              {t('admin.orders.detail.copyLink')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-3 md:hidden">
              {pageRows.map((row) => {
                const when = rowDateTime(row.createdAt);
                const zone = zoneLabel(row);
                return (
                  <li
                    key={row.id}
                    className={cn(
                      'rounded-2xl border p-3',
                      OL.border,
                      OL.surface,
                      OL.shadowSoft,
                      (selectedId === row.id || selectedIds.has(row.id)) && 'bg-[#efeae1]/50',
                      highlightId === row.id && 'ring-2 ring-catchy/40'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={t('admin.orders.page.selectRow').replace('{id}', shortOrderId(row.id))}
                        className={cn('mt-1 h-5 w-5 shrink-0 rounded', ACCENT_CHECKBOX)}
                      />
                      <button type="button" onClick={() => selectOrder(row.id)} className="min-w-0 flex-1 text-start">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-blue-700" dir="ltr">
                            {shortOrderId(row.id)}
                          </span>
                          <span className="font-bold tabular-nums">{formatOrderMoney(row.total)}</span>
                        </div>
                        <p className="mt-1 truncate font-semibold">
                          {row.customerName || t('admin.orders.detail.guest')}
                          {zone ? <span className={cn('font-normal', OL.inkSoft)}>{` - ${zone}`}</span> : null}
                        </p>
                        <p className={cn('mt-0.5 flex items-center gap-2 text-xs', OL.inkSoft)}>
                          <SourceChip source={row.source} label={sourceLabel(row)} />
                          <span dir="ltr" className="tabular-nums">
                            {when.date} {when.time}
                          </span>
                          <span className="tabular-nums">· {row.itemCount}×</span>
                        </p>
                      </button>
                    </div>
                    <div className={cn('mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3', OL.border)}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={row.status} needsReview={row.statusNeedsReview} rawStatus={row.rawStatus} variant="admin" />
                        <OrderReturnsChip order={row} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <ActionIcon icon="eye" label={t('admin.orders.page.viewOrder')} tone={ACTION_TONE.view} onClick={() => selectOrder(row.id)} />
                        <InvoiceDownloadButton order={row} variant="icon" />
                        {row.customerPhone ? (
                          <ActionIcon
                            icon="phone"
                            label={t('admin.orders.detail.callCustomer')}
                            tone={ACTION_TONE.call}
                            href={telHref(row.customerPhone)}
                          />
                        ) : null}
                        {canReturnRow(row) ? (
                          <ActionIcon
                            icon="return"
                            label={t('admin.returns.processReturn')}
                            tone={ACTION_TONE.return}
                            onClick={() => setReturnOrderId(row.id)}
                          />
                        ) : null}
                        {canCancelRow(row) ? (
                          <ActionIcon
                            icon="x"
                            label={t('admin.orders.detail.cancelOrder')}
                            tone={ACTION_TONE.cancel}
                            onClick={() => setCancelOrderId(row.id)}
                          />
                        ) : null}
                        <ActionIcon
                          icon="copy"
                          label={t('admin.orders.detail.copyLink')}
                          tone={cn('border', OL.border, OL.inkSoft, 'hover:bg-[#efeae1]')}
                          onClick={() => void copyOrderLink(row)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {filtered.length > 0 ? (
        <nav
          aria-label={t('admin.orders.page.pagination')}
          className={cn('mt-4 flex flex-wrap items-center justify-between gap-2 text-sm', OL.inkSoft)}
        >
          <span className="tabular-nums">
            {t('admin.orders.page.showing')
              .replace('{from}', String(rangeStart))
              .replace('{to}', String(rangeEnd))
              .replace('{total}', String(filtered.length))}
          </span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={cn(BUTTON_SECONDARY, 'px-3 py-2')}
              >
                <AdminStrokeIcon name={isRTL ? 'chevronRight' : 'chevronLeft'} className="h-4 w-4" />
                {t('admin.orders.page.prev')}
              </button>
              <span className="px-1 tabular-nums">
                {t('admin.orders.page.pageOf').replace('{page}', String(currentPage)).replace('{pages}', String(totalPages))}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={cn(BUTTON_SECONDARY, 'px-3 py-2')}
              >
                {t('admin.orders.page.next')}
                <AdminStrokeIcon name={isRTL ? 'chevronLeft' : 'chevronRight'} className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </nav>
      ) : null}

      <AdminOrderDetailModal
        open={!!selected}
        order={selected}
        allOrders={orders}
        onSelectOrder={selectOrder}
        onClose={closeDetail}
        onOrderPatch={patchOrder}
      />
      <WebOrderCancelModal
        open={!!cancelOrder}
        order={cancelOrder}
        onClose={() => setCancelOrderId(null)}
        onOrderPatch={patchOrder}
      />
      <ProcessReturnModal
        open={!!returnOrder}
        order={returnOrder}
        onClose={() => setReturnOrderId(null)}
        onOrderPatch={patchOrder}
      />
    </div>
  );
};

export default AdminOrders;
