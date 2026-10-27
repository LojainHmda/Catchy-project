import React, { useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useOrdersList } from '../hooks/useOrdersList';
import { useLanguage } from '../context/LanguageContext';
import { formatOrderDate, formatOrderMoney } from '../lib/orders';
import { resolveDateRange, type DateRangePreset } from '../lib/orders/orderListFilters';
import { shippingZoneLabel } from '../lib/orders/orderCustomerSummary';
import { buildSalesReport, orderLinesCsvRows, reportSummaryCsvRows } from '../lib/reports/salesReport';
import { csvFileName, downloadCsv, toCsv } from '../lib/csv';
import { ORDER_STATUSES } from '../types/order';
import { cn } from '../lib/utils';

const PRESETS: { key: DateRangePreset; labelKey: string }[] = [
  { key: 'today', labelKey: 'admin.orders.page.dateToday' },
  { key: '7d', labelKey: 'admin.orders.page.date7d' },
  { key: '30d', labelKey: 'admin.orders.page.date30d' },
  { key: 'thisMonth', labelKey: 'admin.orders.page.dateThisMonth' },
  { key: 'lastMonth', labelKey: 'admin.orders.page.dateLastMonth' },
  { key: 'all', labelKey: 'admin.orders.page.dateAll' },
  { key: 'custom', labelKey: 'admin.orders.page.dateCustom' },
];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'teal' | 'red' }) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border bg-white p-4',
        tone === 'green' && 'border-emerald-200',
        tone === 'teal' && 'border-teal-200',
        tone === 'red' && 'border-red-100',
        !tone && 'border-gray-200'
      )}
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

const AdminReports = () => {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const { orders, loading, refreshing, error, reload } = useOrdersList('admin');
  const [preset, setPreset] = useState<DateRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(
    () => resolveDateRange(preset, new Date(), { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );
  const report = useMemo(() => buildSalesReport(orders, range), [orders, range]);
  const maxDayRevenue = Math.max(0, ...report.byDay.map((d) => d.revenue));
  const money = (n: number) => formatOrderMoney(n, locale);

  const exportSummary = () =>
    downloadCsv(csvFileName('catchy-report-summary'), toCsv(reportSummaryCsvRows(report, range)));
  const exportLines = () => downloadCsv(csvFileName('catchy-order-lines'), toCsv(orderLinesCsvRows(orders, range)));

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{t('admin.reports.title')}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-500">{t('admin.reports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportSummary}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={14} />
            {t('admin.reports.exportSummary')}
          </button>
          <button
            type="button"
            onClick={exportLines}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={14} />
            {t('admin.reports.exportLines')}
          </button>
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={loading || refreshing}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            {t('admin.common.refresh')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('admin.orders.page.dateRange')}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            aria-pressed={preset === p.key}
            className={cn(
              'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
              preset === p.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {t(p.labelKey)}
          </button>
        ))}
        {preset === 'custom' ? (
          <span className="ms-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-600">
              {t('admin.orders.page.dateFrom')}
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs" />
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              {t('admin.orders.page.dateTo')}
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 rounded-md border border-gray-200 px-2 text-xs" />
            </label>
          </span>
        ) : null}
      </div>

      {loading && orders.length === 0 ? (
        <p className="flex items-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('admin.reports.loading')}
        </p>
      ) : error && orders.length === 0 ? (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          {t('admin.reports.loadFailed')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('admin.reports.booked')} value={money(report.booked.revenue)} sub={t('admin.reports.bookedCount').replace('{n}', String(report.booked.count))} tone="green" />
            <Stat label={t('admin.reports.fulfilled')} value={money(report.fulfilled.revenue)} sub={t('admin.reports.fulfilledCount').replace('{n}', String(report.fulfilled.count))} tone="teal" />
            <Stat label={t('admin.reports.aov')} value={money(report.averageOrderValue)} sub={t('admin.reports.aovHint')} />
            <Stat label={t('admin.reports.itemsSold')} value={report.itemsSold.toLocaleString(locale)} />
            <Stat label={t('admin.reports.orders')} value={report.orderCount.toLocaleString(locale)} sub={t('admin.reports.ordersHint')} />
            <Stat label={t('admin.reports.open')} value={report.open.count.toLocaleString(locale)} sub={money(report.open.revenue)} />
            <Stat label={t('admin.reports.cancelled')} value={report.cancelled.count.toLocaleString(locale)} sub={money(report.cancelled.revenue)} tone="red" />
            <Stat label={t('admin.reports.shipping')} value={money(report.shippingCharged)} sub={t('admin.reports.shippingHint')} />
          </div>

          {report.orderCount === 0 ? (
            <p className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">{t('admin.reports.empty')}</p>
          ) : null}

          <Panel title={t('admin.reports.byDay')}>
            {report.byDay.length === 0 ? (
              <p className="text-sm text-gray-500">{t('admin.reports.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex h-40 min-w-full items-end gap-[3px]" style={{ minWidth: `${report.byDay.length * 10}px` }}>
                  {report.byDay.map((day) => {
                    const height = maxDayRevenue > 0 ? Math.max(2, Math.round((day.revenue / maxDayRevenue) * 100)) : 2;
                    const label = t('admin.reports.dayTooltip')
                      .replace('{date}', formatOrderDate(day.label, locale))
                      .replace('{amount}', money(day.revenue))
                      .replace('{n}', String(day.orders));
                    return (
                      <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={label}>
                        <div
                          role="img"
                          aria-label={label}
                          className={cn('w-full rounded-t-sm', day.revenue > 0 ? 'bg-emerald-500' : 'bg-gray-200')}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                  <span>{formatOrderDate(report.byDay[0]!.label, locale)}</span>
                  <span>{formatOrderDate(report.byDay[report.byDay.length - 1]!.label, locale)}</span>
                </div>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t('admin.reports.channels')}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">{t('admin.reports.web')}</dt>
                <dd className="text-end tabular-nums">{money(report.web.revenue)} <span className="text-gray-400">({report.web.count})</span></dd>
                <dt className="text-gray-500">{t('admin.reports.pos')}</dt>
                <dd className="text-end tabular-nums">{money(report.pos.revenue)} <span className="text-gray-400">({report.pos.count})</span></dd>
                <dt className="text-gray-500">{t('admin.reports.posCash')}</dt>
                <dd className="text-end tabular-nums">{money(report.posCash)}</dd>
                <dt className="text-gray-500">{t('admin.reports.posCard')}</dt>
                <dd className="text-end tabular-nums">{money(report.posCard)}</dd>
                <dt className="text-gray-500">{t('admin.reports.posDiscounts')}</dt>
                <dd className="text-end tabular-nums">{money(report.posDiscounts)}</dd>
              </dl>
            </Panel>

            <Panel title={t('admin.reports.byStatus')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="pb-1 text-start font-medium">{t('admin.common.status')}</th>
                    <th className="pb-1 text-end font-medium">{t('admin.reports.colCount')}</th>
                    <th className="pb-1 text-end font-medium">{t('admin.reports.colValue')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ORDER_STATUSES.map((status) => (
                    <tr key={status}>
                      <td className="py-1.5">{t(`orders.status.${status}`)}</td>
                      <td className="py-1.5 text-end tabular-nums">{report.byStatus[status].count}</td>
                      <td className="py-1.5 text-end tabular-nums">{money(report.byStatus[status].revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('admin.reports.topProducts')}>
              {report.topProducts.length === 0 ? (
                <p className="text-sm text-gray-500">{t('admin.reports.empty')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1 text-start font-medium">{t('admin.reports.colProduct')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colQty')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colRevenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.topProducts.map((p) => (
                      <tr key={p.key}>
                        <td className="max-w-[14rem] truncate py-1.5">
                          {p.name}
                          {p.color ? <span className="text-gray-500"> · {p.color}</span> : null}
                        </td>
                        <td className="py-1.5 text-end tabular-nums">{p.quantity}</td>
                        <td className="py-1.5 text-end tabular-nums">{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title={t('admin.reports.topCustomers')}>
              {report.topCustomers.length === 0 ? (
                <p className="text-sm text-gray-500">{t('admin.reports.empty')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1 text-start font-medium">{t('admin.reports.colCustomer')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colOrders')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colRevenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.topCustomers.map((c) => (
                      <tr key={c.key}>
                        <td className="max-w-[14rem] truncate py-1.5">
                          {c.name || t('admin.customers.guestName')}
                          {c.phone ? <span className="text-gray-500"> · {c.phone}</span> : null}
                        </td>
                        <td className="py-1.5 text-end tabular-nums">{c.orders}</td>
                        <td className="py-1.5 text-end tabular-nums">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title={t('admin.reports.byZone')}>
              {report.byZone.length === 0 ? (
                <p className="text-sm text-gray-500">{t('admin.reports.empty')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-1 text-start font-medium">{t('admin.reports.colZone')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colOrders')}</th>
                      <th className="pb-1 text-end font-medium">{t('admin.reports.colRevenue')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.byZone.map((z) => (
                      <tr key={z.zone}>
                        <td className="py-1.5">{z.zone === 'unknown' ? t('admin.reports.unknownZone') : shippingZoneLabel(z.zone, t)}</td>
                        <td className="py-1.5 text-end tabular-nums">{z.count}</td>
                        <td className="py-1.5 text-end tabular-nums">{money(z.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminReports;
