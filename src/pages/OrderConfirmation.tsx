import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Package, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useOrder } from '../hooks/useOrder';
import OrderLineItemsList from '../components/orders/OrderLineItemsList';
import OrderStatusBadge from '../components/orders/OrderStatusBadge';
import OrderTotalsBreakdown from '../components/orders/OrderTotalsBreakdown';
import { shortOrderId } from '../lib/orders';
import { cn } from '../lib/utils';

const OrderConfirmation = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const { order, loading, error } = useOrder(orderId);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (error === 'not_found' || !order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <Package className="mx-auto mb-4 h-10 w-10 text-gray-300" />
        <h1 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')}>{t('orders.notFound')}</h1>
        <Link to="/orders" className="mt-6 inline-block text-sm font-semibold text-catchy hover:underline">
          {t('orders.viewAll')}
        </Link>
      </div>
    );
  }

  if (!order.isGuest) {
    if (!user) {
      return <Navigate to="/login" replace state={{ returnTo: `/orders/confirmation/${orderId}` }} />;
    }
    if (order.userId !== user.uid) {
      return <Navigate to="/orders" replace />;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={32} />
        </div>
        <p className={cn('text-[10px] font-black uppercase tracking-[0.35em] text-catchy/70', isRTL && 'font-arabic')}>
          {t('orders.confirmation.kicker')}
        </p>
        <h1 className={cn('mt-2 text-2xl font-bold text-gray-900 sm:text-3xl', isRTL ? 'font-arabic' : 'font-serif')}>
          {t('orders.confirmation.title')}
        </h1>
        <p className={cn('mt-2 text-sm text-gray-500', isRTL && 'font-arabic')}>
          {t('orders.confirmation.subtitle')}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('orders.orderNumber')}</p>
            <p className="mt-1 font-mono text-sm font-bold text-gray-900">{shortOrderId(order.id)}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="mb-5 border-b border-gray-100 pb-4">
          <OrderTotalsBreakdown
            subtotal={order.subtotal}
            shippingCost={order.shippingCost}
            total={order.total}
          />
        </div>

        {order.deliveryAddress ? (
          <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
            <p className={cn('text-[10px] font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
              {t('cart.deliveryAddress')}
            </p>
            <p className={cn('mt-1 text-sm text-gray-800', isRTL && 'font-arabic')}>{order.deliveryAddress}</p>
            {order.customerPhone ? (
              <p className="mt-1 text-xs text-gray-500" dir="ltr">
                {order.customerPhone}
              </p>
            ) : null}
          </div>
        ) : null}

        <OrderLineItemsList items={order.items} linkProducts />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {user && !order.isGuest ? (
          <Link
            to="/orders"
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-xl bg-catchy px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark',
              isRTL && 'font-arabic flex-row-reverse'
            )}
          >
            {t('orders.viewAll')}
            <ArrowRight size={14} className={cn(isRTL && 'rotate-180')} />
          </Link>
        ) : null}
        <Link
          to="/catalog"
          className={cn(
            'inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-3 text-[11px] font-black uppercase tracking-widest text-gray-700 transition hover:border-catchy hover:text-catchy',
            isRTL && 'font-arabic'
          )}
        >
          {t('cart.continueShopping')}
        </Link>
      </div>
    </div>
  );
};

export default OrderConfirmation;
