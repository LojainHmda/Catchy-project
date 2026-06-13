import React from 'react';
import { cn } from '../lib/utils';
import { getDiscountAmount, getDiscountPercent, isProductOnSale } from '../lib/productDiscount';

export type ProductPriceDisplayProps = {
  price: number;
  compareAtPrice?: number;
  onSale?: boolean;
  sale?: boolean;
  /** `compact` for cards, `detail` for product page, `inline` for admin tables */
  variant?: 'compact' | 'detail' | 'inline';
  saleLabel?: string;
  saveLabel?: string;
  percentOffLabel?: string;
  className?: string;
  isRTL?: boolean;
};

const ProductPriceDisplay: React.FC<ProductPriceDisplayProps> = ({
  price,
  compareAtPrice,
  onSale,
  sale,
  variant = 'compact',
  saleLabel = 'Sale',
  saveLabel = 'You save {amount}',
  percentOffLabel = '-{n}%',
  className,
  isRTL = false,
}) => {
  const product = { price, compareAtPrice, onSale, sale };
  const discounted = isProductOnSale(product);
  const compareAt = Number(compareAtPrice);
  const salePrice = Number(price);
  const percent = discounted ? getDiscountPercent(compareAt, salePrice) : 0;
  const saved = discounted ? getDiscountAmount(compareAt, salePrice) : 0;

  if (!discounted) {
    return (
      <span
        className={cn(
          'font-bold tabular-nums text-catchy-dark',
          variant === 'detail' && 'text-xl md:text-2xl text-gray-900',
          variant === 'inline' && 'text-sm text-gray-900',
          variant === 'compact' && 'text-xs sm:text-[13px]',
          className
        )}
      >
        ILS {salePrice.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      </span>
    );
  }

  if (variant === 'detail') {
    return (
      <div className={cn('space-y-1', className, isRTL && 'font-arabic')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl font-black tabular-nums text-red-600 md:text-2xl">
            ILS {salePrice.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            {percentOffLabel.replace('{n}', String(percent))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums text-gray-400 line-through">
            ILS {compareAt.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
          <span className="font-semibold text-emerald-700">
            {saveLabel.replace(
              '{amount}',
              `ILS ${saved.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
            )}
          </span>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn('text-right', className)}>
        <p className="font-medium tabular-nums text-red-600">
          ILS {salePrice.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-xs tabular-nums text-gray-400 line-through">
          ILS {compareAt.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[10px] font-semibold text-red-600">{percentOffLabel.replace('{n}', String(percent))}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-end gap-0.5', className)}>
      <span className="text-xs font-bold tabular-nums text-red-600 sm:text-[13px]">
        ILS {salePrice.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      </span>
      <span className="text-[11px] tabular-nums text-gray-400 line-through">ILS {compareAt}</span>
    </div>
  );
};

export default ProductPriceDisplay;

export function ProductSaleBadge({
  label,
  percent,
  className,
}: {
  label: string;
  percent?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'absolute z-[1] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white',
        className
      )}
    >
      {percent != null && percent > 0 ? `-${percent}%` : label}
    </span>
  );
}
