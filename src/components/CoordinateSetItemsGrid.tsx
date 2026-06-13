import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

export type CoordinateSetItemsGridProps = {
  products: Array<{ id: string; name: string; price?: number; images?: string[]; image?: string }>;
  heading: string;
  isRTL?: boolean;
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
        {products.map((product) => {
          const src = coerceProductImages(product)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
          return (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group overflow-hidden rounded-lg border border-gray-100 bg-white transition hover:border-gray-200 hover:shadow-sm"
            >
              <div className="aspect-square overflow-hidden bg-gray-50">
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  referrerPolicy={isRemoteImageUrl(src) ? 'no-referrer' : undefined}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PRODUCT_IMAGE_PLACEHOLDER;
                  }}
                />
              </div>
              <div className="px-2.5 py-2">
                <p className={cn('line-clamp-2 text-xs font-semibold leading-snug text-gray-900', isRTL && 'font-arabic text-start')}>
                  {product.name}
                </p>
                {Number.isFinite(Number(product.price)) ? (
                  <p className="mt-0.5 text-[11px] font-bold tabular-nums text-gray-500">ILS {product.price}</p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default CoordinateSetItemsGrid;
