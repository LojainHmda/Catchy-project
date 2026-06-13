import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';
import CoordinateImageCollage from './CoordinateImageCollage';
import { getCoordinateImages } from '../lib/coordinateImages';
import { resolveCoordinate, type ProductLike } from '../lib/coordinateResolve';
import { ProductSaleBadge } from './ProductPriceDisplay';
import type { CoordinateLook } from '../types/coordinates';

export type CoordinateCatalogCardProps = {
  look: CoordinateLook;
  linkedProducts?: ProductLike[];
  isRTL?: boolean;
};

const CoordinateCatalogCard: React.FC<CoordinateCatalogCardProps> = ({
  look,
  linkedProducts = [],
  isRTL: isRTLProp,
}) => {
  const { language, isRTL: ctxRTL, t } = useLanguage();
  const isRTL = isRTLProp ?? ctxRTL;
  const isAr = language === 'ar';
  const images = getCoordinateImages(look, linkedProducts);
  const title = isAr && look.titleAr ? look.titleAr : look.title;
  const resolved = resolveCoordinate(look, linkedProducts);
  const price = resolved?.price ?? 0;
  const onSale = resolved?.onSale ?? false;
  const sizes = resolved?.sizes ?? [];

  return (
    <article className="group mx-auto w-full max-w-[10.5rem] font-sans sm:max-w-[11.5rem] lg:max-w-[12rem]">
      <Link to={`/coordinate/${look.id}`} className="block">
        <div className="relative overflow-hidden rounded-md ring-1 ring-black/[0.04]">
          {onSale && resolved ? (
            <ProductSaleBadge label={t('catalog.sale')} percent={resolved.discountPercent} className="left-1.5 top-1.5 z-[2]" />
          ) : null}
          <CoordinateImageCollage images={images} variant="card" />
        </div>
      </Link>
      <div className="mt-2 space-y-1 px-0">
        <div dir="ltr" className="flex flex-row items-start justify-between gap-1.5">
          <Link
            to={`/coordinate/${look.id}`}
            className={cn(
              'min-w-0 flex-1 text-start text-xs font-bold leading-snug text-catchy-dark transition hover:text-catchy sm:text-[13px]',
              isRTL && 'font-arabic'
            )}
          >
            <span dir="auto" className="line-clamp-2 block">{title}</span>
          </Link>
          <span className={cn('shrink-0 text-xs font-bold tabular-nums sm:text-[13px]', onSale ? 'text-red-600' : 'text-catchy-dark')}>
            ILS {price}
          </span>
        </div>
        <div dir="ltr" className="flex flex-row flex-wrap items-center gap-0.5 text-[11px] text-gray-500">
          {sizes.slice(0, 4).map((s) => (
            <span key={s} className="rounded bg-gray-100 px-1 py-px text-[9px] font-bold text-gray-500">{s}</span>
          ))}
          {sizes.length > 4 ? <span className="text-[9px] text-gray-400">+{sizes.length - 4}</span> : null}
          {onSale && resolved?.compareAtPrice != null ? (
            <span className="ms-auto tabular-nums text-gray-400 line-through">ILS {resolved.compareAtPrice}</span>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default CoordinateCatalogCard;
