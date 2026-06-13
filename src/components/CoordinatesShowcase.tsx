import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import { getCatalogSaleMeta } from '../lib/catalogSale';
import { isLookVisibleToCustomers } from '../lib/coordinatesValidation';
import type { CoordinateLook } from '../types/coordinates';

export type CoordinatesShowcaseProps = {
  looks: CoordinateLook[];
  productsById?: Record<string, { id: string; name: string; price: number; compareAtPrice?: number; onSale?: boolean; sale?: boolean; images?: string[] }>;
  /** Admin preview: show hidden looks with a badge */
  includeUnpublished?: boolean;
  isPreview?: boolean;
  className?: string;
};

const CoordinatesShowcase: React.FC<CoordinatesShowcaseProps> = ({
  looks,
  productsById = {},
  includeUnpublished = false,
  isPreview = false,
  className,
}) => {
  const { t, isRTL, language } = useLanguage();
  const isAr = language === 'ar';

  const visibleLooks = useMemo(() => {
    if (includeUnpublished) {
      return looks.filter((l) => (l.image?.trim().length ?? 0) > 12 || l.title?.trim());
    }
    return looks.filter((l) => isLookVisibleToCustomers(l));
  }, [looks, includeUnpublished]);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm',
        isPreview && 'pointer-events-none select-none',
        className
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
      aria-label={t('coordinates.sectionLabel')}
    >
      {isPreview ? (
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('cat.coordinates')}</span>
          <span className="rounded-full bg-catchy px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            {t('coordinates.livePreview')}
          </span>
        </div>
      ) : null}

      {visibleLooks.length > 0 ? (
        <div className="grid gap-px bg-gray-100 sm:grid-cols-2 lg:grid-cols-3">
          {visibleLooks.map((look, index) => {
            const title = isAr && look.titleAr ? look.titleAr : look.title;
            const tagline = isAr && look.taglineAr ? look.taglineAr : look.tagline;
            const isHidden = !isLookVisibleToCustomers(look);
            const linkedProducts = (look.productIds ?? [])
              .map((id) => productsById[id])
              .filter(Boolean);

            return (
              <motion.article
                key={look.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.35 }}
                className={cn(
                  'group relative flex flex-col bg-white',
                  isHidden && includeUnpublished && 'opacity-75 ring-2 ring-amber-300 ring-inset'
                )}
              >
                {isHidden && includeUnpublished ? (
                  <span className="absolute left-2 top-2 z-[2] rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    {t('coordinates.hiddenBadge')}
                  </span>
                ) : null}
                <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                  <img
                    src={look.image}
                    alt={title}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-90 transition group-hover:from-black/80" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className={cn('text-lg font-bold text-white', isAr && 'font-arabic')}>{title}</p>
                    {tagline ? (
                      <p className={cn('mt-0.5 text-xs text-white/80 line-clamp-2', isAr && 'font-arabic')}>
                        {tagline}
                      </p>
                    ) : null}
                  </div>
                </div>

                {linkedProducts.length > 0 ? (
                  <div className="border-t border-gray-100 p-3">
                    <p className={cn('mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400', isAr && 'font-arabic')}>
                      {t('coordinates.shopTheLook')}
                    </p>
                    <ul className="space-y-1.5">
                      {linkedProducts.map((product) => {
                        const sale = getCatalogSaleMeta(product);
                        const thumb = coerceProductImages(product)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
                        return (
                          <li key={product.id}>
                            <Link
                              to={`/product/${product.id}`}
                              className="flex items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-catchy/5"
                            >
                              <div className="h-10 w-8 shrink-0 overflow-hidden rounded-md bg-gray-100">
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={cn('truncate text-xs font-semibold text-catchy-dark', isAr && 'font-arabic')}>
                                  {product.name}
                                </p>
                                <p className={cn('text-[11px] tabular-nums', sale.onSale ? 'text-red-600' : 'text-gray-500')}>
                                  ILS {product.price}
                                  {sale.onSale && sale.compareAt ? (
                                    <span className="ms-1 text-gray-400 line-through">ILS {sale.compareAt}</span>
                                  ) : null}
                                </p>
                              </div>
                              <ArrowUpRight size={14} className="shrink-0 text-gray-300 transition group-hover:text-catchy" />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : (
                  <div className="border-t border-dashed border-gray-200 px-4 py-3">
                    <p className={cn('text-xs text-gray-400', isAr && 'font-arabic')}>{t('coordinates.noProductsLinked')}</p>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      ) : (
        <div className="px-6 py-10 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className={cn('text-sm font-semibold text-gray-700', isAr && 'font-arabic')}>
            {t('coordinates.emptyTitle')}
          </p>
          <p className={cn('mt-1 text-xs text-gray-500', isAr && 'font-arabic')}>{t('coordinates.emptyHint')}</p>
        </div>
      )}
    </section>
  );
};

export default CoordinatesShowcase;
