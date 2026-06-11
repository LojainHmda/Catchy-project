import React from 'react';
import { formatOrderDateTime, formatOrderMoney, shortOrderId } from '../../lib/orders';
import type { OrderRecord } from '../../types/order';
import { cn } from '../../lib/utils';
import OrderLineItemsList from './OrderLineItemsList';
import OrderStatusBadge from './OrderStatusBadge';

type OrderCardProps = {
  order: OrderRecord;
  locale?: string;
  className?: string;
};

const OrderCard: React.FC<OrderCardProps> = ({ order, locale = 'en-GB', className }) => {
  return (
    <article className={cn('rounded-2xl border border-gray-100 bg-white p-5 shadow-sm', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-wide text-gray-400">{shortOrderId(order.id)}</p>
          <p className="mt-1 text-lg font-black tabular-nums text-gray-900">{formatOrderMoney(order.total, locale)}</p>
          <p className="mt-1 text-[11px] text-gray-400">{formatOrderDateTime(order.createdAt, locale)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <OrderLineItemsList items={order.items} linkProducts />
    </article>
  );
};

export default OrderCard;
