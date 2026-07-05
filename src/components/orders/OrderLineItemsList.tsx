import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney, parseLineItemDisplay } from '../../lib/orders';
import type { OrderLineItem } from '../../types/order';
import { isCoordinateCartId, coordinateLookIdFromCart } from '../../lib/coordinateCart';
import { cn } from '../../lib/utils';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { orderItemImageSrc, useOrderItemImages } from '../../hooks/useOrderItemImages';

type OrderLineItemsListProps = {
  items: OrderLineItem[];
  compact?: boolean;
  linkProducts?: boolean;
  onItemClick?: () => void;
  variant?: 'list' | 'table';
};

const OrderLineItemsList: React.FC<OrderLineItemsListProps> = ({
  items,
  compact = false,
  linkProducts = false,
  onItemClick,
  variant = 'list',
}) => {
  const { isRTL } = useLanguage();
  const resolvedImages = useOrderItemImages(items);

  if (!items.length) {
    return <p className="text-xs text-gray-500">No line items recorded.</p>;
  }

  if (variant === 'table') {
    return (
      <div className="overflow-x-auto" dir="ltr">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="pb-2 pe-3 text-start font-semibold w-[72px]">Image</th>
              <th className="pb-2 pe-3 text-start font-semibold">Product</th>
              <th className="pb-2 pe-3 text-start font-semibold w-24">Color</th>
              <th className="pb-2 pe-3 text-center font-semibold w-16">Size</th>
              <th className="pb-2 pe-3 text-center font-semibold w-14">Qty</th>
              <th className="pb-2 text-end font-semibold w-24">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const href =
                linkProducts && item.productId
                  ? isCoordinateCartId(item.productId)
                    ? `/coordinate/${coordinateLookIdFromCart(item.productId)}`
                    : `/product/${item.productId}`
                  : null;

              const { productName, color, size } = parseLineItemDisplay(item);

              const nameCell = (
                <p className={cn('font-medium leading-snug text-gray-900', isRTL && 'font-arabic')}>
                  {productName}
                </p>
              );

              return (
                <tr key={`${item.productId}-${item.name}`} className={cn(isRTL && 'font-arabic')}>
                  <td className="py-2.5 pe-3 align-middle">
                    {href ? (
                      <Link to={href} onClick={onItemClick} className="block">
                        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-black/5 transition hover:opacity-90">
                          <img
                            src={orderItemImageSrc(item, resolvedImages) || PRODUCT_IMAGE_PLACEHOLDER}
                            alt={productName}
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
                      </Link>
                    ) : (
                      <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-black/5">
                        <img
                          src={orderItemImageSrc(item, resolvedImages) || PRODUCT_IMAGE_PLACEHOLDER}
                          alt={productName}
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
                    )}
                  </td>
                  <td className="max-w-[12rem] py-2.5 pe-3 align-middle">
                    {href ? (
                      <Link to={href} onClick={onItemClick} className="block hover:text-catchy">
                        {nameCell}
                      </Link>
                    ) : (
                      nameCell
                    )}
                    <p className="mt-0.5 text-xs tabular-nums text-gray-500">{formatOrderMoney(item.price)}</p>
                  </td>
                  <td className="py-2.5 pe-3 align-middle">
                    {color ? (
                      <span className={cn('text-sm text-gray-800', isRTL && 'font-arabic')}>{color}</span>
                    ) : (
                      <span className="text-sm text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pe-3 text-center align-middle">
                    {size ? (
                      <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold tabular-nums text-gray-800">
                        {size}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pe-3 text-center align-middle">
                    <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-sm font-semibold tabular-nums text-gray-900">
                      {item.quantity}
                    </span>
                  </td>
                  <td className="py-2.5 text-end align-middle font-semibold tabular-nums text-gray-900">
                    {formatOrderMoney(item.lineTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul className={cn('space-y-3', compact && 'space-y-2')}>
      {items.map((item) => {
        const { productName, color, size } = parseLineItemDisplay(item);
        const variantParts = [color, size].filter(Boolean);

        const content = (
          <>
            <div
              className={cn(
                'shrink-0 overflow-hidden rounded-lg bg-gray-50 ring-1 ring-black/5',
                compact ? 'size-11' : 'size-14'
              )}
            >
              <img
                src={orderItemImageSrc(item, resolvedImages) || PRODUCT_IMAGE_PLACEHOLDER}
                alt={productName}
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
            <div className="min-w-0 flex-1">
              <p className={cn('truncate font-medium text-gray-900', compact ? 'text-xs' : 'text-sm', isRTL && 'font-arabic')}>
                {productName}
              </p>
              <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">
                {item.quantity} × {formatOrderMoney(item.price)}
                {variantParts.length ? ` · ${variantParts.join(' · ')}` : ''}
              </p>
            </div>
            <p className={cn('shrink-0 font-semibold tabular-nums text-gray-900', compact ? 'text-xs' : 'text-sm')}>
              {formatOrderMoney(item.lineTotal)}
            </p>
          </>
        );

        const rowClass = cn('flex items-center gap-3', isRTL && 'font-arabic');

        if (linkProducts && item.productId) {
          const href = isCoordinateCartId(item.productId)
            ? `/coordinate/${coordinateLookIdFromCart(item.productId)}`
            : `/product/${item.productId}`;
          return (
            <li key={`${item.productId}-${item.name}`}>
              <Link to={href} onClick={onItemClick} className={cn(rowClass, 'hover:opacity-80')}>
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
