import React from 'react';
import type { OrderLineItem } from '../../types/order';
import { cn } from '../../lib/utils';

import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { orderItemImageSrc, useOrderItemImages } from '../../hooks/useOrderItemImages';

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
  const resolvedImages = useOrderItemImages(visible);

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
            src={orderItemImageSrc(item, resolvedImages) || PRODUCT_IMAGE_PLACEHOLDER}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src.includes('product-placeholder.svg')) return;
              el.onerror = null;
              el.src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
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
