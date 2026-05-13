import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

export interface CatalogProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    images?: string[];
    image?: string;
  };
  /** When set and greater than `price`, shows as sale with strikethrough compare price. */
  compareAtPrice?: number | null;
  saleLabel: string;
  /** Pre-translated line, e.g. "3 colors" */
  colorsLine: string;
}

const CatalogProductCard: React.FC<CatalogProductCardProps> = ({
  product,
  compareAtPrice,
  saleLabel,
  colorsLine,
}) => {
  const imgs = coerceProductImages(product);
  const src = imgs[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
  const onSale = typeof compareAtPrice === 'number' && compareAtPrice > product.price;

  return (
    <article className="group mx-auto w-full max-w-[10.5rem] font-sans sm:max-w-[11.5rem] lg:max-w-[12rem]">
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-[5/6] overflow-hidden rounded-md bg-neutral-100 ring-1 ring-black/[0.04]">
          {onSale && (
            <span className="absolute left-1.5 top-1.5 z-[1] bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              {saleLabel}
            </span>
          )}
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src.startsWith('data:')) return;
              el.onerror = null;
              el.src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
          />
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
          <span className="shrink-0 text-xs font-bold tabular-nums text-catchy-dark sm:text-[13px]">£{product.price}</span>
        </div>
        <div dir="ltr" className="flex flex-row items-center justify-between gap-1.5 text-[11px] leading-tight text-gray-500">
          <span>{colorsLine}</span>
          {onSale && compareAtPrice != null && (
            <span className="tabular-nums text-gray-400 line-through">£{compareAtPrice}</span>
          )}
        </div>
      </div>
    </article>
  );
};

export default CatalogProductCard;
