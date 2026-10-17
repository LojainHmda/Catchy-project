import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import { cloudinaryTransform } from '../lib/cloudinaryTransform';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { resolveVariantSelection } from '../lib/productVariants';
import { hasSizedInventory, sortedSizeStockEntries, stockForSelection } from '../lib/productInventory';

export type CoordinateSetItemsGridProps = {
  products: Array<Record<string, unknown> & { id: string; name: string; price?: number; images?: string[]; image?: string }>;
  heading: string;
  isRTL?: boolean;
};

const QuickAddItem: React.FC<{
  product: CoordinateSetItemsGridProps['products'][number];
  isRTL?: boolean;
}> = ({ product, isRTL }) => {
  const { addToCart, openCart } = useCart();
  const { t } = useLanguage();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selection = useMemo(() => resolveVariantSelection(product, null), [product]);
  const sized = hasSizedInventory(selection.sizeStock);
  const sizes = useMemo(
    () => (sized ? sortedSizeStockEntries(selection.sizeStock, { includeZero: false }).map(([size]) => size) : []),
    [sized, selection.sizeStock]
  );
  const stock = stockForSelection(selection.sizeStock, selection.stock, selectedSize);
  const outOfStock = sized ? sizes.length === 0 : selection.stock <= 0;
  const canAdd = sized ? Boolean(selectedSize) && stock > 0 : selection.stock > 0;

  const src = coerceProductImages(product)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;

  const handleAdd = () => {
    if (outOfStock) return;
    if (sized && !selectedSize) {
      toast.error(t('product.sizeRequired'));
      return;
    }
    setIsAdding(true);
    addToCart(product, 1, selectedSize, selection.variant?.id ?? null, selection.variant?.name ?? null);
    openCart();
    setTimeout(() => setIsAdding(false), 600);
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-gray-100 bg-white transition hover:border-gray-200 hover:shadow-sm">
      <Link to={`/product/${product.id}`} className="block">
        <div className="aspect-square overflow-hidden bg-gray-50">
          <img
            src={cloudinaryTransform(src, { width: 200, height: 200 })}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
            onError={(e) => {
              (e.target as HTMLImageElement).src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
          />
        </div>
        <div className="px-2.5 pt-2">
          <p className={cn('line-clamp-2 text-xs font-semibold leading-snug text-gray-900', isRTL && 'font-arabic text-start')}>
            {product.name}
          </p>
          {Number.isFinite(Number(product.price)) ? (
            <p className="mt-0.5 text-[11px] font-bold tabular-nums text-gray-500">ILS {product.price}</p>
          ) : null}
        </div>
      </Link>

      <div className="mt-1.5 px-2.5 pb-2.5">
        {sized && sizes.length > 0 && (
          <div className={cn('mb-1.5 flex flex-wrap gap-1', isRTL && 'flex-row-reverse')}>
            {sizes.map((size) => {
              const active = selectedSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedSize(active ? null : size)}
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-bold transition',
                    active
                      ? 'border-catchy bg-catchy text-white'
                      : 'border-gray-200 text-gray-500 hover:border-catchy/40'
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          disabled={outOfStock || isAdding}
          onClick={handleAdd}
          className={cn(
            'inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition',
            outOfStock
              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
              : 'bg-catchy text-white hover:bg-catchy-dark',
            isRTL && 'font-arabic'
          )}
        >
          {isAdding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ShoppingCart className="h-3 w-3" aria-hidden />
          )}
          {outOfStock ? t('product.outOfStock') : t('product.addToCart')}
        </button>
        {sized && !selectedSize && !outOfStock ? (
          <p className={cn('mt-1 text-center text-[9px] text-gray-400', isRTL && 'font-arabic')}>
            {t('product.selectSize')}
          </p>
        ) : null}
      </div>
    </div>
  );
};

const CoordinateSetItemsGrid: React.FC<CoordinateSetItemsGridProps> = ({ products, heading, isRTL }) => {
  if (products.length === 0) return null;

  return (
    <section className="mt-10 border-t border-gray-100 pt-8">
      <h2
        className={cn(
          'mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400',
          isRTL && 'font-arabic text-start'
        )}
      >
        {heading}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
        {products.map((product) => (
          <QuickAddItem key={product.id} product={product} isRTL={isRTL} />
        ))}
      </div>
    </section>
  );
};

export default CoordinateSetItemsGrid;
