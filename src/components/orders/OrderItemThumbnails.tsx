import React from 'react';
import type { OrderLineItem } from '../../types/order';
import { cn } from '../../lib/utils';

import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';

type OrderItemThumbnailsProps = {
  items: OrderLineItem[];
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
};

const OrderItemThumbnails: React.FC<OrderItemThumbnailsProps> = ({
  items,
  max = 4,
  size = 'sm',
  className,
}) => {
  const visible = items.slice(0, max);
  const overflow = Math.max(0, items.length - max);

  if (!visible.length) return null;

  const sizeClass = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <div className={cn('flex items-center', className)}>
      {visible.map((item, index) => (
        <div
          key={`${item.productId}-${index}`}
          className={cn(
            'overflow-hidden rounded-lg bg-gray-50 ring-2 ring-white',
            sizeClass,
            index > 0 && '-ms-2'
          )}
          style={{ zIndex: visible.length - index }}
        >
          <img
            src={item.image || PRODUCT_IMAGE_PLACEHOLDER}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      ))}
      {overflow > 0 ? (
        <div
          className={cn(
            '-ms-2 flex items-center justify-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-600 ring-2 ring-white',
            sizeClass
          )}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
};

export default OrderItemThumbnails;
