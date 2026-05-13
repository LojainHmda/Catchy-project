import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, getDocs, query, orderBy, limit, onSnapshot } from '../firebase';
import ProductCard from '../components/ProductCard';
import ShopCategoryGrid from '../components/ShopCategoryGrid';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import CatalogProductCard from '../components/CatalogProductCard';
import { getCatalogSaleMeta } from '../lib/catalogSale';

interface HeroSlide {
  id?: string;
  url?: string;
  image?: string;
  title?: string;
  subtitle?: string;
  type?: 'new_arrivals' | 'standard';
  order?: number;
  /** When false, slide is hidden on the storefront (admin can re-enable). */
  enabled?: boolean;
  /** For `new_arrivals` slides: product IDs to show in the hero strip (max 4). */
  productIds?: string[];
}

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

const Home = () => {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [catalogPool, setCatalogPool] = useState<any[]>([]);

  const normSlides = useMemo(() => {
    const list = heroSlides
      .filter((s) => s.enabled !== false)
      .filter((s) => {
        const hasBg = !!(s.url || s.image);
        if (!hasBg) return false;
        return true;
      })
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    return list.length ? list : DEFAULT_SLIDES;
  }, [heroSlides]);

  const activeSlide = normSlides[currentSlide] ?? normSlides[0];

  useEffect(() => {
    const heroQ = query(collection(db, 'hero_slides'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      heroQ,
      (snapshot) => {
        const fetched: HeroSlide[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(typeof doc.data === 'function' ? doc.data() : {}),
        })) as HeroSlide[];
        setHeroSlides(fetched);
      },
      () => setHeroSlides([])
    );
    return () => unsubscribe();
  }, [isRTL]);

  useEffect(() => {
    setCurrentSlide((i) => Math.min(i, Math.max(0, normSlides.length - 1)));
  }, [normSlides.length]);

  useEffect(() => {
    if (normSlides.length <= 1) return;
    const id = window.setInterval(() => {
      setDirection(1);
      setCurrentSlide((p) => (p + 1) % normSlides.length);
    }, 6500);
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

  const looksLikeI18nKey = (s?: string) => !!s && /^[a-z][a-z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(s);

  const heroTitle = (slide: HeroSlide) => {
    if (slide.type === 'new_arrivals') return t('home.newArrivals');
    const raw = slide.title?.trim();
    if (!raw) return t('hero.title');
    return looksLikeI18nKey(raw) ? t(raw) : raw;
  };

  const heroSubtitle = (slide: HeroSlide) => {
    const raw = slide.subtitle?.trim();
    if (!raw) return t('hero.limited');
    return looksLikeI18nKey(raw) ? t(raw) : raw;
  };

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
      {/* Hero — full-viewport slider (Velora-style) */}
      <section className="relative min-h-[100svh] w-full overflow-hidden bg-catchy-dark">
        <div className="absolute inset-0">
          <AnimatePresence initial={false} custom={direction} mode="sync">
            {activeSlide && (
              <motion.div
                key={activeSlide.id ?? `${activeSlide.url?.slice(0, 48)}-${currentSlide}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0"
              >
                <img
                  key={activeSlide.url || activeSlide.image || String(currentSlide)}
                  src={activeSlide.url || activeSlide.image}
                  alt=""
                  className="h-full w-full scale-105 object-cover"
                  referrerPolicy={/^https?:/i.test(activeSlide.url || activeSlide.image || '') ? 'no-referrer' : undefined}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_SLIDES[0].url!;
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
            'relative z-10 flex min-h-[100svh] flex-col justify-center px-5 pb-28 pt-28 md:px-10',
            isProductShowcaseSlide
              ? 'items-stretch gap-10 lg:flex-row lg:items-center lg:gap-14'
              : 'items-center text-center'
          )}
        >
          <AnimatePresence mode="wait">
            {activeSlide && (
              <motion.div
                key={activeSlide.id ?? currentSlide}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45 }}
                className={cn(
                  'w-full',
                  isProductShowcaseSlide
                    ? 'mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-16'
                    : 'max-w-5xl text-center'
                )}
              >
                <div className={cn('shrink-0', isProductShowcaseSlide && 'lg:max-w-md lg:text-start')}>
                  <p
                    className={cn(
                      'mb-5 text-[10px] font-bold uppercase tracking-[0.55em] text-white/85 md:text-[11px]',
                      !isProductShowcaseSlide && 'text-center',
                      isProductShowcaseSlide && 'lg:text-start'
                    )}
                  >
                    {heroSubtitle(activeSlide)}
                  </p>
                  <h1
                    className={cn(
                      'mb-8 text-5xl font-light leading-[0.95] tracking-tight text-white drop-shadow-lg sm:text-6xl md:text-7xl lg:text-8xl',
                      isRTL ? 'font-arabic' : 'font-serif',
                      !isProductShowcaseSlide && 'mb-10 text-center xl:text-9xl',
                      isProductShowcaseSlide && 'lg:mb-10'
                    )}
                  >
                    {heroTitle(activeSlide)}
                  </h1>
                  <div className={cn(isProductShowcaseSlide && 'flex justify-center lg:justify-start')}>
                    <Link
                      to="/catalog"
                      className="inline-block rounded-full bg-white px-10 py-3.5 text-[11px] font-bold uppercase tracking-[0.35em] text-catchy-dark shadow-xl transition-transform hover:scale-[1.03] hover:bg-catchy hover:text-white"
                    >
                      {t('home.shopNow')}
                    </Link>
                  </div>
                </div>

                {isProductShowcaseSlide && (
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'flex gap-4 overflow-x-auto pb-2 no-scrollbar md:gap-6',
                        isRTL && 'flex-row-reverse',
                        showcaseProducts.length === 0 && 'min-h-[13rem] md:min-h-[15rem]'
                      )}
                    >
                      {showcaseProducts.map((product) => (
                        <div
                          key={`${activeSlide.id}-${product.id}`}
                          className="w-[9.5rem] shrink-0 sm:w-40 md:w-44"
                        >
                          <ProductCard product={product} variant="hero" autoPlay />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute inset-y-0 left-2 right-2 z-20 flex items-center justify-between md:left-6 md:right-6 pointer-events-none">
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

        <div className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 gap-2">
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
      </section>

      {/* Shop by category — same grid as Catalog; links into filtered catalog */}
      <section id="products-grid" className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <div className={cn('text-center', isRTL && 'font-arabic')}>
          <h2 className="font-sans text-3xl font-medium tracking-tight text-catchy-dark md:text-4xl">
            {t('catalog.shopByCategory')}
          </h2>
          <p
            className={cn(
              'mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-gray-500 md:text-base',
              isRTL && 'font-arabic'
            )}
          >
            {t('catalog.subtitle')}
          </p>
        </div>

        <ShopCategoryGrid
          className="mt-10"
          products={catalogPool}
          onSelectTile={(cat) => navigate(`/catalog?category=${encodeURIComponent(cat)}`)}
          showViewAll
          onViewAll={() => navigate('/catalog')}
        />

        <div className="mt-14 flex justify-center">
          <Link
            to="/catalog"
            className="rounded-full border-2 border-catchy-dark bg-transparent px-10 py-3 text-[11px] font-bold uppercase tracking-[0.3em] text-catchy-dark transition hover:bg-catchy-dark hover:text-white"
          >
            {t('hero.cta')}
          </Link>
        </div>
      </section>

      {/* Featured products — horizontal rail → catalog */}
      <section className="border-t border-gray-100 bg-neutral-100 py-14 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-10">
          <div className={cn('mb-8 text-center', isRTL && 'font-arabic')}>
            <h2 className="font-serif text-2xl font-medium tracking-tight text-catchy-dark md:text-3xl">{t('catalog.title')}</h2>
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
