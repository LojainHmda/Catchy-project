import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import type { OrderListBucket } from '../../types/order';
import { ACCENT_RING, OL, STATUS_CARD_CLASS, STATUS_CARD_ORDER, STATUS_ICON } from './orderListTheme';

type OrderStatusCardsProps = {
  /** Count per list bucket (see countOrdersByBucket). */
  counts: Partial<Record<OrderListBucket, number>>;
  /** Current status filter ('all' or a bucket). */
  active: string;
  /** Clicking a card filters by it; clicking the active card again clears the filter. */
  onSelect: (bucket: OrderListBucket | 'all') => void;
};

/**
 * Square, strongly coloured per-status count cards — the Sisley Orders page's
 * OrderStatusCards (one saturated colour per status, big count, label + status
 * icon, click to filter, ring on the active card). Purely presentational.
 */
const OrderStatusCards: React.FC<OrderStatusCardsProps> = ({ counts, active, onSelect }) => {
  const { t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t('admin.orders.page.statusCardsAria')}
      className="mb-4 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-7"
    >
      {STATUS_CARD_ORDER.map((bucket) => {
        const isActive = active === bucket;
        const icon = STATUS_ICON[bucket];
        return (
          <button
            key={bucket}
            type="button"
            data-status-card={bucket}
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? 'all' : bucket)}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border p-1.5 text-center transition-transform hover:-translate-y-0.5 sm:rounded-2xl sm:p-2',
              OL.border,
              OL.shadowCard,
              STATUS_CARD_CLASS[bucket],
              isActive && ACCENT_RING
            )}
          >
            <span className="text-xl font-extrabold tabular-nums sm:text-3xl">{counts[bucket] ?? 0}</span>
            <span className="text-[10px] font-bold leading-tight sm:text-[11px]">
              {t(`orders.status.${bucket}`)}
              {icon ? <span aria-hidden="true">{` ${icon}`}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default OrderStatusCards;
