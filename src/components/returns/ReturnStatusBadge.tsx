import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import type { ReturnDisposition, ReturnStatus } from '../../types/returns';

/** On the shelf = amber/orange (not sellable); resolved = colour of the final outcome. */
export function returnBadgeTone(status: ReturnStatus, disposition: ReturnDisposition | null): string {
  if (status === 'quarantine') return 'bg-amber-50 text-amber-800 ring-amber-600/25';
  if (status === 'needs_repair') return 'bg-orange-50 text-orange-800 ring-orange-600/25';
  if (disposition === 'restocked') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/25';
  if (disposition === 'damaged') return 'bg-red-50 text-red-700 ring-red-600/20';
  return 'bg-slate-100 text-slate-700 ring-slate-500/25';
}

type ReturnStatusBadgeProps = {
  status: ReturnStatus;
  disposition: ReturnDisposition | null;
  className?: string;
};

const ReturnStatusBadge: React.FC<ReturnStatusBadgeProps> = ({ status, disposition, className }) => {
  const { t, isRTL } = useLanguage();
  const label =
    status === 'resolved' && disposition ? t(`admin.returns.disposition.${disposition}`) : t(`admin.returns.status.${status}`);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        returnBadgeTone(status, disposition),
        isRTL && 'font-arabic',
        className
      )}
    >
      {label}
    </span>
  );
};

export default ReturnStatusBadge;
