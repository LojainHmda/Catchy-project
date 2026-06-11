import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { orderStatusTone } from '../../lib/orders';
import type { OrderStatus } from '../../types/order';
import { cn } from '../../lib/utils';

type OrderStatusBadgeProps = {
  status: OrderStatus;
  className?: string;
  showDot?: boolean;
};

const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className, showDot = true }) => {
  const { t, isRTL } = useLanguage();
  const tone = orderStatusTone(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        tone.badge,
        isRTL && 'font-arabic',
        className
      )}
    >
      {showDot ? <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} /> : null}
      {t(`orders.status.${status}`)}
    </span>
  );
};

export default OrderStatusBadge;
