import React from 'react';
import { hasSizedInventory, sortedSizeStockEntries, type SizeStock } from '../../lib/productInventory';
import { cn } from '../../lib/utils';

type ProductSizeStockChipsProps = {
  sizeStock: SizeStock;
  totalStock: number;
  maxVisible?: number;
  compact?: boolean;
  className?: string;
};

const ProductSizeStockChips: React.FC<ProductSizeStockChipsProps> = ({
  sizeStock,
  totalStock,
  maxVisible = 6,
  compact = false,
  className,
}) => {
  const sized = hasSizedInventory(sizeStock);

  if (!sized) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums',
            totalStock > 0
              ? 'border-gray-200 bg-gray-50 text-gray-700'
              : 'border-red-100 bg-red-50 text-red-600'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', totalStock > 0 ? 'bg-catchy' : 'bg-red-400')} />
          {totalStock} total
        </span>
        <span className="text-[10px] text-gray-400">No per-size breakdown</span>
      </div>
    );
  }

  const entries = sortedSizeStockEntries(sizeStock);
  const inStock = entries.filter(([, qty]) => qty > 0);
  const visible = entries.slice(0, maxVisible);
  const hidden = entries.length - visible.length;
  const tooltip = entries.map(([size, qty]) => `${size}: ${qty}`).join(' · ');

  return (
    <div className={cn('min-w-0', className)} title={hidden > 0 ? tooltip : undefined}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Total</span>
        <span
          className={cn(
            'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
            totalStock > 10 ? 'bg-catchy/10 text-catchy-dark' : totalStock > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'
          )}
        >
          {totalStock}
        </span>
        {inStock.length > 0 ? (
          <span className="text-[10px] text-gray-400">
            {inStock.length} size{inStock.length === 1 ? '' : 's'} in stock
          </span>
        ) : (
          <span className="text-[10px] font-medium text-red-500">All sizes empty</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map(([size, qty]) => {
          const chipTone =
            qty <= 0
              ? 'border-gray-200 bg-gray-50 text-gray-400'
              : qty <= 2
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-catchy/25 bg-catchy/10 text-catchy-dark';

          return (
            <span
              key={size}
              title={`${size}: ${qty} in stock`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 tabular-nums',
                compact ? 'text-[10px]' : 'text-[11px]',
                chipTone
              )}
            >
              <span className="font-semibold">{size}</span>
              <span className={cn('font-medium', qty > 0 ? 'opacity-60' : 'text-gray-300')}>·</span>
              <span className="font-bold">{qty}</span>
            </span>
          );
        })}
        {hidden > 0 ? (
          <span className="inline-flex items-center rounded-md border border-dashed border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            +{hidden}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default ProductSizeStockChips;
