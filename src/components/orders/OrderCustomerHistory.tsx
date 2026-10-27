import React, { useMemo } from 'react';
import { History } from 'lucide-react';
import OrderStatusBadge from './OrderStatusBadge';
import { formatOrderDate, formatOrderMoney, shortOrderId } from '../../lib/orders';
import { customerHistoryFor } from '../../lib/orders/orderListFilters';
import { useLanguage } from '../../context/LanguageContext';
import type { OrderRecord } from '../../types/order';

type OrderCustomerHistoryProps = {
  order: OrderRecord;
  allOrders: OrderRecord[];
  onSelectOrder?: (orderId: string) => void;
};

const MAX_SHOWN = 5;

/** The customer's other orders, matched the same way as the Customers page. */
const OrderCustomerHistory: React.FC<OrderCustomerHistoryProps> = ({ order, allOrders, onSelectOrder }) => {
  const { t, language } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const history = useMemo(() => customerHistoryFor(order, allOrders), [order, allOrders]);

  return (
    <section className="mb-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <History size={12} />
        {t('admin.orders.detail.history')}
      </h3>
      <div className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
        {!history ? (
          <p className="text-gray-500">{t('admin.orders.detail.historyWalkIn')}</p>
        ) : (
          <>
            <p className="text-gray-700">
              {t('admin.orders.detail.historySummary')
                .replace('{n}', String(history.orderCount))
                .replace('{spent}', formatOrderMoney(history.totalSpent))}
              {history.cancelledCount ? (
                <span className="text-gray-500">
                  {' · '}
                  {t('admin.orders.detail.historyCancelled').replace('{n}', String(history.cancelledCount))}
                </span>
              ) : null}
              {history.returnedOrderCount ? (
                <span className="text-amber-700">
                  {' · '}
                  {t('admin.orders.detail.historyReturned').replace('{n}', String(history.returnedOrderCount))}
                </span>
              ) : null}
              {history.firstOrderAt ? (
                <span className="text-gray-500">
                  {' · '}
                  {t('admin.orders.detail.historyFirst').replace('{date}', formatOrderDate(history.firstOrderAt, locale))}
                </span>
              ) : null}
            </p>
            {history.orders.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">{t('admin.orders.detail.historyNone')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100">
                {history.orders.slice(0, MAX_SHOWN).map((other) => (
                  <li key={other.id}>
                    <button
                      type="button"
                      onClick={() => onSelectOrder?.(other.id)}
                      disabled={!onSelectOrder}
                      className="flex w-full items-center justify-between gap-2 py-1.5 text-start text-xs hover:bg-gray-50 disabled:cursor-default"
                    >
                      <span className="font-mono text-gray-900">{shortOrderId(other.id)}</span>
                      <span className="text-gray-500">{formatOrderDate(other.createdAt, locale)}</span>
                      <OrderStatusBadge status={other.status} needsReview={other.statusNeedsReview} rawStatus={other.rawStatus} variant="admin" className="px-1.5 py-0 text-[10px]" />
                      <span className="tabular-nums font-medium text-gray-900">{formatOrderMoney(other.total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {history.orders.length > MAX_SHOWN ? (
              <p className="mt-1 text-[11px] text-gray-400">
                {t('admin.orders.detail.historyMore').replace('{n}', String(history.orders.length - MAX_SHOWN))}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default OrderCustomerHistory;
