import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { AnalyticsApiError, fetchAnalyticsSummary, type AnalyticsSummary } from '../lib/analytics/analyticsApi';
import { presetRange, validateCustomRange, type DayRange, type RangePreset } from '../lib/analytics/dateRanges';

const PRESETS: { key: RangePreset; labelKey: string }[] = [
  { key: 'today', labelKey: 'admin.orders.page.dateToday' },
  { key: 'yesterday', labelKey: 'admin.analytics.yesterday' },
  { key: 'last7', labelKey: 'admin.orders.page.date7d' },
  { key: 'last30', labelKey: 'admin.orders.page.date30d' },
  { key: 'thisMonth', labelKey: 'admin.orders.page.dateThisMonth' },
  { key: 'custom', labelKey: 'admin.orders.page.dateCustom' },
];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {note ? <p className="mt-0.5 text-xs text-gray-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="py-4 text-center text-sm text-gray-500">{text}</p>;

/** Vertical bars, one per day; `series` are drawn side by side. */
function DayBars({ days, series, tooltip }: { days: string[]; series: { values: number[]; className: string }[]; tooltip: (i: number) => string }) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  return (
    <div className="overflow-x-auto">
      <div className="flex h-40 items-end gap-[3px]" style={{ minWidth: `${days.length * (series.length * 5 + 4)}px` }}>
        {days.map((day, i) => (
          <div key={day} className="flex h-full flex-1 items-end justify-center gap-px" title={tooltip(i)}>
            {series.map((s, k) => (
              <div
                key={k}
                className={cn('w-full max-w-[14px] rounded-t-sm', s.className)}
                style={{ height: `${max > 0 ? Math.max(s.values[i] > 0 ? 3 : 1, Math.round((s.values[i] / max) * 100)) : 1}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
    </div>
  );
}

const AdminAnalytics = () => {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const n = (v: number) => v.toLocaleString(locale);
  const [preset, setPreset] = useState<RangePreset>('last7');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error' | 'denied'>('idle');

  const { range, rangeError } = useMemo((): { range: DayRange | null; rangeError: string | null } => {
    const now = Date.now();
    if (preset !== 'custom') return { range: presetRange(preset, now), rangeError: null };
    if (!customFrom || !customTo) return { range: null, rangeError: null };
    const custom = { from: customFrom, to: customTo };
    const check = validateCustomRange(custom, now);
    return 'reason' in check ? { range: null, rangeError: t(`admin.analytics.range.${check.reason}`) } : { range: custom, rangeError: null };
  }, [preset, customFrom, customTo, t]);

  const load = useCallback(async (r: DayRange) => {
    setStatus('loading');
    try {
      setData(await fetchAnalyticsSummary(r.from, r.to));
      setStatus('ok');
    } catch (err) {
      setStatus(err instanceof AnalyticsApiError && (err.status === 401 || err.status === 403) ? 'denied' : 'error');
    }
  }, []);

  useEffect(() => {
    if (range) void load(range);
  }, [range?.from, range?.to, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageLabel = (page: string) => t(`admin.analytics.page.${page}`);
  const productById = useMemo(() => new Map((data?.topProducts ?? []).map((p) => [p.id, p])), [data]);
  const productName = (id: string) => productById.get(id)?.name || t('admin.analytics.products.removed');
  const totalSessionsBySource = (data?.sources ?? []).reduce((a, s) => a + s.sessions, 0);
  const dayLabels = (data?.days ?? []).map((d) => d.day);

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{t('admin.analytics.title')}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-500">{t('admin.analytics.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => range && load(range)}
          disabled={!range || status === 'loading'}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(status === 'loading' && 'animate-spin')} />
          {t('admin.common.refresh')}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('admin.orders.page.dateRange')}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset(p.key)}
            aria-pressed={preset === p.key}
            className={cn('h-8 rounded-md px-2.5 text-xs font-medium transition-colors', preset === p.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100')}
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
        {range ? <span className="ms-2 text-xs text-gray-400" dir="ltr">{range.from === range.to ? range.from : `${range.from} → ${range.to}`}</span> : null}
      </div>
      {rangeError ? <p role="alert" className="text-xs text-red-700">{rangeError}</p> : null}

      {status === 'denied' ? (
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('admin.analytics.notAuthorized')}</p>
      ) : status === 'error' ? (
        <p role="alert" className="rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">{t('admin.analytics.loadFailed')}</p>
      ) : !data || (status === 'loading' && !data) ? (
        status === 'loading' ? (
          <p className="flex items-center gap-2 py-12 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> {t('admin.analytics.loading')}</p>
        ) : null
      ) : (
        <>
          {!data.trackingSince ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">{t('admin.analytics.noDataYet')}</p>
          ) : data.trackingSince > data.from ? (
            <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">{t('admin.analytics.dataStartsOn').replace('{date}', data.trackingSince)}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t('admin.analytics.kpi.visitors')}
              value={data.totals.uniqueVisitorsApproximate ? `≈ ${n(data.totals.uniqueVisitors)}` : n(data.totals.uniqueVisitors)}
              sub={t(data.totals.uniqueVisitorsApproximate ? 'admin.analytics.kpi.visitorsApproxHint' : 'admin.analytics.kpi.visitorsExactHint')}
            />
            <Stat label={t('admin.analytics.kpi.sessions')} value={n(data.totals.sessions)} sub={t('admin.analytics.kpi.sessionsHint')} />
            <Stat label={t('admin.analytics.kpi.pageViews')} value={n(data.totals.pageViews)} sub={t('admin.analytics.kpi.pageViewsHint')} />
            <Stat label={t('admin.analytics.kpi.productViews')} value={n(data.totals.productViews)} sub={t('admin.analytics.kpi.productViewsHint')} />
          </div>

          {!data.hasData ? <Empty text={t('admin.analytics.emptyRange')} /> : null}

          <Panel title={t('admin.analytics.daily.title')} note={t('admin.analytics.daily.legend')}>
            {data.hasData ? (
              <DayBars
                days={dayLabels}
                series={[
                  { values: data.days.map((d) => d.visitors), className: 'bg-gray-900' },
                  { values: data.days.map((d) => d.pageViews), className: 'bg-emerald-300' },
                ]}
                tooltip={(i) => t('admin.analytics.daily.tooltip').replace('{date}', data.days[i].day).replace('{visitors}', n(data.days[i].visitors)).replace('{views}', n(data.days[i].pageViews))}
              />
            ) : (
              <Empty text={t('admin.analytics.emptyRange')} />
            )}
          </Panel>

          <Panel title={t('admin.analytics.monthly.title')} note={t('admin.analytics.monthly.note')}>
            {data.hasData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs text-gray-500">
                      <th className="py-1.5 text-start font-medium">{t('admin.analytics.monthly.month')}</th>
                      <th className="py-1.5 text-end font-medium">{t('admin.analytics.kpi.visitors')}</th>
                      <th className="py-1.5 text-end font-medium">{t('admin.analytics.kpi.sessions')}</th>
                      <th className="py-1.5 text-end font-medium">{t('admin.analytics.kpi.pageViews')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month} className="border-t border-gray-100">
                        <td className="py-1.5" dir="ltr">
                          {m.month} <span className="text-xs text-gray-400">{t('admin.analytics.monthly.days').replace('{n}', String(m.days))}</span>
                        </td>
                        <td className="py-1.5 text-end tabular-nums">≈ {n(m.uniqueVisitors)}</td>
                        <td className="py-1.5 text-end tabular-nums">{n(m.sessions)}</td>
                        <td className="py-1.5 text-end tabular-nums">{n(m.pageViews)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text={t('admin.analytics.emptyRange')} />
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t('admin.analytics.products.title')}>
              {data.topProducts.length ? (
                <ol className="divide-y divide-gray-100 text-sm">
                  {data.topProducts.map((p, i) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">
                        <span className="me-2 text-xs tabular-nums text-gray-400">{i + 1}</span>
                        {p.name ? (
                          <Link to={`/product/${p.id}`} target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:underline">{p.name}</Link>
                        ) : (
                          <span className="text-gray-500">{t('admin.analytics.products.removed')}</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-700">{n(p.views)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty text={t('admin.analytics.products.empty')} />
              )}
            </Panel>

            <Panel title={t('admin.analytics.pages.title')}>
              {data.topPages.length ? (
                <ol className="divide-y divide-gray-100 text-sm">
                  {data.topPages.map((p) => (
                    <li key={p.page} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-gray-900">{pageLabel(p.page)}</span>
                      <span className="shrink-0 tabular-nums text-gray-700">{n(p.views)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty text={t('admin.analytics.pages.empty')} />
              )}
            </Panel>
          </div>

          <Panel title={t('admin.analytics.productTrend.title')}>
            {data.totals.productViews > 0 ? (
              <>
                <DayBars
                  days={dayLabels}
                  series={[{ values: data.productTrend.days.map((d) => d.total), className: 'bg-catchy' }]}
                  tooltip={(i) => t('admin.analytics.productTrend.tooltip').replace('{date}', data.productTrend.days[i].day).replace('{n}', n(data.productTrend.days[i].total))}
                />
                <ul className="mt-4 space-y-2 text-sm">
                  {data.productTrend.productIds.map((id) => {
                    const values = data.productTrend.days.map((d) => d.byProduct[id] ?? 0);
                    const max = Math.max(1, ...values);
                    return (
                      <li key={id} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-gray-700">{productName(id)}</span>
                        <span className="flex h-6 flex-1 items-end gap-px">
                          {values.map((v, i) => (
                            <span key={i} className="flex-1 rounded-t-sm bg-catchy/60" style={{ height: `${Math.max(v ? 12 : 4, Math.round((v / max) * 100))}%` }} title={`${data.productTrend.days[i].day}: ${v}`} />
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <Empty text={t('admin.analytics.products.empty')} />
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t('admin.analytics.sources.title')} note={t('admin.analytics.sources.note')}>
              {totalSessionsBySource > 0 ? (
                <ul className="space-y-2 text-sm">
                  {data.sources.map((s) => {
                    const pct = Math.round((s.sessions / totalSessionsBySource) * 100);
                    return (
                      <li key={s.channel}>
                        <div className="flex justify-between gap-3">
                          <span className="text-gray-900">{t(`admin.analytics.channel.${s.channel}`)}</span>
                          <span className="tabular-nums text-gray-700">{n(s.sessions)} · {pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty text={t('admin.analytics.sources.empty')} />
              )}
            </Panel>

            <Panel title={t('admin.analytics.referrers.title')}>
              {data.referrers.length ? (
                <ol className="divide-y divide-gray-100 text-sm">
                  {data.referrers.map((r) => (
                    <li key={r.host} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-gray-900" dir="ltr">{r.host}</span>
                      <span className="shrink-0 tabular-nums text-gray-700">{n(r.sessions)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty text={t('admin.analytics.referrers.empty')} />
              )}
            </Panel>
          </div>
        </>
      )}

      <details className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-600">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">{t('admin.analytics.method.title')}</summary>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          <li>{t('admin.analytics.method.visitors')}</li>
          <li>{t('admin.analytics.method.sessions')}</li>
          <li>{t('admin.analytics.method.pageViews')}</li>
          <li>{t('admin.analytics.method.live')}</li>
          <li>{t('admin.analytics.method.limits')}</li>
        </ul>
      </details>
    </div>
  );
};

export default AdminAnalytics;
