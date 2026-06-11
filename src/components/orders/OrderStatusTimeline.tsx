import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ORDER_STATUS_FLOW, orderStatusStep } from '../../lib/orders';
import type { OrderStatus } from '../../types/order';
import { cn } from '../../lib/utils';

type OrderStatusTimelineProps = {
  status: OrderStatus;
  className?: string;
};

const OrderStatusTimeline: React.FC<OrderStatusTimelineProps> = ({ status, className }) => {
  const { t, isRTL } = useLanguage();
  const currentStep = orderStatusStep(status);
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <p
        className={cn(
          'rounded-lg bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-600',
          isRTL && 'font-arabic',
          className
        )}
      >
        {t('orders.status.cancelled')}
      </p>
    );
  }

  return (
    <div className={cn('w-full', className)} dir="ltr">
      <div className="flex items-center justify-between gap-1">
        {ORDER_STATUS_FLOW.map((step, index) => {
          const stepNumber = index + 1;
          const isComplete = currentStep > stepNumber;
          const isCurrent = currentStep === stepNumber;

          return (
            <React.Fragment key={step}>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                    isComplete && 'bg-catchy text-white',
                    isCurrent && 'bg-catchy/15 text-catchy ring-2 ring-catchy/40',
                    !isComplete && !isCurrent && 'bg-gray-100 text-gray-400'
                  )}
                >
                  {isComplete ? '✓' : stepNumber}
                </div>
                <span
                  className={cn(
                    'hidden text-center text-[9px] font-bold uppercase tracking-wide sm:block',
                    isCurrent ? 'text-catchy' : 'text-gray-400',
                    isRTL && 'font-arabic'
                  )}
                >
                  {t(`orders.status.${step}`)}
                </span>
              </div>
              {index < ORDER_STATUS_FLOW.length - 1 ? (
                <div
                  className={cn(
                    'mb-5 h-0.5 flex-1 rounded-full',
                    currentStep > stepNumber ? 'bg-catchy' : 'bg-gray-200'
                  )}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      <p className={cn('mt-2 text-center text-xs font-medium text-gray-600 sm:hidden', isRTL && 'font-arabic')}>
        {t(`orders.status.${status}`)}
      </p>
    </div>
  );
};

export default OrderStatusTimeline;
