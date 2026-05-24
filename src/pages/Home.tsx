import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, getDocs, query, orderBy, limit } from '../firebase';
import ProductCard from '../components/ProductCard';
import { CATEGORY_ICONS, CATEGORY_KEYS } from '../constants';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CatalogProductCard from '../components/CatalogProductCard';
import { getCatalogSaleMeta } from '../lib/catalogSale';
import { heroSlideField } from '../lib/heroSlideText';
import {
  type HeroSlide,
  normalizeHeroSlides,
  readCachedHeroSlides,
  subscribeHeroSlides,
} from '../lib/heroSlidesCache';

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    url: 'https://images.unsplash.com/photo-1539109132374-348058a1f7b6?auto=format&fit=crop&q=80&w=2070',
    title: 'hero.title',
    subtitle: 'hero.limited',
  },
  {
    url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2070',
    title: 'hero.slide1.title',
    subtitle: 'hero.slide1.subtitle',
  },
  {
    url: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=2070',
    title: 'hero.slide3.title',
    subtitle: 'hero.slide3.subtitle',
  },
];

/** Shared fixed hero height — both standard and product-showcase slides use the same frame. */
const HERO_SECTION_HEIGHT =
  'h-[clamp(17rem,46svh,27.5rem)] sm:h-[clamp(18.5rem,48svh,31rem)] md:h-[clamp(20rem,50svh,35rem)] lg:h-[clamp(21.5rem,52svh,39rem)]';

const HERO_SLIDE_MS = 6500;
const HERO_KEN_BURNS = ['hero-slide-ken-burns-a', 'hero-slide-ken-burns-b', 'hero-slide-ken-burns-c'] as const;

/** Home #products-grid — classic “Featured collections” icon rings (matches storefront reference layout). */
const HOME_FEATURED_CATEGORIES = [
  'Pants',
  'Tops',
  'Dresses',
  'Skirts',
  'Jackets',
  'Formal Sets',
  'Coordinates',
] as const;

const Home = () => {
  const { t, isRTL, language } = useLanguage();
  const navigate = useNavigate();
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(() => readCachedHeroSlides());
  const [heroSlidesReady, setHeroSlidesReady] = useState(
    () => normalizeHeroSlides(readCachedHeroSlides()).length > 0
  );
  const [allowSlideTransition, setAllowSlideTransition] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [catalogPool, setCatalogPool] = useState<any[]>([]);

  const normSlides = useMemo(() => {
    const list = normalizeHeroSlides(heroSlides);
    if (list.length) return list;
    return heroSlidesReady ? DEFAULT_SLIDES : [];
  }, [heroSlides, heroSlidesReady]);

  const activeSlide = normSlides[currentSlide] ?? normSlides[0];

  useEffect(() => subscribeHeroSlides((slides, ready) => {
    setHeroSlides(slides);
    setHeroSlidesReady(ready);
  }), []);

  useEffect(() => {
    if (normSlides.length === 0) {
      setAllowSlideTransition(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setAllowSlideTransition(true));
    return () => window.cancelAnimationFrame(id);
  }, [normSlides.length]);

  useEffect(() => {
    if (normSlides.length === 0) return;
    normSlides.forEach((slide) => {
      const url = slide.url || slide.image;
      if (!url) return;
      const img = new Image();
      img.src = url;
    });
  }, [normSlides]);

  const heroVisible = normSlides.length > 0;

  useEffect(() => {
    setCurrentSlide((i) => Math.min(i, Math.max(0, normSlides.length - 1)));
  }, [normSlides.length]);

  useEffect(() => {
    if (normSlides.length <= 1) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setCurrentSlide((p) => (p + 1) % normSlides.length);
    }, HERO_SLIDE_MS);
    return () => clearInterval(id);
  }, [normSlides.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        if (cancelled) return;
        const rows = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
        setCatalogPool(rows);
      } catch (e) {
        console.error(e);
        setCatalogPool([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewRailProducts = useMemo(() => catalogPool.slice(0, 4), [catalogPool]);
  const paginate = (dir: number) => {
    setDirection(dir);
    setCurrentSlide((prev) => {
      const len = normSlides.length;
      if (len === 0) return 0;
      let next = prev + dir;
      if (next < 0) next = len - 1;
      if (next >= len) next = 0;
      return next;
    });
  };

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d < 0 ? '100%' : '-100%', opacity: 0 }),
  };

  const heroTitle = (slide: HeroSlide) =>
    heroSlideField(slide, 'title', language, t, 'hero.title');

  const heroSubtitle = (slide: HeroSlide) =>
    heroSlideField(slide, 'subtitle', language, t, 'hero.limited');

  const isProductShowcaseSlide = activeSlide?.type === 'new_arrivals';

  const showcaseProducts = useMemo(() => {
    if (!activeSlide || activeSlide.type !== 'new_arrivals') return [];
    const ids = Array.isArray(activeSlide.productIds)
      ? activeSlide.productIds.filter(Boolean).slice(0, 4)
      : [];
    return ids
      .map((id) => catalogPool.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        ...p,
        category: p.category || 'Tops',
        stock: typeof p.stock === 'number' ? p.stock : 0,
      }));
  }, [activeSlide, catalogPool]);

  return (
    <div className="min-h-screen bg-white text-catchy-dark">
      {/* Hero — capped height so featured categories stay nearer the fold */}
      <section
        className={cn(
          'relative w-full overflow-hidden transition-opacity duration-500',
          HERO_SECTION_HEIGHT,
          heroVisible
            ? 'bg-catchy-dark opacity-100'
            : 'pointer-events-none bg-transparent opacity-0'
        )}
      >
        <div className="absolute inset-0">
          <AnimatePresence initial={false} custom={direction} mode="sync">
            {activeSlide && (
              <motion.div
                key={activeSlide.id ?? `${activeSlide.url?.slice(0, 48)}-${currentSlide}`}
                custom={direction}
                variants={slideVariants}
                initial={allowSlideTransition ? 'enter' : false}
                animate="center"
                exit="exit"
                transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 overflow-hidden"
              >
                <img
                  key={`${activeSlide.id ?? currentSlide}-${activeSlide.url || activeSlide.image}`}
                  src={activeSlide.url || activeSlide.image}
                  alt=""
                  className={cn(
                    'h-full w-full object-cover',
                    HERO_KEN_BURNS[currentSlide % HERO_KEN_BURNS.length]
                  )}
                  referrerPolicy={/^https?:/i.test(activeSlide.url || activeSlide.image || '') ? 'no-referrer' : undefined}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              'linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.15) 38%, rgba(26,26,26,0.25) 62%, rgba(26,26,26,0.75) 100%), radial-gradient(ellipse 90% 60% at 50% 0%, rgba(56,142,93,0.35), transparent 55%)',
          }}
        />

        <div
          className={cn(
            'absolute inset-x-0 z-10 flex flex-col px-5 sm:px-10',
            isProductShowcaseSlide
              ? 'max-sm:top-[7.25rem] max-sm:bottom-[5.5rem] max-sm:justify-center sm:bottom-24 sm:top-[7rem] sm:justify-center'
              : 'bottom-14 top-14 justify-center sm:bottom-16 sm:top-16 md:bottom-20 md:top-20 lg:bottom-28 lg:top-20'
          )}
        >
          <AnimatePresence mode="wait">
            {activeSlide && (
              <motion.div
                key={activeSlide.id ?? currentSlide}
                initial={allowSlideTransition ? { opacity: 0, y: 16 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45 }}
                className={cn(
                  'flex w-full min-h-0 max-sm:flex-1',
                  isProductShowcaseSlide
                    ? 'mx-auto flex max-w-7xl flex-col items-center max-sm:justify-center max-sm:gap-1.5 max-sm:px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-12'
                    : 'max-w-5xl flex-1 items-center justify-center text-center'
                )}
              >
                <div
                  className={cn(
                    'shrink-0',
                    isProductShowcaseSlide &&
                      'w-full max-sm:px-10 max-sm:text-center sm:max-w-md sm:text-start',
                    isProductShowcaseSlide && (isRTL ? 'sm:pr-16' : 'sm:pl-16')
                  )}
                >
                  {!isProductShowcaseSlide && (
                    <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.55em] text-white/85 sm:mb-4 md:text-[11px]">
                      {heroSubtitle(activeSlide)}
                    </p>
                  )}
                  <h1
                    className={cn(
                      'font-light leading-[0.95] tracking-tight text-white drop-shadow-lg',
                      isRTL ? 'font-arabic' : 'font-serif',
                      !isProductShowcaseSlide &&
                        'mb-5 text-center text-5xl sm:mb-7 sm:text-6xl md:mb-8 md:text-7xl lg:text-8xl xl:text-9xl',
                      isProductShowcaseSlide &&
                        'mb-0 whitespace-nowrap text-[1.65rem] max-sm:text-center sm:mb-8 sm:text-start sm:text-7xl'
                    )}
                  >
                    {heroTitle(activeSlide)}
                  </h1>
                  <div
                    className={cn(
                      isProductShowcaseSlide && 'hidden justify-center sm:flex sm:justify-start'
                    )}
                  >
                    <Link
                      to="/catalog"
                      className={cn(
                        'inline-block rounded-full bg-white px-10 py-3.5 font-bold text-catchy-dark shadow-xl transition-transform hover:scale-[1.03] hover:bg-catchy hover:text-white',
                        isRTL
                          ? 'font-arabic text-sm font-semibold tracking-wide'
                          : 'text-[11px] uppercase tracking-[0.35em]'
                      )}
                    >
                      {t('home.shopNow')}
                    </Link>
                  </div>
                </div>

                {isProductShowcaseSlide && (
                  <div className="flex w-full min-w-0 max-sm:shrink-0 max-sm:items-center max-sm:justify-center sm:max-w-[58%] sm:flex-1 sm:items-center sm:justify-center">
                    <div
                      className={cn(
                        'flex w-full items-end justify-center gap-2 max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:px-2 max-sm:no-scrollbar sm:gap-5 sm:overflow-visible',
                        showcaseProducts.length > 3 &&
                          'max-sm:justify-start sm:justify-start sm:overflow-x-auto sm:no-scrollbar',
                        isRTL && 'flex-row-reverse'
                      )}
                    >
                      {showcaseProducts.map((product) => (
                        <div
                          key={`${activeSlide.id}-${product.id}`}
                          className="w-[4.85rem] shrink-0 snap-center max-sm:snap-center sm:w-[7rem]"
                        >
                          <ProductCard product={product} variant="hero" autoPlay />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isProductShowcaseSlide && (
                  <div className="mt-3 flex w-full shrink-0 justify-center max-sm:mt-1 sm:hidden">
                    <Link
                      to="/catalog"
                      className={cn(
                        'inline-block rounded-full bg-white px-9 py-2.5 font-bold text-catchy-dark shadow-xl transition-transform hover:scale-[1.03] hover:bg-catchy hover:text-white',
                        isRTL
                          ? 'font-arabic text-sm font-semibold tracking-wide'
                          : 'text-[11px] uppercase tracking-[0.35em]'
                      )}
                    >
                      {t('home.shopNow')}
                    </Link>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {heroVisible && (
          <div className="absolute inset-y-0 left-2 right-2 z-20 flex items-center justify-between pointer-events-none md:left-6 md:right-6">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => paginate(-1)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-md transition hover:bg-white/20 md:h-12 md:w-12"
            >
              <ChevronLeft className={cn('h-6 w-6', isRTL && 'rotate-180')} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => paginate(1)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-md transition hover:bg-white/20 md:h-12 md:w-12"
            >
              <ChevronRight className={cn('h-6 w-6', isRTL && 'rotate-180')} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {heroVisible && (
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-5 md:bottom-7">
            {normSlides.map((s, i) => (
              <button
                key={s.id ?? `dot-${i}`}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => {
                  setDirection(i > currentSlide ? 1 : -1);
                  setCurrentSlide(i);
                }}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  i === currentSlide ? 'w-9 bg-catchy shadow-[0_0_20px_rgba(56,142,93,0.7)]' : 'w-2 bg-white/35 hover:bg-white/60'
                )}
              />
            ))}
          </div>
        )}
      </section>

      {/* Featured collections — icon grid + editorial heading (classic layout) */}
      <section
        id="products-grid"
        dir={isRTL ? 'rtl' : 'ltr'}
        className="mx-auto max-w-7xl bg-catchy/5 px-5 pb-6 pt-3 sm:pt-5 md:px-10 md:pb-8 md:pt-7"
      >
        <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-12 md:gap-14 lg:gap-20">
          <div className={cn('md:col-span-5 lg:col-span-4', isRTL && 'flex flex-col items-start font-arabic')}>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.45em] text-catchy md:text-[11px]">
              {t('featured.subtitle')}
            </p>
            <h2
              className={cn(
                'font-serif text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl lg:text-6xl',
                isRTL ? 'font-arabic text-catchy-dark' : 'text-catchy-dark'
              )}
            >
              <span className="block">{t('featured.headingLine1')}</span>
              <span className="mt-1 block text-catchy/40 md:mt-2">{t('featured.headingLine2')}</span>
            </h2>
            <div className="mt-6 w-full md:mt-8">
              <Link
                to="/catalog"
                className={cn(
                  'inline-block rounded-full border-2 border-catchy-dark bg-transparent px-10 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-catchy-dark transition hover:bg-catchy-dark hover:text-white',
                  isRTL && 'ml-auto block w-fit font-arabic'
                )}
              >
                {t('hero.cta')}
              </Link>
            </div>
          </div>

          <div className="md:col-span-7 lg:col-span-8">
            <div
              className={cn(
                'grid grid-cols-2 justify-items-center md:grid-cols-4',
                'gap-x-6 gap-y-5 sm:gap-x-10 sm:gap-y-8 md:gap-x-14 md:gap-y-16 lg:gap-x-[4.25rem] lg:gap-y-[4.5rem]'
              )}
            >
              {HOME_FEATURED_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => navigate(`/catalog?category=${encodeURIComponent(cat)}`)}
                    className="group flex w-full max-w-[8.5rem] flex-col items-center text-center"
                  >
                    <div className="mb-3 flex size-[5.75rem] shrink-0 items-center justify-center rounded-full border border-catchy/30 bg-white text-catchy shadow-sm transition group-hover:border-catchy group-hover:bg-catchy/10 group-hover:shadow-md sm:size-[6.75rem] md:size-[7.75rem] lg:size-32">
                      {Icon &&
                        React.createElement(Icon, {
                          className: 'h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11',
                          strokeWidth: 1.1,
                          'aria-hidden': true,
                        })}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-[0.14em] text-catchy/90 transition group-hover:text-catchy sm:text-[11px]',
                        isRTL && 'font-arabic'
                      )}
                    >
                      {t(CATEGORY_KEYS[cat] || cat)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Featured products — horizontal rail → catalog */}
      <section className="border-t border-gray-100 bg-neutral-100 pt-6 pb-14 md:pt-8 md:pb-20">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <div className={cn('mb-8 text-center', isRTL && 'font-arabic')}>
            <h2
              className={cn(
                'text-2xl font-medium tracking-tight text-catchy-dark md:text-3xl',
                isRTL ? 'font-arabic' : 'font-serif'
              )}
            >
              {t('catalog.title')}
            </h2>
          </div>

          <div
            dir="ltr"
            className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-10 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-5 lg:gap-x-6"
          >
            {previewRailProducts.map((product) => {
              const meta = getCatalogSaleMeta(product);
              const colorsLine = t('catalog.colorsCount').replace('{n}', String(meta.nColors));
              return (
                <div key={product.id} className="flex w-full min-w-0 justify-center">
                  <div className="w-full max-w-[10.5rem] sm:max-w-[11.5rem] lg:max-w-[12rem]">
                  <CatalogProductCard
                    product={product}
                    compareAtPrice={meta.compareAt}
                    saleLabel={t('catalog.sale')}
                    colorsLine={colorsLine}
                  />
                  </div>
                </div>
              );
            })}
            <Link
              to="/catalog"
              aria-label={t('catalog.viewAll')}
              className="col-span-2 flex min-h-[14rem] w-full max-w-[12rem] flex-col items-center justify-center justify-self-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white/90 px-3 text-center shadow-sm transition hover:border-catchy hover:bg-white hover:shadow-md sm:col-span-1 sm:max-w-[11.5rem] lg:max-w-[12rem]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-catchy/30 bg-catchy/10 text-catchy">
                <ChevronRight className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[10px] font-bold uppercase leading-snug tracking-[0.2em] text-catchy-dark">{t('catalog.viewAll')}</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
