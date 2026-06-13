import React from 'react';
import { cn } from '../lib/utils';
import {
  hasSizedInventory,
  resolveProductInventory,
  sortedSizeStockEntries,
} from '../lib/productInventory';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

export type CoordinateItemSizePickerProps = {
  products: any[];
  itemSizes: Record<string, string>;
  onChange: (productId: string, size: string | null) => void;
  isRTL?: boolean;
  sizeLabel: string;
  selectSizeHint: string;
};

const CoordinateItemSizePicker: React.FC<CoordinateItemSizePickerProps> = ({
  products,
  itemSizes,
  onChange,
  isRTL,
  sizeLabel,
  selectSizeHint,
}) => {
  if (products.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      <p className={cn('text-[10px] font-black uppercase tracking-[0.12em] text-gray-400', isRTL && 'font-arabic')}>
        {sizeLabel}
      </p>
      {products.map((product) => {
        const { sizeStock, stock } = resolveProductInventory(product);
        const sized = hasSizedInventory(sizeStock);
        const selected = itemSizes[product.id] ?? null;
        const thumb = coerceProductImages(product)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;

        return (
          <div key={product.id} className="rounded-lg border border-gray-100 bg-gray-50/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <img src={thumb} alt="" className="h-10 w-8 rounded object-cover" />
              <p className={cn('min-w-0 flex-1 text-sm font-semibold text-gray-900', isRTL && 'font-arabic text-start')}>
                {product.name}
              </p>
            </div>
            {sized ? (
              <div className="flex flex-wrap gap-1.5">
                {sortedSizeStockEntries(sizeStock, { includeZero: false }).map(([size, qty]) => {
                  const active = selected === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onChange(product.id, active ? null : size)}
                      className={cn(
                        'flex min-w-[2.5rem] flex-col items-center rounded-md border px-2.5 py-1 text-xs font-bold transition',
                        active
                          ? 'border-catchy bg-catchy text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-catchy'
                      )}
                    >
                      <span>{size}</span>
                      <span className={cn('text-[8px] font-medium', active ? 'text-white/80' : 'text-gray-400')}>
                        {qty}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                {stock > 0 ? `${stock} available` : 'Out of stock'}
              </p>
            )}
            {sized && !selected ? (
              <p className={cn('mt-1.5 text-[11px] text-gray-400', isRTL && 'font-arabic')}>{selectSizeHint}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default CoordinateItemSizePicker;
