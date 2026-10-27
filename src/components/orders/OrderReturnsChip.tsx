import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import type { OrderRecord } from '../../types/order';
import AdminStrokeIcon from '../admin/AdminStrokeIcon';
import { BADGE_TONE } from './orderListTheme';

/**
 * Small marker on admin order rows: this order has returns on the shelf
 * (Sisley's "warning" tone while any are still open, "neutral" once all are
 * resolved), with the same return icon as the row's Process-return action.
 * Renders nothing for orders without returns.
 */
const OrderReturnsChip: React.FC<{ order: Pick<OrderRecord, 'returnSummary'>; className?: string }> = ({
  order,
  className,
}) => {
  const { t } = useLanguage();
  const summary = order.returnSummary;
  if (!summary || summary.returnCount === 0) return null;
  const open = summary.openCount > 0;
  const label = t(open ? 'admin.returns.chipOpen' : 'admin.returns.chipResolved').replace('{n}', String(summary.returnCount));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        open ? BADGE_TONE.warning : BADGE_TONE.neutral,
        className
      )}
      title={label}
      aria-label={label}
    >
      <AdminStrokeIcon name="return" className="h-3 w-3" />
      {summary.returnCount}
    </span>
  );
};

export default OrderReturnsChip;
