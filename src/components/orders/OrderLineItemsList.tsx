import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import type { OrderLineItem } from '../../types/order';
import { cn } from '../../lib/utils';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400';

type OrderLineItemsListProps = {
  items: OrderLineItem[];
  compact?: boolean;
  linkProducts?: boolean;
  onItemClick?: () => void;
};

const OrderLineItemsList: React.FC<OrderLineItemsListProps> = ({
  items,
  compact = false,
  linkProducts = false,
  onItemClick,
}) => {
  const { isRTL } = useLanguage();

  if (!items.length) {
    return <p className="text-xs text-gray-500">No line items recorded.</p>;
  }

  return (
    <ul className={cn('space-y-3', compact && 'space-y-2')}>
      {items.map((item) => {
        const content = (
          <>
            <div
              className={cn(
                'shrink-0 overflow-hidden rounded-lg bg-gray-50 ring-1 ring-black/5',
                compact ? 'size-11' : 'size-14'
              )}
            >
              <img
                src={item.image || FALLBACK_IMAGE}
                alt={item.name}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate font-medium text-gray-900', compact ? 'text-xs' : 'text-sm', isRTL && 'font-arabic')}>
                {item.name}
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">
                {item.quantity} × {formatOrderMoney(item.price)}
                {item.size ? ` · ${item.size}` : ''}
              </p>
            </div>
            <p className={cn('shrink-0 font-semibold tabular-nums text-gray-900', compact ? 'text-xs' : 'text-sm')}>
              {formatOrderMoney(item.lineTotal)}
            </p>
          </>
        );

        const rowClass = cn('flex items-center gap-3', isRTL && 'font-arabic');

        if (linkProducts && item.productId) {
          return (
            <li key={`${item.productId}-${item.name}`}>
              <Link to={`/product/${item.productId}`} onClick={onItemClick} className={cn(rowClass, 'hover:opacity-80')}>
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li key={`${item.productId}-${item.name}`} className={rowClass}>
            {content}
          </li>
        );
      })}
    </ul>
  );
};

export default OrderLineItemsList;
