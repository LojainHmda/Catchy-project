import React from 'react';
import { cn } from '../../lib/utils';
import type { ProductColorVariant } from '../../types/product';
import { variantLabel } from '../../lib/productVariants';
import { totalFromSizeStock } from '../../lib/productInventory';

export type ColorSwatchPickerProps = {
  variants: ProductColorVariant[];
  selectedId: string | null;
  onSelect: (colorId: string) => void;
  isRTL?: boolean;
  isAr?: boolean;
  label?: string;
};

const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({
  variants,
  selectedId,
  onSelect,
  isRTL = false,
  isAr = false,
  label = 'Color',
}) => {
  if (variants.length <= 1) return null;

  const selectedVariant = selectedId
    ? variants.find((v) => v.id === selectedId) ?? variants[0]!
    : null;
  const selectedLabel = selectedVariant ? variantLabel(selectedVariant, isAr) : null;

  return (
    <div className={cn('space-y-2', isRTL && 'font-arabic')} dir={isRTL ? 'rtl' : 'ltr'}>
      <p
        lang={isRTL ? 'ar' : undefined}
        className={cn(
          'w-fit max-w-full text-start text-[10px] text-gray-400',
          isRTL ? 'font-arabic font-bold normal-case tracking-normal' : 'font-black uppercase tracking-[0.12em]'
        )}
      >
        {isRTL && selectedLabel ? (
          <>
            <span>{label}</span>
            <span className="text-catchy">{`\u00A0${selectedLabel}`}</span>
          </>
        ) : (
          <>
            {label}
            {selectedLabel ? (
              <span className="ms-1.5 normal-case tracking-normal text-catchy">{selectedLabel}</span>
            ) : null}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const active = variant.id === selectedId;
          const inStock = totalFromSizeStock(variant.sizeStock) > 0;
          const swatch = variant.hex?.trim() || '#d1d5db';
          const thumb = variant.images[0];
          return (
            <button
              key={variant.id}
              type="button"
              disabled={!inStock}
              onClick={() => onSelect(variant.id)}
              title={variantLabel(variant, isAr)}
              aria-pressed={active}
              className={cn(
                'relative h-11 w-11 overflow-hidden rounded-full border-2 transition-all',
                active ? 'border-catchy ring-2 ring-catchy/25' : 'border-gray-200 hover:border-gray-300',
                !inStock && 'cursor-not-allowed opacity-40'
              )}
            >
              {thumb ? (
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full" style={{ backgroundColor: swatch }} />
              )}
              {!inStock ? (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[9px] font-bold text-gray-500">
                  —
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ColorSwatchPicker;
