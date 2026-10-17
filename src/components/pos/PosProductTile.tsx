import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { cloudinaryTransform } from '../../lib/cloudinaryTransform';
import { hasSizedInventory, sortedSizeStockEntries } from '../../lib/productInventory';
import { posProductInStock, posVariantScope, type PosProduct } from '../../lib/pos/posProduct';
import type { PosCartItem } from '../../types/pos';
import { cn } from '../../lib/utils';

type PosProductTileProps = {
  product: PosProduct;
  onQuickAdd: (item: Omit<PosCartItem, 'lineKey'>) => void;
  onOpenPicker: (colorId: string | null) => void;
};

/**
 * Fast-path tile: color swatches and size chips live right on the card, so a
 * cashier can add a common single unit in one or two taps without ever opening
 * a modal. Tapping the photo (rather than a chip) still opens the full picker
 * for anything the chips can't cover — a custom quantity, or many colors.
 */
const PosProductTile: React.FC<PosProductTileProps> = ({ product, onQuickAdd, onOpenPicker }) => {
  const { t } = useLanguage();
  const [colorId, setColorId] = useState<string | null>(null);
  const inStock = posProductInStock(product);
  const scope = posVariantScope(product, colorId);
  const sized = hasSizedInventory(scope.sizeStock);
  const sizeEntries = sized ? sortedSizeStockEntries(scope.sizeStock, { includeZero: false }) : [];
  const activeColorId = colorId ?? scope.colorId;
  const lowStock = scope.stock > 0 && scope.stock <= 3;

  const quickAddSize = (size: string, qty: number) => {
    if (qty <= 0) return;
    onQuickAdd({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: scope.image ?? '',
      size,
      colorId: scope.colorId,
      colorName: scope.colorName,
      availableStock: qty,
    });
  };

  const quickAddUnsized = () => {
    if (scope.stock <= 0) return;
    onQuickAdd({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: scope.image ?? '',
      size: null,
      colorId: scope.colorId,
      colorName: scope.colorName,
      availableStock: scope.stock,
    });
  };

  return (
    <div
      className={cn(
        'group flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-neutral-900 shadow-sm shadow-black/20 transition-all duration-150 hover:border-white/15 hover:shadow-lg hover:shadow-black/30',
        !inStock && 'opacity-55'
      )}
    >
      <button
        type="button"
        onClick={() => onOpenPicker(activeColorId)}
        className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-800"
      >
        <img
          src={cloudinaryTransform(scope.image || PRODUCT_IMAGE_PLACEHOLDER, { width: 220, height: 275 })}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src.includes('product-placeholder.svg')) return;
            el.onerror = null;
            el.src = PRODUCT_IMAGE_PLACEHOLDER;
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        {product.onSale ? (
          <span className="absolute left-2 top-2 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm shadow-rose-500/40">
            {t('pos.product.sale')}
          </span>
        ) : null}
        {!inStock ? (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-rose-600/90 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
            {t('pos.stock.outOfStock')}
          </span>
        ) : lowStock ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
            {t('pos.stock.lowStock')}
          </span>
        ) : null}
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="truncate text-sm font-semibold text-neutral-100">{product.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tabular-nums text-catchy">{formatOrderMoney(product.price)}</span>
          {product.onSale && product.compareAtPrice ? (
            <span className="text-xs tabular-nums text-neutral-500 line-through">
              {formatOrderMoney(product.compareAtPrice)}
            </span>
          ) : null}
        </div>

        {product.colorVariants.length > 1 ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {product.colorVariants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setColorId(v.id)}
                aria-label={v.name}
                className={cn(
                  'h-6 w-6 shrink-0 rounded-full ring-1 ring-white/15 transition',
                  activeColorId === v.id && 'ring-2 ring-catchy ring-offset-2 ring-offset-neutral-900'
                )}
                style={{ backgroundColor: v.hex || '#d1d5db' }}
              />
            ))}
          </div>
        ) : null}

        {sized ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {sizeEntries.map(([s, qty]) => (
              <button
                key={s}
                type="button"
                disabled={qty <= 0}
                onClick={() => quickAddSize(s, qty)}
                className={cn(
                  'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold transition active:scale-95',
                  qty > 0
                    ? 'border-white/10 bg-neutral-800/60 text-neutral-300 hover:border-catchy/50 hover:bg-catchy/10 hover:text-catchy'
                    : 'cursor-not-allowed border-white/5 text-neutral-700 line-through'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={quickAddUnsized}
            disabled={scope.stock <= 0}
            className="mt-0.5 flex h-8 items-center justify-center rounded-lg border border-catchy/25 bg-catchy/10 text-xs font-bold uppercase tracking-wide text-catchy transition active:scale-95 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-neutral-800/60 disabled:text-neutral-600"
          >
            {t('pos.product.addToCart')}
          </button>
        )}

        <p
          className={cn(
            'text-[11px] font-medium',
            scope.stock <= 0 ? 'text-rose-400' : lowStock ? 'text-amber-400' : 'text-neutral-500'
          )}
        >
          {scope.stock > 0 ? t('pos.stock.inStock').replace('{n}', String(scope.stock)) : t('pos.stock.outOfStock')}
        </p>
      </div>
    </div>
  );
};

export default PosProductTile;
