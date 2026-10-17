import React from 'react';
import { Globe, Store } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';

type OrderSourceBadgeProps = {
  /** Mirrors OrderRecord.source's own contract: absent/undefined means 'web'. */
  source: 'web' | 'pos' | undefined;
  className?: string;
};

const OrderSourceBadge: React.FC<OrderSourceBadgeProps> = ({ source, className }) => {
  const { t } = useLanguage();
  const isPos = source === 'pos';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset',
        isPos ? 'bg-blue-50 text-blue-700 ring-blue-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/15',
        className
      )}
    >
      {isPos ? <Store size={11} /> : <Globe size={11} />}
      {isPos ? t('admin.orders.sourcePos') : t('admin.orders.sourceWeb')}
    </span>
  );
};

export default OrderSourceBadge;
