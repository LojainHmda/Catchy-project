import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderDateTime, formatOrderMoney, shortOrderId } from '../../lib/orders';
import type { OrderRecord } from '../../types/order';
import { cn } from '../../lib/utils';
import OrderItemThumbnails from './OrderItemThumbnails';
import OrderLineItemsList from './OrderLineItemsList';
import OrderStatusBadge from './OrderStatusBadge';
import OrderStatusTimeline from './OrderStatusTimeline';
import InvoiceDownloadButton from './InvoiceDownloadButton';

type CustomerOrderCardProps = {
  order: OrderRecord;
  locale?: string;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
};

const CustomerOrderCard: React.FC<CustomerOrderCardProps> = ({
  order,
  locale = 'en-GB',
  expanded = false,
  onToggle,
  className,
}) => {
  const { t, isRTL } = useLanguage();

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow',
        expanded ? 'border-catchy/25 shadow-md ring-1 ring-catchy/10' : 'border-gray-100',
        className
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-start sm:p-5"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-bold tracking-wide text-gray-500">
              {shortOrderId(order.id)}
            </p>
            <OrderStatusBadge status={order.status} showDot={false} className="px-2 py-0.5" />
          </div>
          <p className={cn('mt-1.5 text-xl font-black tabular-nums text-gray-900', isRTL && 'font-arabic')}>
            {formatOrderMoney(order.total, locale)}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatOrderDateTime(order.createdAt, locale)}
            <span className="mx-1.5 text-gray-300">·</span>
            {t('orders.itemCount').replace('{n}', String(order.itemCount))}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <OrderItemThumbnails items={order.items} />
          <ChevronDown
            size={18}
            className={cn('text-gray-400 transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
              <OrderStatusTimeline status={order.status} className="mb-5" />
              <OrderLineItemsList items={order.items} linkProducts onItemClick={onToggle} />
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                <Link
                  to={`/orders/${order.id}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 transition hover:border-catchy hover:text-catchy',
                    isRTL && 'font-arabic flex-row-reverse'
                  )}
                >
                  <ExternalLink size={12} />
                  {t('orders.viewDetails')}
                </Link>
                <InvoiceDownloadButton order={order} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
};

export default CustomerOrderCard;
