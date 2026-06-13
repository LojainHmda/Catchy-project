import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { SHIPPING_ZONES } from '../../lib/shippingZones';
import { cn } from '../../lib/utils';

const ShippingRatesLine: React.FC = () => {
  const { t, isRTL } = useLanguage();

  return (
    <p
      className={cn(
        'flex flex-nowrap items-center justify-center gap-x-1.5 overflow-x-auto text-[9px] leading-none text-gray-600 no-scrollbar',
        isRTL && 'font-arabic'
      )}
    >
      {SHIPPING_ZONES.map((zone, index) => (
        <React.Fragment key={zone.id}>
          {index > 0 ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden /> : null}
          <span className="shrink-0 whitespace-nowrap">
            {t(zone.labelKey)} {formatOrderMoney(zone.cost)}
          </span>
        </React.Fragment>
      ))}
    </p>
  );
};

export default ShippingRatesLine;
