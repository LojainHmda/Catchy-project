import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { fetchNewArrivalProducts } from '../lib/productTags';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import { catalogDisplaySizes } from '../lib/catalogProductList';
import { resolveProductInventory } from '../lib/productInventory';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { categoryLabel, isSaleCategory } from '../lib/categoriesService';
import { getCategoryIcon } from '../lib/categoryIcons';
import {
  type HeroSlide,
  normalizeHeroSlides,
  readCachedHeroSlides,
  subscribeHeroSlides,
} from '../lib/heroSlidesCache';

const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1539109132374-348058a1f7b6?auto=format&fit=crop&q=80&w=800';
const HERO_VIDEO = '/images/catchy-hero2.mp4';
const DEFAULT_ABOUT_IMAGE =
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=400';

const HERO_MEDIA_CLASS =
  'absolute inset-0 h-full w-full object-cover object-center ' +
  'sm:left-1/2 sm:top-1/2 sm:h-auto sm:w-auto sm:min-h-full sm:min-w-full sm:-translate-x-1/2 sm:-translate-y-1/2';

const HeroMedia = ({
  videoSrc,
  fallbackImage,
  onAspectRatio,
}: {
  videoSrc: string;
  fallbackImage: string;
  onAspectRatio?: (ratio: string) => void;
}) => {
  const [activeSrc, setActiveSrc] = useState(videoSrc);
  const [useFallback, setUseFallback] = useState(false);

  const reportAspectRatio = (width: number, height: number) => {
    if (width > 0 && height > 0) onAspectRatio?.(`${width} / ${height}`);
  };

  // When the admin sets a new video, swap to it; if it fails, fall back to the local default
  useEffect(() => {
    setActiveSrc(videoSrc);
    setUseFallback(false);
  }, [videoSrc]);

  if (useFallback) {
    return (
      <div className="absolute inset-0 overflow-hidden" dir="ltr">
        <img
          src={fallbackImage}
          alt="Hero"
          className={HERO_MEDIA_CLASS}
          onLoad={(e) => {
            const img = e.currentTarget;
            reportAspectRatio(img.naturalWidth, img.naturalHeight);
          }}
          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HERO_IMAGE; }}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden" dir="ltr">
      <video
        src={activeSrc}
        autoPlay
        muted
        loop
        playsInline
        className={HERO_MEDIA_CLASS}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          reportAspectRatio(video.videoWidth, video.videoHeight);
        }}
        onError={() => setUseFallback(true)}
      />
    </div>
  );
};

const Home = () => {
  const { t, isRTL, language } = useLanguage();
  const navigate = useNavigate();
  const isAr = language === 'ar';
  const { visibleCategories } = useStoreCategories();

  const [heroVideoSrc, setHeroVideoSrc] = useState(HERO_VIDEO);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(() => readCachedHeroSlides());
  const [heroSlidesReady, setHeroSlidesReady] = useState(
    () => normalizeHeroSlides(readCachedHeroSlides()).length > 0
  );
  const [newArrivals, setNewArrivals] = useState<any[]>([]);
  const [newArrivalsReady, setNewArrivalsReady] = useState(false);
  const [heroAspect, setHeroAspect] = useState('16 / 9');

  const normSlides = useMemo(() => normalizeHeroSlides(heroSlides), [heroSlides]);
  const heroImage = normSlides[0]?.url || normSlides[0]?.image || DEFAULT_HERO_IMAGE;

  useEffect(() => {
    const ref = doc(db, 'site_settings', 'hero');
    return onSnapshot(
      ref,
      (snap) => {
        const url = snap.exists() ? (snap.data().videoUrl as string | null) : null;
        setHeroVideoSrc(url && url.trim() ? url : HERO_VIDEO);
      },
      () => { /* Firestore error — keep the local default video */ }
    );
  }, []);

  useEffect(() => subscribeHeroSlides((slides, ready) => {
    setHeroSlides(slides);
    setHeroSlidesReady(ready);
  }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchNewArrivalProducts(db);
        if (!cancelled) setNewArrivals(list);
      } catch (err) {
        console.error('Could not load new arrivals:', err);
      } finally {
        if (!cancelled) setNewArrivalsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="min-h-screen overflow-x-hidden pb-24 sm:pb-0"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-on-surface)' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Hero ── */}
      <section
        className="hero-section relative w-full max-w-full overflow-hidden sm:h-[90svh]"
        style={{ '--hero-ar': heroAspect } as React.CSSProperties}
      >
        {/* Full-screen video */}
        <HeroMedia
          videoSrc={heroVideoSrc}
          fallbackImage={heroImage}
          onAspectRatio={setHeroAspect}
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Text content — extra bottom padding on mobile so CTA clears the pulled-up arrivals card */}
        <div className="absolute inset-0 flex flex-col items-center justify-end px-5 pb-16 text-center sm:pb-20">
          <h1
            className={cn('text-4xl leading-tight mb-3 text-white drop-shadow-lg', isAr ? 'font-arabic' : '')}
            style={!isAr ? { fontFamily: 'var(--font-display)' } : undefined}
          >
            {isAr ? 'أزياء تعكس شخصيتك' : 'Fashion That Reflects You'}
          </h1>

          <p
            className="text-sm text-white/80 mb-8 max-w-[280px] leading-relaxed"
            style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
          >
            {isAr
              ? 'قطع مختارة بعناية لتمنحك إطلالة راقية ومريحة كل يوم.'
              : 'Carefully curated pieces for an elegant, comfortable look every day.'}
          </p>

          <Link
            to="/catalog"
            className="bg-white text-primary px-12 py-3.5 text-sm font-medium tracking-wider hover:bg-primary hover:text-white transition-colors active:scale-95 transition-transform inline-block"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {isAr ? 'تسوقي الآن' : t('home.shopNow')}
          </Link>
        </div>
      </section>

      {/* ── Latest Arrivals (only real tagged products — no stock placeholders) ── */}
      {newArrivalsReady && newArrivals.length > 0 ? (
      <section className="relative z-10 -mt-5 bg-surface px-5 pt-10 mb-12 sm:-mt-16">
        <h2
          className={cn('text-xl text-primary text-center mb-8', isAr ? 'font-arabic' : '')}
          style={!isAr ? { fontFamily: 'var(--font-display)' } : undefined}
        >
          {isAr ? 'وصل حديثاً' : 'Latest Arrivals'}
        </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 max-w-5xl mx-auto">
            {newArrivals.slice(0, 6).map((product) => {
              const image = coerceProductImages(product)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
              const { sizeStock } = resolveProductInventory(product);
              const displaySizes = catalogDisplaySizes({ sizeStock, sizes: product.sizes });
              return (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group block overflow-hidden rounded-2xl bg-white p-1.5 ring-1 ring-black/5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-primary/30"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-container">
                  <img
                    src={image}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div className="px-1.5 pb-1 pt-2">
                  <p
                    className={cn('truncate text-sm font-medium text-on-surface', isAr ? 'font-arabic text-right' : '')}
                    style={!isAr ? { fontFamily: 'var(--font-display)' } : undefined}
                  >
                    {product.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-primary" style={{ fontFamily: 'var(--font-body)' }}>
                      {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 0 })} ILS
                    </span>
                    {displaySizes.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {displaySizes.map((s) => (
                          <span key={s} className="rounded bg-surface-container px-1 py-px text-[9px] font-bold text-on-surface-variant leading-tight">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
            })}
          </div>
      </section>
      ) : null}

      {/* ── Browse all + Category icons (merged green panel) ── */}
      <section className="bg-primary mb-12 pt-8 pb-10">
        <div className="flex justify-center mb-9">
          <Link
            to="/catalog"
            className="rounded-full border border-on-primary/40 px-10 py-2.5 text-on-primary text-sm font-medium tracking-wide hover:bg-white/10 active:scale-95 transition-all duration-300"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {isAr ? 'عرض كل المنتجات' : t('catalog.viewAll')}
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-x-3 gap-y-8 px-5">
          {visibleCategories.map((cat) => {
            const Icon = getCategoryIcon(cat.icon);
            return (
              <button
                key={cat.id}
                onClick={() =>
                  navigate(
                    isSaleCategory(cat)
                      ? '/catalog?sale=1'
                      : `/catalog?category=${encodeURIComponent(cat.id)}`
                  )
                }
                className="flex flex-col items-center gap-2.5 group"
              >
                <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 group-hover:bg-white/15 group-hover:-translate-y-0.5 group-active:scale-95 transition-all duration-300">
                  <Icon
                    className="h-8 w-8 text-on-primary drop-shadow-[0_1px_4px_rgba(255,255,255,0.25)] group-hover:drop-shadow-[0_1px_7px_rgba(255,255,255,0.45)] transition-all duration-300"
                    strokeWidth={1.3}
                    aria-hidden
                  />
                </span>
                <span
                  className={cn('text-[11px] text-on-primary text-center leading-tight', isAr ? 'font-arabic' : '')}
                  style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
                >
                  {categoryLabel(cat, isAr)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── About ── */}
      <section className="px-5 mb-12">
        <div className="flex flex-col items-center text-center">
          <div className="w-36 mb-8 shadow-md mx-auto">
            <div className="arch-container bg-surface-container">
              <img
                src={DEFAULT_ABOUT_IMAGE}
                alt="About Catchy"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <h2
            className="text-xl text-primary mb-4 tracking-widest"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            CATCHY
          </h2>

          <p
            className={cn('text-on-surface-variant max-w-xs leading-loose mb-8 text-base', isAr ? 'font-arabic' : '')}
            style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
          >
            {isAr
              ? 'نؤمن أن الأناقة ليست في الموضة فقط، بل في التفاصيل التي تلامس شخصيتك. نختار لك قطعاً تواكب ذوقك وتمنحك الراحة والثقة.'
              : 'We believe elegance is not just in fashion, but in the details that touch your personality.'}
          </p>

          <Link
            to="/catalog"
            className="border border-primary text-primary px-8 py-3 text-sm font-medium hover:bg-primary hover:text-on-primary transition-colors"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {isAr ? 'تعرفي علينا' : 'About Us'}
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
