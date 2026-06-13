import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { SHIPPING_ZONES, type ShippingZoneId } from '../../lib/shippingZones';
import { cn } from '../../lib/utils';

type OrderTotalsBreakdownProps = {
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryZone?: ShippingZoneId | '' | null;
  /** Show all zone rates (cart before selection). */
  showShippingRates?: boolean;
  compact?: boolean;
};

const OrderTotalsBreakdown: React.FC<OrderTotalsBreakdownProps> = ({
  subtotal,
  shippingCost,
  total,
  deliveryZone,
  showShippingRates = false,
  compact = false,
}) => {
  const { t, isRTL } = useLanguage();
  const rowClass = cn(
    'flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500',
    compact && 'text-[9px] tracking-wide',
    isRTL && 'font-arabic'
  );

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-2', !compact && !showShippingRates && 'space-y-3')}>
      <div className={rowClass}>
        <span>{t('cart.subtotal')}</span>
        <span className="tabular-nums text-gray-900">{formatOrderMoney(subtotal)}</span>
      </div>

      {showShippingRates ? (
        <div className="space-y-1.5">
          <p className={cn('text-[10px] font-bold uppercase tracking-wider text-gray-400', isRTL && 'font-arabic')}>
            {t('cart.shippingRates')}
          </p>
          <p
            className={cn(
              'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[10px] leading-snug text-gray-600',
              isRTL && 'font-arabic'
            )}
          >
            {SHIPPING_ZONES.map((zone, index) => (
              <React.Fragment key={zone.id}>
                {index > 0 ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden />
                ) : null}
                <span className={cn(deliveryZone === zone.id && 'font-semibold text-catchy')}>
                  {t(zone.labelKey)} {formatOrderMoney(zone.cost)}
                </span>
              </React.Fragment>
            ))}
          </p>
        </div>
      ) : (
        <div className={rowClass}>
          <span>{t('cart.shipping')}</span>
          <span className="tabular-nums text-gray-900">{formatOrderMoney(shippingCost)}</span>
        </div>
      )}

      {showShippingRates ? (
        <p className={cn('text-[10px] leading-relaxed text-gray-400', isRTL && 'font-arabic')}>
          {t('cart.shippingAddedAtCheckout')}
        </p>
      ) : (
        <div className={cn('flex items-center justify-between border-t border-gray-200', compact ? 'pt-1' : 'pt-2')}>
          <span className={cn('font-medium text-gray-900', compact ? 'text-xs' : 'text-sm', isRTL ? 'font-arabic' : 'font-serif')}>
            {t('cart.total')}
          </span>
          <span className={cn('font-black tabular-nums text-gray-900', compact ? 'text-sm' : 'text-lg')}>
            {formatOrderMoney(total)}
          </span>
        </div>
      )}
    </div>
  );
};

export default OrderTotalsBreakdown;
