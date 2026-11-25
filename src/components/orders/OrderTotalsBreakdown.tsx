import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { cn } from '../../lib/utils';

type OrderTotalsBreakdownProps = {
  subtotal: number;
  /** null = not known yet (checkout before a delivery place is chosen / prices loaded): shown as "—". */
  shippingCost: number | null;
  total: number;
  /** Admin discount taken off a web order (NIS); a row is shown only when > 0. */
  discount?: number;
  compact?: boolean;
};

const OrderTotalsBreakdown: React.FC<OrderTotalsBreakdownProps> = ({
  subtotal,
  shippingCost,
  total,
  discount = 0,
  compact = false,
}) => {
  const { t, isRTL } = useLanguage();
  const rowClass = cn(
    'flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500',
    compact && 'text-[9px] tracking-wide',
    isRTL && 'font-arabic'
  );

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-3')}>
      <div className={rowClass}>
        <span>{t('cart.subtotal')}</span>
        <span className="tabular-nums text-gray-900">{formatOrderMoney(subtotal)}</span>
      </div>

      {discount > 0 ? (
        <div className={rowClass} data-testid="order-totals-discount">
          <span>{t('orders.discount')}</span>
          <bdi className="tabular-nums text-gray-900">−{formatOrderMoney(discount)}</bdi>
        </div>
      ) : null}

      <div className={rowClass}>
        <span>{t('cart.shipping')}</span>
        <span className="tabular-nums text-gray-900" data-testid="order-totals-shipping">
          {shippingCost === null ? '—' : formatOrderMoney(shippingCost)}
        </span>
      </div>

      <div className={cn('flex items-center justify-between border-t border-gray-200', compact ? 'pt-1' : 'pt-2')}>
        <span className={cn('font-medium text-gray-900', compact ? 'text-xs' : 'text-sm', isRTL ? 'font-arabic' : 'font-serif')}>
          {t('cart.total')}
        </span>
        <span className={cn('font-black tabular-nums text-gray-900', compact ? 'text-sm' : 'text-lg')} data-testid="order-totals-total">
          {formatOrderMoney(total)}
        </span>
      </div>
    </div>
  );
};

export default OrderTotalsBreakdown;
