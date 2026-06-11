import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Loader2, Package, RefreshCw, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useOrdersList } from '../hooks/useOrdersList';
import CustomerOrderCard from '../components/orders/CustomerOrderCard';
import OrdersPageSkeleton from '../components/orders/OrdersPageSkeleton';
import { formatOrderMoney, isOrderActive } from '../lib/orders';
import type { OrderRecord } from '../types/order';
import { cn } from '../lib/utils';

type OrdersFilter = 'all' | 'active' | 'completed' | 'cancelled';

function matchesFilter(order: OrderRecord, filter: OrdersFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return isOrderActive(order.status);
  if (filter === 'completed') return order.status === 'delivered';
  return order.status === 'cancelled';
}

const Orders = () => {
  const { user, role, loading: authLoading } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const [searchParams] = useSearchParams();
  const locale = language === 'ar' ? 'ar' : 'en-GB';

  const { orders, loading, refreshing, error, reload } = useOrdersList(user ? 'user' : null, user?.uid);
  const [filter, setFilter] = useState<OrdersFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const highlightId = searchParams.get('order');

  useEffect(() => {
    if (!orders.length) return;

    if (highlightId && orders.some((o) => o.id === highlightId)) {
      setExpandedId(highlightId);
      return;
    }

    setExpandedId((prev) => (prev && orders.some((o) => o.id === prev) ? prev : orders[0]?.id ?? null));
  }, [highlightId, orders]);

  const filtered = useMemo(() => orders.filter((o) => matchesFilter(o, filter)), [orders, filter]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      active: orders.filter((o) => isOrderActive(o.status)).length,
      completed: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }),
    [orders]
  );

  const summary = useMemo(() => {
    const spent = orders.reduce((sum, o) => sum + o.total, 0);
    const active = orders.filter((o) => isOrderActive(o.status)).length;
    return { spent, active };
  }, [orders]);

  const filters: { key: OrdersFilter; label: string }[] = [
    { key: 'all', label: t('orders.filter.all') },
    { key: 'active', label: t('orders.filter.active') },
    { key: 'completed', label: t('orders.filter.completed') },
    { key: 'cancelled', label: t('orders.filter.cancelled') },
  ];

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: '/orders' }} />;
  }

  if (role === 'admin') {
    return <Navigate to="/admin/orders" replace />;
  }

  return (
    <div
      className="w-full px-4 py-6 pb-28 sm:px-6 lg:px-10 sm:py-10 sm:pb-10"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn('text-[10px] font-black uppercase tracking-[0.35em] text-catchy/70', isRTL && 'font-arabic')}>
              {t('orders.kicker')}
            </p>
            <h1 className={cn('mt-2 text-2xl font-bold text-gray-900 sm:text-3xl', isRTL ? 'font-arabic' : 'font-serif')}>
              {t('orders.title')}
            </h1>
            <p className={cn('mt-2 text-sm text-gray-500', isRTL && 'font-arabic')}>{t('orders.subtitle')}</p>
          </div>
          {orders.length > 0 ? (
            <button
              type="button"
              onClick={() => reload(true)}
              disabled={loading || refreshing}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
              aria-label={t('orders.refresh')}
            >
              <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
            </button>
          ) : null}
        </div>

        {orders.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className={cn('text-[10px] font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
                {t('orders.summary.total')}
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-gray-900">
                {formatOrderMoney(summary.spent, locale)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className={cn('text-[10px] font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
                {t('orders.summary.active')}
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-gray-900">{summary.active}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm sm:col-span-1">
              <p className={cn('text-[10px] font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
                {t('orders.summary.count')}
              </p>
              <p className="mt-1 text-lg font-black tabular-nums text-gray-900">{orders.length}</p>
            </div>
          </div>
        ) : null}
      </header>

      {loading && orders.length === 0 ? (
        <OrdersPageSkeleton />
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-8">
          <p className={cn('text-sm font-medium text-red-700', isRTL && 'font-arabic')}>{t('orders.loadError')}</p>
          <button
            type="button"
            onClick={() => reload(false)}
            className={cn(
              'mt-4 rounded-xl bg-catchy px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white',
              isRTL && 'font-arabic'
            )}
          >
            {t('orders.retry')}
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
            <Package className="h-7 w-7 text-gray-300" />
          </div>
          <h2 className={cn('text-lg font-semibold text-gray-900', isRTL && 'font-arabic')}>
            {t('orders.emptyTitle')}
          </h2>
          <p className={cn('mt-2 max-w-md text-sm text-gray-500', isRTL && 'font-arabic')}>{t('orders.empty')}</p>
          <Link
            to="/catalog"
            className={cn(
              'mt-6 inline-flex items-center gap-2 rounded-xl bg-catchy px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark',
              isRTL && 'font-arabic flex-row-reverse'
            )}
          >
            <ShoppingBag size={14} />
            {t('cart.startShopping')}
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition',
                  filter === item.key
                    ? 'bg-catchy text-white shadow-sm'
                    : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-catchy/30',
                  isRTL && 'font-arabic'
                )}
              >
                {item.label}
                <span className="ms-1 tabular-nums opacity-80">{counts[item.key]}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className={cn('py-12 text-sm text-gray-500', isRTL && 'font-arabic')}>
              {t('orders.filterEmpty')}
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((order) => (
                <li key={order.id}>
                  <CustomerOrderCard
                    order={order}
                    locale={locale}
                    expanded={expandedId === order.id}
                    onToggle={() => setExpandedId((prev) => (prev === order.id ? null : order.id))}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default Orders;
