import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useOrder } from '../hooks/useOrder';
import OrderLineItemsList from '../components/orders/OrderLineItemsList';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import OrderStatusTimeline from '../components/orders/OrderStatusTimeline';
import OrderTotalsBreakdown from '../components/orders/OrderTotalsBreakdown';
import InvoiceDownloadButton from '../components/orders/InvoiceDownloadButton';
import { formatOrderDateTime, formatOrderMoney, shortOrderId } from '../lib/orders';
import { cn } from '../lib/utils';

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, role, loading: authLoading } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const { order, loading, error } = useOrder(orderId);
  const locale = language === 'ar' ? 'ar' : 'en-GB';

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: `/orders/${orderId}` }} />;
  }

  if (role === 'admin') {
    return <Navigate to={`/admin/orders?order=${orderId}`} replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (error === 'not_found' || !order || order.userId !== user.uid) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <Package className="mx-auto mb-4 h-10 w-10 text-gray-300" />
        <h1 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('orders.notFound')}</h1>
        <Link
          to="/orders"
          className={cn(
            'mt-6 inline-flex items-center gap-2 text-sm font-semibold text-catchy hover:underline',
            isRTL && 'font-arabic flex-row-reverse'
          )}
        >
          <ArrowLeft size={14} className={cn(isRTL && 'rotate-180')} />
          {t('orders.viewAll')}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 pb-28 sm:px-6 lg:px-10 sm:py-10 sm:pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <Link
        to="/orders"
        className={cn(
          'mb-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition hover:text-catchy',
          isRTL && 'font-arabic flex-row-reverse'
        )}
      >
        <ArrowLeft size={14} className={cn(isRTL && 'rotate-180')} />
        {t('orders.viewAll')}
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={cn('text-[10px] font-black uppercase tracking-[0.35em] text-catchy/70', isRTL && 'font-arabic')}>
              {t('orders.orderNumber')}
            </p>
            <h1 className="mt-1 font-mono text-xl font-bold text-gray-900">{shortOrderId(order.id)}</h1>
            <p className="mt-1 text-sm text-gray-500">{formatOrderDateTime(order.createdAt, locale)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </header>

      <div className="space-y-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className={cn('mb-4 text-xs font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
            {t('orders.tracking')}
          </h2>
          <OrderStatusTimeline status={order.status} />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
            <h2 className={cn('text-xs font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
              {t('orders.items')}
            </h2>
            <span className="text-lg font-black tabular-nums text-gray-900">
              {formatOrderMoney(order.total, locale)}
            </span>
          </div>
          <OrderLineItemsList items={order.items} linkProducts />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-surface-container/40 p-5">
          <OrderTotalsBreakdown
            subtotal={order.subtotal}
            shippingCost={order.shippingCost}
            total={order.total}
          />
        </section>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          to="/catalog"
          className={cn(
            'inline-flex w-full items-center justify-center rounded-xl bg-catchy py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark sm:w-auto sm:px-8',
            isRTL && 'font-arabic'
          )}
        >
          {t('cart.continueShopping')}
        </Link>
        <InvoiceDownloadButton
          order={order}
          className="w-full justify-center py-3 text-[11px] tracking-widest sm:w-auto sm:px-8"
        />
      </div>
    </div>
  );
};

export default OrderDetail;
