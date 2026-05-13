import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db, collection, getDocs, query, where, limit, orderBy, onSnapshot } from '../firebase';
import ProductCard from '../components/ProductCard';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';

interface HeroSlide {
  id?: string;
  url?: string;
  image?: string;
  title?: string;
  subtitle?: string;
  type?: 'new_arrivals' | 'standard';
  order?: number;
}

const slides: HeroSlide[] = [
  {
    url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2070",
    title: "Welcome to Catchy",
    subtitle: "Your Style, Refined"
  },
  {
    url: "https://images.unsplash.com/photo-1539109132374-348058a1f7b6?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide1.title",
    subtitle: "hero.slide1.subtitle"
  },
  {
    url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide2.title",
    subtitle: "hero.slide2.subtitle"
  },
  {
    url: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide3.title",
    subtitle: "hero.slide3.subtitle"
  },
  {
    url: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=2070",
    title: "hero.slide4.title",
    subtitle: "hero.slide4.subtitle"
  }
];

const FALLBACK_NEW_ARRIVALS = [
  {
    id: '1',
    name: 'Classic Hat',
    price: 45,
    images: [
      'https://images.unsplash.com/photo-1514327605112-b887c0e61c0a?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1490210086335-51f759600139?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1512374382149-4332c6c02151?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'Accessories'
  },
  {
    id: '2',
    name: 'Mini Wallet',
    price: 35,
    images: [
      'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=600'
    ],
    category: 'Accessories'
  },
  {
    id: '3',
    name: 'Belt Bag',
    price: 85,
    images: [
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1616239145371-59a531d09b6a?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1000'
    ],
    category: 'Bags'
  },
  {
    id: '4',
    name: 'Leather Shoes',
    price: 120,
    images: [
      'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1512374382149-4332c6c02151?auto=format&fit=crop&q=80&w=600',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000'
    ],
    category: 'Shoes'
  }
];

const categories = ["Pants", "Tops", "Dresses", "Skirts", "Jackets", "Formal Sets", "Coordinates"];

const Home = () => {
  const { language, t, isRTL } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeTab, setActiveTab] = useState(categories[0]);
  const [tabProducts, setTabProducts] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(true);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const heroQ = query(collection(db, 'hero_slides'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(heroQ, (snapshot) => {
      const fetchedHero: HeroSlide[] = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      let finalHeroSlides = fetchedHero;
      if (finalHeroSlides.length === 0) {
        // Fallback to static slides if collection is empty
        finalHeroSlides = slides;
      }
      setHeroSlides(finalHeroSlides);
    }, (error) => {
      console.error('Error fetching hero slides:', error);
      setHeroSlides([{ type: 'new_arrivals', url: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=2070" }, ...slides]);
    });

    return () => unsubscribe();
  }, [isRTL]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch a large pool of products to extract real images
        const allProductsQuery = query(collection(db, 'products'), limit(50));
        const allSnapshot = await getDocs(allProductsQuery);
        
        let allProducts: any[] = [];
        if (!allSnapshot.empty) {
          allProducts = allSnapshot.docs.map(doc => {
            const data = typeof doc.data === 'function' ? doc.data() : (doc as any).data;
            return { id: doc.id, ...data };
          });
        }

        const sourcePool = allProducts.length > 0 ? allProducts : FALLBACK_NEW_ARRIVALS;
        
        // Extract all unique real images from the pool - Deep recursive search
        const extractImages = (obj: any): string[] => {
          const urls: string[] = [];
          const seen = new Set();
          
          const walk = (item: any) => {
            if (!item || seen.has(item)) return;
            if (typeof item === 'object') seen.add(item);

            if (typeof item === 'string') {
              if ((item.startsWith('http') || item.startsWith('data:') || item.startsWith('/')) && item.length > 10) {
                urls.push(item);
              }
            } else if (Array.isArray(item)) {
              item.forEach(walk);
            } else if (typeof item === 'object') {
              Object.values(item).forEach(walk);
            }
          };
          
          walk(obj);
          return urls;
        };

        const allImagesPool = Array.from(new Set(sourcePool.flatMap(extractImages)))
          .filter(img => img.length > 10);

        // 3. Setup New Arrivals products
        // Sort by date manually
        const sortedProducts = [...allProducts].sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });

        let productsForCarousel = sortedProducts.slice(0, 8);
        if (productsForCarousel.length === 0) {
          productsForCarousel = FALLBACK_NEW_ARRIVALS;
        }

        // Ensure we always have at least 4 base products for the UI slots
        let baseProducts = [...productsForCarousel];
        if (baseProducts.length > 0 && baseProducts.length < 4) {
          while (baseProducts.length < 4) baseProducts = [...baseProducts, ...productsForCarousel];
        }
        baseProducts = baseProducts.slice(0, 4);

        // Enrich each carousel product with real images from the pool
        const enrichedArrivals = baseProducts.map((p, idx) => {
          // Get all images related to this product specifically first
          let currentImages = extractImages(p);

          // Force the 3rd card (idx 2) to have a diverse set of real images from the global pool
          if (idx === 2 || currentImages.length < 2) {
            const extra = allImagesPool
              .filter(img => !currentImages.includes(img))
              .sort(() => 0.5 - Math.random());
            currentImages = Array.from(new Set([...currentImages, ...extra.slice(0, 5)]));
          }

          // Last resort fallbacks if still empty
          if (currentImages.length < 2) {
            currentImages = Array.from(new Set([...currentImages, ...FALLBACK_NEW_ARRIVALS[idx % 4].images]));
          }

          return {
            ...p,
            images: currentImages.slice(0, 8)
          };
        });

        setNewArrivals(enrichedArrivals);
      } catch (error) {
        console.error('Error fetching home data:', error);
        setNewArrivals(FALLBACK_NEW_ARRIVALS);
        setHeroSlides([{ type: 'new_arrivals', url: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=2070" }, ...slides]);
      }
    };

    fetchData();
  }, [isRTL]);

  // Auto-scroll the New Arrivals carousel of cards with seamless looping
  useEffect(() => {
    if (!newArrivalsRef.current || newArrivals.length === 0) return;
    
    const container = newArrivalsRef.current;
    
    const interval = setInterval(() => {
      if (!container) return;
      
      const cardWidth = 320; // Basic card width + gap
      const scrollAmount = isRTL ? -cardWidth : cardWidth;
      const maxScroll = container.scrollWidth - container.clientWidth;
      const currentScroll = Math.abs(container.scrollLeft);
      
      // If we are at the end, jump back instantly, then scroll smoothly
      if (currentScroll >= maxScroll - 60) {
        container.scrollTo({ left: 0, behavior: 'instant' as any });
        // After instant jump, briefly wait and do the first step
        setTimeout(() => {
          container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }, 50);
      } else {
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }, 4000); 
    
    return () => clearInterval(interval);
  }, [newArrivals, isRTL]);

  useEffect(() => {
    const fetchTabProducts = async () => {
      setLoadingTabs(true);
      console.log('Fetching products for category:', activeTab);
      try {
        const q = query(
          collection(db, 'products'),
          where('category', '==', activeTab),
          limit(4)
        );
        const snapshot = await getDocs(q);
        console.log('Snapshot empty:', snapshot.empty, 'Docs count:', snapshot.size);
        if (!snapshot.empty) {
          setTabProducts(snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
        } else {
          setTabProducts([]);
        }
      } catch (error) {
        console.error('Error fetching tab products:', error);
      } finally {
        setLoadingTabs(false);
      }
    };
    fetchTabProducts();
  }, [activeTab]);

  const newArrivalsRef = useRef<HTMLDivElement>(null);

  const [direction, setDirection] = useState(0);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0
    })
  };

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentSlide((prev) => {
      let next = prev + newDirection;
      if (next < 0) next = heroSlides.length - 1;
      if (next >= heroSlides.length) next = 0;
      return next;
    });
  };

  const activeSlide = heroSlides[currentSlide];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Carousel Section */}
      <section className="relative h-[80vh] min-h-[600px] w-full overflow-hidden bg-black text-white">
        {/* Carousel Images */}
        <div className="absolute inset-0">
          <AnimatePresence initial={false} custom={direction}>
            {activeSlide && (
              <motion.div
                key={currentSlide}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.5 }
                }}
                className="absolute inset-0"
              >
                <img
                  src={activeSlide.url || activeSlide.image}
                  alt={t(activeSlide.title || '')}
                  className="w-full h-full object-cover zoom-effect"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2070";
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute inset-0 hero-overlay"></div>

        {/* Navigation Arrows */}
        <div className="absolute inset-0 flex items-center justify-between px-4 md:px-8 z-40 pointer-events-none">
          <button 
            onClick={() => paginate(-1)}
            className="pointer-events-auto p-4 rounded-full bg-white/10 border border-white/20 hover:bg-white hover:text-catchy-dark transition-all duration-300 group"
          >
            <svg className={cn("w-6 h-6", isRTL ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button 
            onClick={() => paginate(1)}
            className="pointer-events-auto p-4 rounded-full bg-white/10 border border-white/20 hover:bg-white hover:text-catchy-dark transition-all duration-300 group"
          >
            <svg className={cn("w-6 h-6", isRTL ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center px-4 pb-20">
          <AnimatePresence mode="wait">
            {activeSlide && (
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-7xl mx-auto"
              >
                {activeSlide.type === 'new_arrivals' ? (
                  <div className={cn(
                    "flex flex-col lg:flex-row items-center gap-12 lg:gap-24 bg-white/10 p-10 md:p-16 rounded-[40px] border border-white/20 shadow-2xl",
                    isRTL ? "lg:flex-row-reverse" : ""
                  )}>
                    {/* Left Title */}
                    <div className={cn(
                      "flex-shrink-0 text-center lg:text-left",
                      isRTL ? "lg:text-right" : ""
                    )}>
                      <h2 className={cn(
                        "text-white text-5xl md:text-8xl font-light tracking-tighter mb-4 leading-none",
                        isRTL ? "font-arabic" : "font-serif"
                      )}>
                        {isRTL ? "وصلنا حديثاً" : "New Arrival"}
                      </h2>
                      <div className="w-24 h-[1px] bg-white/40 mx-auto lg:mx-0 mb-10"></div>
                      <Link to="/catalog" className="inline-flex items-center text-white/80 hover:text-white transition-all duration-500 group">
                        <span className="text-[11px] font-bold uppercase tracking-[0.5em] mr-4">{t('hero.cta')}</span>
                        <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-catchy-dark transition-all duration-500">
                          <svg className={cn("w-4 h-4 transition-transform", isRTL ? "rotate-180" : "group-hover:translate-x-1")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </div>
                      </Link>
                    </div>

                    {/* Right Carousel */}
                    <div id="new-arrivals-container" className="relative flex-grow w-full px-6">
                      {/* Internal Navigation Buttons */}
                      <div className="absolute -top-12 right-6 flex gap-4">
                        <button 
                          id="new-arrivals-prev"
                          onClick={() => {
                            if (newArrivalsRef.current) {
                              const amount = isRTL ? 250 : -250;
                              newArrivalsRef.current.scrollBy({ left: amount, behavior: 'smooth' });
                            }
                          }}
                          className="p-3 rounded-full border border-white/20 text-white hover:bg-white hover:text-catchy-dark transition-all duration-300"
                        >
                          <svg className={cn("w-4 h-4", isRTL ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button 
                          id="new-arrivals-next"
                          onClick={() => {
                            if (newArrivalsRef.current) {
                              const amount = isRTL ? -250 : 250;
                              newArrivalsRef.current.scrollBy({ left: amount, behavior: 'smooth' });
                            }
                          }}
                          className="p-3 rounded-full border border-white/20 text-white hover:bg-white hover:text-catchy-dark transition-all duration-300"
                        >
                          <svg className={cn("w-4 h-4", isRTL ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>

                      {/* Gradient Indicators */}
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white/10 to-transparent z-10 pointer-events-none md:hidden" />
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/10 to-transparent z-10 pointer-events-none md:hidden" />
                      
                      <div 
                        id="new-arrivals-carousel"
                        ref={newArrivalsRef}
                        className="flex gap-4 md:gap-8 overflow-x-auto no-scrollbar px-6 md:px-0 scroll-smooth touch-pan-x select-none"
                      >
                        {newArrivals.length > 0 ? [...newArrivals, ...newArrivals].map((product, idx) => (
                          <div 
                            key={`${product.id}-${idx}`} 
                            className="flex-shrink-0 w-32 md:w-40 group"
                          >
                            <div className="transition-all duration-500">
                              <ProductCard product={product} variant="hero" autoPlay={true} />
                            </div>
                          </div>
                        )) : (
                          // Skeleton or Placeholder
                          [1,2,3].map(i => (
                            <div key={i} className="flex-shrink-0 w-32 md:w-40 h-48 md:h-60 bg-white/5 animate-pulse rounded-2xl border border-white/10" />
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                ) : (
                  <div className="flex flex-col items-center text-center">
                    <p className="uppercase tracking-[0.6em] text-[10px] mb-6 text-white opacity-90">
                      {t(activeSlide.subtitle || '')}
                    </p>
                    <h1 className={cn(
                      "text-white text-6xl md:text-9xl mb-12 font-light leading-none tracking-tighter",
                      isRTL ? "font-arabic" : "font-serif"
                    )}>
                      {t(activeSlide.title || '')}
                    </h1>
                    <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-12">
                      <Link to="/catalog" className="bg-catchy text-white px-14 py-5 text-[10px] uppercase tracking-[0.4em] hover:bg-white hover:text-catchy transition-all duration-700">
                        {t('hero.cta')}
                      </Link>
                    </div>

                    {/* Search Bar on Hero */}
                    <div className="w-full max-w-xl mx-auto">
                      <div className="relative group">
                        <input 
                          type="text"
                          placeholder={t('catalog.search')}
                          className={cn(
                            "w-full py-5 bg-white/20 border border-white/20 rounded-2xl shadow-2xl focus:ring-4 focus:ring-white/10 focus:border-white/40 outline-none text-lg transition-all text-center text-white placeholder-white/40",
                            isRTL ? "pr-16 pl-10" : "pl-16 pr-10"
                          )}
                          onClick={() => window.location.href = '/catalog'}
                          readOnly
                        />
                        <div className={cn(
                          "absolute top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-white transition-colors",
                          isRTL ? "right-8" : "left-8"
                        )}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Carousel Indicators */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex space-x-4 z-40">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                const dir = i > currentSlide ? 1 : -1;
                setDirection(dir);
                setCurrentSlide(i);
              }}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-500",
                i === currentSlide ? "bg-white scale-125" : "bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>
      </section>


      {/* Refined Category Section */}
      <section className="w-full -mt-24 md:-mt-32 relative z-30 pb-20">
        <div className="bg-white p-8 md:p-16 shadow-2xl shadow-black/5 border-t border-white/20">
          <div className={cn("max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center", isRTL ? "flex-row-reverse" : "")}>
          {/* Title Branding (unchanged) */}
          <div className={cn(
            "lg:col-span-3 border-gray-100",
            isRTL ? "lg:border-l lg:pl-8 text-right" : "lg:border-r lg:pr-8 text-left"
          )}>
            <span className="text-catchy/60 text-[10px] block mb-2 font-bold tracking-[0.4em] uppercase">{t('featured.subtitle')}</span>
            <h2 className={cn(
              "text-3xl md:text-4xl font-black leading-tight text-catchy-dark tracking-tight",
              isRTL ? "font-arabic" : "font-serif"
            )}>
              {isRTL ? (
                <>
                  مجموعات<br /><span className="text-catchy/20">مميزة</span>
                </>
              ) : (
                <>
                  Featured<br /><span className="text-catchy/20">Collections</span>
                </>
              )}
            </h2>
          </div>

          {/* Elegant Icon Grid */}
                    <div className="lg:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-y-8 md:gap-y-12 gap-x-8 md:gap-x-12">
                      {categories.map((cat) => {
                        const Icon = CATEGORY_ICONS[cat];
                        return (
                          <Link
                            key={cat}
                            to={`/catalog?category=${cat}`}
                            className="flex flex-col items-center group"
                          >
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className={cn(
                                "relative w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center mb-6 transition-all duration-700 ease-out",
                                'bg-white border border-gray-100 group-hover:border-catchy/20 group-hover:bg-catchy/5 shadow-sm'
                              )}>
                              
                              {Icon && <Icon className="w-12 h-12 md:w-14 md:h-14 transition-all duration-500 text-gray-300 group-hover:text-catchy/60" />}
                            </motion.div>
                            
                            <span className="text-[13px] md:text-[15px] font-bold tracking-wide transition-all duration-300 text-gray-400 group-hover:text-catchy">
                              {t(CATEGORY_KEYS[cat] || cat)}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
        </div>
      </div>
    </section>

      {/* Tab Content (Products) */}
      <section id="products-grid" className="max-w-7xl mx-auto px-6 md:px-16 pb-32">
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          <AnimatePresence>
            {loadingTabs ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="aspect-[3/4.5] bg-white border border-gray-100 rounded-[3rem] animate-pulse" />
              ))
            ) : tabProducts.length > 0 ? (
              tabProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))
            ) : (
              <div className="col-span-full py-20 text-center text-gray-400 font-serif italic">
                New pieces arriving soon...
              </div>
            )}
          </AnimatePresence>
        </motion.div>
        
        {/* ... (rest of the component) */}
      </section>

      {/* Mid-Quote */}
      <section 
        className="py-52 px-6 bg-white text-center"
      >
        <div className="max-w-4xl mx-auto">
          <h2 className="font-serif text-4xl md:text-7xl leading-tight font-light mb-10 text-catchy">
            {isRTL ? (
              <>
                صُممت لأولئك <br /> 
                <span className="italic">الذين يخطفون الأنظار.</span>
              </>
            ) : (
              <>
                Crafted for those <br /> 
                <span className="italic">who catch every eye.</span>
              </>
            )}
          </h2>
          <div className="w-16 h-[1px] bg-catchy mx-auto"></div>
        </div>
      </section>

      {/* Categories */}
      <section 
        className="px-6 md:px-16 pb-40"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-8 group cursor-pointer overflow-hidden">
            <div className="relative aspect-[16/10] overflow-hidden bg-gray-50 rounded-3xl shadow-sm group-hover:shadow-md transition-all duration-500">
              <img 
                src="https://images.unsplash.com/photo-1539109132374-348058a1f7b6?auto=format&fit=crop&q=80&w=1400" 
                alt="Outerwear" 
                className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="mt-8">
              <h3 className="font-serif text-4xl italic text-catchy">Structured Forms</h3>
              <p className="text-[11px] uppercase tracking-widest mt-3 opacity-60 text-catchy">The Outerwear Edit</p>
            </div>
          </div>

          <div className="md:col-span-4 md:mt-32 group cursor-pointer">
            <div className="relative aspect-[3/5] overflow-hidden bg-gray-50 rounded-3xl shadow-sm group-hover:shadow-md transition-all duration-500">
              <img 
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=800" 
                alt="New Arrivals" 
                className="w-full h-full object-cover transition-transform duration-[2.5s] group-hover:scale-110"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="mt-8">
              <h3 className="font-serif text-3xl text-catchy">New Essentials</h3>
              <p className="text-[11px] uppercase tracking-widest mt-3 opacity-60 text-catchy">Shop New In</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
