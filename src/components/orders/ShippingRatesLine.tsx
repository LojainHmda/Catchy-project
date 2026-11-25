import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useDeliveryPrices } from '../../hooks/useDeliveryData';
import { deliveryPriceRange } from '../../lib/delivery/deliveryAreas';
import { formatOrderMoney } from '../../lib/orders';
import { cn } from '../../lib/utils';

/**
 * One line above checkout in the cart drawer: the current delivery price range (prices
 * are set per area in Admin -> Delivery prices; the exact one appears once the customer
 * picks their area at checkout).
 */
const ShippingRatesLine: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const { settings } = useDeliveryPrices();
  const range = settings ? deliveryPriceRange(settings) : null;

  return (
    <p
      className={cn('min-h-[9px] text-center text-[9px] leading-none text-gray-600', isRTL && 'font-arabic')}
      data-testid="shipping-rates-line"
    >
      {range
        ? range.min === range.max
          ? t('cart.shippingFlat').replace('{price}', formatOrderMoney(range.min))
          : t('cart.shippingRange').replace('{min}', formatOrderMoney(range.min)).replace('{max}', formatOrderMoney(range.max))
        : null}
    </p>
  );
};

export default ShippingRatesLine;
