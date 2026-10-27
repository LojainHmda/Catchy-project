import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { orderStatusTone } from '../../lib/orders';
import { NEEDS_REVIEW_BUCKET, type OrderStatus } from '../../types/order';
import { cn } from '../../lib/utils';
import { BADGE_TONE, STATUS_BADGE_TONE, STATUS_ICON } from './orderListTheme';

type OrderStatusBadgeProps = {
  status: OrderStatus;
  className?: string;
  showDot?: boolean;
  /**
   * Admin screens only: the stored status is not canonical (see NEEDS_REVIEW_BUCKET).
   * Shows "Needs review" plus the raw stored value instead of the normalised status.
   * Customer-facing pages never pass this.
   */
  needsReview?: boolean;
  rawStatus?: string | null;
  /**
   * 'admin' = the admin Orders look (Sisley-style pill: Sisley's tones, uppercase,
   * status emoji icon). 'default' (customer pages, dashboard) is unchanged.
   */
  variant?: 'default' | 'admin';
};

const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({
  status,
  className,
  showDot = true,
  needsReview = false,
  rawStatus = null,
  variant = 'default',
}) => {
  const { t, isRTL } = useLanguage();
  const bucket = needsReview ? NEEDS_REVIEW_BUCKET : status;
  const raw = rawStatus?.trim() ? rawStatus : null;
  const label = needsReview ? t('orders.status.needs_review') : t(`orders.status.${status}`);
  const title = needsReview ? t('orders.status.needsReviewHint').replace('{raw}', raw ?? '—') : undefined;

  if (variant === 'admin') {
    const icon = STATUS_ICON[bucket];
    return (
      <span
        data-status={bucket}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
          BADGE_TONE[STATUS_BADGE_TONE[bucket]],
          isRTL && 'font-arabic',
          className
        )}
        title={title}
      >
        {label}
        {icon ? (
          <span aria-hidden="true" className="text-[0.95em] leading-none">
            {icon}
          </span>
        ) : null}
        {needsReview ? <span className="font-mono normal-case opacity-80">{raw ? `"${raw}"` : '∅'}</span> : null}
      </span>
    );
  }

  const tone = orderStatusTone(bucket);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        tone.badge,
        isRTL && 'font-arabic',
        className
      )}
      title={title}
    >
      {showDot ? <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} /> : null}
      {label}
      {needsReview ? <span className="font-mono normal-case opacity-80">{raw ? `"${raw}"` : '∅'}</span> : null}
    </span>
  );
};

export default OrderStatusBadge;
