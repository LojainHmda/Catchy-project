import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  catalogDisplaySizes,
  type CatalogColorSwatch,
  type CatalogListProduct,
} from '../lib/catalogProductList';
import { isRemoteImageUrl, sanitizeImageSrc } from '../lib/productImages';
import { useLanguage } from '../context/LanguageContext';
import { ProductSaleBadge } from './ProductPriceDisplay';

export interface CatalogProductCardProps {
  product: Pick<CatalogListProduct, 'id' | 'name' | 'price' | 'images' | 'sizes' | 'sizeStock'>;
  compareAtPrice?: number | null;
  discountPercent?: number;
  saleLabel: string;
  colorSwatches?: CatalogColorSwatch[];
  priority?: boolean;
}

const MAX_VISIBLE_SWATCHES = 4;

const CatalogProductCard: React.FC<CatalogProductCardProps> = ({
  product,
  compareAtPrice,
  discountPercent,
  saleLabel,
  colorSwatches,
  priority = false,
}) => {
  const { isRTL } = useLanguage();
  const src = sanitizeImageSrc(product.images?.[0] ?? '');
  const onSale = typeof compareAtPrice === 'number' && compareAtPrice > product.price;
  const swatches = colorSwatches ?? [];
  const visibleSwatches = swatches.slice(0, MAX_VISIBLE_SWATCHES);
  const extraSwatches = swatches.length - visibleSwatches.length;
  const displaySizes = catalogDisplaySizes(product);

  return (
    <article className="group mx-auto w-full max-w-[10.5rem] font-sans sm:max-w-[11.5rem] lg:max-w-[12rem]">
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-[5/6] overflow-hidden rounded-md bg-neutral-100 ring-1 ring-black/[0.04]">
          {onSale && (
            <ProductSaleBadge
              label={saleLabel}
              percent={discountPercent}
              className="left-1.5 top-1.5"
            />
          )}
          {src ? (
            <img
              src={src}
              alt={product.name}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
              referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-neutral-100" aria-hidden />
          )}
        </div>
      </Link>
      <div className="mt-2 space-y-1 px-0">
        <div dir="ltr" className="flex flex-row items-start justify-between gap-1.5">
          <Link
            to={`/product/${product.id}`}
            className="min-w-0 flex-1 text-start text-xs font-bold leading-snug text-catchy-dark transition hover:text-catchy sm:text-[13px]"
          >
            <span dir="auto" className="line-clamp-2 block">
              {product.name}
            </span>
          </Link>
          <span
            className={cn(
              'shrink-0 text-xs font-bold tabular-nums sm:text-[13px]',
              onSale ? 'text-red-600' : 'text-catchy-dark'
            )}
          >
            ILS {product.price}
          </span>
        </div>
        <div dir="ltr" className="flex flex-row items-center justify-between gap-1.5 text-[11px] leading-tight text-gray-500">
          <div className="flex flex-wrap items-center gap-1">
            {visibleSwatches.length > 0 && (
              <span className="flex shrink-0 items-center gap-1">
                <span className="flex items-center -space-x-1">
                  {visibleSwatches.map((swatch, i) => (
                    <span
                      key={`${swatch.name}-${i}`}
                      title={isRTL ? swatch.nameAr || swatch.name : swatch.name}
                      aria-label={isRTL ? swatch.nameAr || swatch.name : swatch.name}
                      className="h-3 w-3 rounded-full ring-1 ring-black/15 ring-offset-1 ring-offset-white"
                      style={{ backgroundColor: swatch.hex }}
                    />
                  ))}
                </span>
                {extraSwatches > 0 && (
                  <span className="text-[9px] font-bold tabular-nums text-gray-400">+{extraSwatches}</span>
                )}
              </span>
            )}
            {displaySizes.map((s) => (
              <span key={s} className="rounded bg-gray-100 px-1 py-px text-[9px] font-bold text-gray-500 leading-tight">
                {s}
              </span>
            ))}
          </div>
          {onSale && compareAtPrice != null && (
            <span className="tabular-nums text-gray-400 line-through">ILS {compareAtPrice}</span>
          )}
        </div>
      </div>
    </article>
  );
};

export default React.memo(CatalogProductCard);
