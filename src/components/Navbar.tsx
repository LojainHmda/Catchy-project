import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, ChevronDown, User, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { db, collection, getDocs, query, orderBy, limit } from '../firebase';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

type SearchProduct = {
  id: string;
  name?: string;
  price?: number;
  image?: string;
  images?: unknown;
};

type SearchDropdownProps = {
  id: string;
  labelledBy: string;
  variant: 'desktop' | 'mobile';
  productsLoading: boolean;
  searchQuery: string;
  filteredProducts: SearchProduct[];
  onPickResult: () => void;
  t: (key: string) => string;
};

function SearchDropdown({
  id,
  labelledBy,
  variant,
  productsLoading,
  searchQuery,
  filteredProducts,
  onPickResult,
  t,
}: SearchDropdownProps) {
  return (
    <div
      id={id}
      role="listbox"
      aria-labelledby={labelledBy}
      className={cn(
        'z-[120] overflow-y-auto rounded-xl border border-gray-200/90 bg-white py-2 text-catchy-dark shadow-lg ring-1 ring-black/[0.04]',
        variant === 'desktop' &&
          'absolute end-0 top-[calc(100%+0.5rem)] max-h-[min(70vh,22rem)] w-[min(calc(100vw-2.5rem),22rem)]',
        variant === 'mobile' && 'mt-2 max-h-[min(50dvh,20rem)] w-full'
      )}
    >
      {productsLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          <span>{t('login.preparing')}</span>
        </div>
      ) : !searchQuery.trim() ? (
        <p className="px-4 py-3 text-sm text-gray-500">{t('nav.searchHint')}</p>
      ) : filteredProducts.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-catchy-dark">{t('catalog.emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('catalog.emptyHint')}</p>
        </div>
      ) : (
        <ul className="py-0.5">
          {filteredProducts.map((p) => {
            const imgs = coerceProductImages(p);
            const src = imgs[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
            const price = Number(p.price);
            const priceLabel = Number.isFinite(price) ? `آ£${price}` : '';
            return (
              <li key={p.id} role="option">
                <Link
                  to={`/product/${p.id}`}
                  onClick={onPickResult}
                  className="flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                >
                  <img
                    src={src}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-md object-cover ring-1 ring-black/[0.06]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium text-catchy-dark">{p.name}</span>
                    {priceLabel ? (
                      <span className="mt-0.5 block text-xs tabular-nums text-gray-600">{priceLabel}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { user, role, logout } = useAuth();
  const { cartCount, openCart, closeCart } = useCart();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const searchCatalogLoadedRef = useRef(false);
  const headerSearchRef = useRef<HTMLDivElement>(null);
  const inputRefDesktop = useRef<HTMLInputElement>(null);
  const inputRefMobile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    closeCart();
  }, [location.pathname, closeCart]);

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > 40;
      setScrolled((prev) => (prev === next ? prev : next));
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load search catalog only when the panel opens â€” avoids competing with Home/Catalog on first paint (mobile timeouts / freezes).
  useEffect(() => {
    if (!isSearchOpen) return;
    if (searchCatalogLoadedRef.current) return;
    let cancelled = false;
    setProductsLoading(true);
    (async () => {
      try {
        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(150));
        const snapshot = await getDocs(q);
        if (cancelled) return;
        setProducts(
          snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as SearchProduct[]
        );
        searchCatalogLoadedRef.current = true;
      } catch (e) {
        console.error('Navbar search: failed to load products', e);
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSearchOpen]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    setIsSearchOpen((open) => (open ? false : open));
    setSearchQuery((q) => (q.length ? '' : q));
  }, [location.pathname]);

  useEffect(() => {
    if (!isSearchOpen) return;
    if (window.matchMedia('(min-width: 768px)').matches) {
      const id = window.setTimeout(() => inputRefDesktop.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    // One frame after mount keeps layout stable; avoid long timers so iOS still ties focus to the user gesture.
    const raf = requestAnimationFrame(() => {
      inputRefMobile.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen, closeSearch]);

  // Use "click" (not pointerdown + microtask) so we do not race mobile keyboard/focus or steal the opening gesture from the search toggle.
  useEffect(() => {
    if (!isSearchOpen) return;
    const onDocumentClick = (e: MouseEvent) => {
      const root = headerSearchRef.current;
      if (!root || root.contains(e.target as Node)) return;
      closeSearch();
    };
    document.addEventListener('click', onDocumentClick, false);
    return () => document.removeEventListener('click', onDocumentClick, false);
  }, [isSearchOpen, closeSearch]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => String(p.name ?? '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [products, searchQuery]);

  const onLight = isHome && !scrolled;

  const linkClass = cn(
    'text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors',
    onLight ? 'text-white/90 hover:text-white' : 'text-catchy-dark/80 hover:text-catchy'
  );

  const iconTapClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full transition-colors touch-manipulation',
    'min-h-[44px] min-w-[44px] p-0 md:min-h-0 md:min-w-0 md:p-2'
  );

  const inputClass = cn(
    'h-10 w-full min-w-0 rounded-full border py-2 text-sm outline-none transition focus:ring-2 focus:ring-catchy/35',
    isRTL ? 'ps-4 pe-10' : 'ps-4 pe-10',
    onLight
      ? 'border-white/35 bg-white/15 text-white placeholder:text-white/55'
      : 'border-black/[0.08] bg-white text-catchy-dark placeholder:text-gray-400'
  );

  const inputClassMobile = cn(
    'h-11 w-full min-w-0 rounded-full border border-black/[0.1] bg-white py-2.5 ps-4 pe-10 text-base text-catchy-dark outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-catchy/35'
  );

  return (
    <div
      ref={headerSearchRef}
      className={cn(
        'left-0 right-0 z-[100] w-full min-w-0 max-w-[100vw] max-md:overflow-x-hidden',
        isHome ? 'fixed top-0' : 'sticky top-0'
      )}
    >
      <nav
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'w-full min-w-0 touch-manipulation max-md:transition-none md:transition-all md:duration-500',
          'py-4 pt-[max(1rem,env(safe-area-inset-top,0px))] md:py-5',
          'pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] md:px-10 lg:px-14',
          'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] max-md:items-center max-md:gap-x-2',
          'md:flex md:items-center md:justify-between',
          onLight
            ? 'bg-transparent'
            : 'border-b border-black/[0.06] bg-white/95 text-catchy-dark shadow-sm max-md:bg-white max-md:backdrop-blur-none md:backdrop-blur-md'
        )}
      >
        <Link
          to="/"
          dir="ltr"
          className="max-md:col-start-2 max-md:row-start-1 max-md:justify-self-center max-md:pointer-events-auto relative z-10 flex min-w-0 shrink-0 items-baseline gap-1 font-serif text-xl font-bold md:hidden"
        >
          <span className={cn(onLight ? 'text-white' : 'text-catchy-dark')}>C</span>
          <span className={cn('tracking-[0.35em]', onLight ? 'text-white' : 'text-catchy-dark')}>
            ATCHY
          </span>
        </Link>

        <Link
          to="/"
          dir="ltr"
          className="hidden min-w-0 shrink-0 items-center gap-2.5 md:flex"
        >
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-sm md:h-10 md:w-10 md:text-base',
              onLight ? 'border border-white/35 bg-white/15 text-white' : 'bg-catchy text-white'
            )}
          >
            C
          </div>
          <span
            className={cn(
              'text-xl tracking-[0.35em] md:text-2xl',
              isRTL ? 'font-arabic' : 'font-serif',
              onLight ? 'text-white' : 'text-catchy-dark'
            )}
          >
            ATCHY
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex lg:gap-12 rtl:gap-x-reverse">
          <Link to="/catalog" className={cn(linkClass, 'inline-flex items-center gap-1')}>
            {t('nav.catalog')}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Link>
          <Link to="/catalog?sale=1" className={linkClass}>
            {t('nav.sale')}
          </Link>
          <Link to="/catalog" className={linkClass}>
            {t('home.newArrivals')}
          </Link>
          <Link to="/#products-grid" className={linkClass}>
            {t('nav.about')}
          </Link>
        </div>

        <div
          className={cn(
            'flex min-w-0 max-w-full items-center gap-1.5 max-md:col-start-1 max-md:row-start-1 max-md:justify-self-start',
            'md:hidden'
          )}
        >
          {user && role === 'admin' && (
            <Link
              to="/admin"
              className={cn(
                'shrink-0 truncate py-2 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors',
                linkClass
              )}
            >
              {t('nav.dashboard')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className={cn(
              'shrink-0 touch-manipulation rounded-full border px-2.5 py-2 text-[10px] font-bold tracking-wider transition-colors',
              'min-h-[40px] min-w-[40px]',
              language === 'en' ? 'font-arabic normal-case' : 'uppercase',
              onLight
                ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                : 'border-catchy/25 bg-catchy/5 text-catchy-dark hover:bg-catchy/10'
            )}
          >
            {language === 'en' ? t('nav.langArabic') : t('nav.langEnglish')}
          </button>
          {user ? (
            <button
              type="button"
              onClick={logout}
              aria-label={t('nav.logout')}
              className={cn(
                iconTapClass,
                onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
              )}
            >
              <User className="h-5 w-5" strokeWidth={1.75} />
            </button>
          ) : (
            <Link
              to="/login"
              aria-label={t('nav.login')}
              className={cn(
                iconTapClass,
                onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
              )}
            >
              <User className="h-5 w-5" strokeWidth={1.75} />
            </Link>
          )}
        </div>

        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 max-md:col-start-3 max-md:row-start-1 max-md:justify-self-end',
            isRTL && 'flex-row-reverse',
            'md:hidden'
          )}
        >
          <button
            type="button"
            onClick={openCart}
            className={cn(
              iconTapClass,
              'relative shrink-0',
              onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
            )}
            aria-label={t('nav.cart')}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            {cartCount > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold',
                  'bg-catchy text-white'
                )}
              >
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={t('nav.search')}
            aria-expanded={isSearchOpen}
            aria-controls="navbar-search-dropdown-mobile"
            onClick={() => setIsSearchOpen((o) => !o)}
            className={cn(
              iconTapClass,
              onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
            )}
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div
          className={cn(
            'hidden shrink-0 items-center gap-3 sm:gap-4 md:flex md:gap-6 rtl:gap-x-reverse',
            isSearchOpen && 'md:min-w-0 md:flex-1'
          )}
        >
          <div
            className={cn(
              'relative z-[110] flex min-w-0 items-center gap-1.5 sm:gap-2',
              isSearchOpen && 'md:min-w-0 md:flex-1'
            )}
          >
            {/* Desktop / tablet: inline expanding search (unchanged behavior) */}
            <div
              className={cn(
                'relative hidden min-w-0 md:flex md:items-center md:gap-2',
                isSearchOpen && 'md:flex-1'
              )}
            >
              <div
                className={cn(
                  'min-w-0',
                  isSearchOpen
                    ? cn(
                        'flex min-h-10 min-w-0 flex-1 basis-0 items-center overflow-visible opacity-100',
                        'md:max-w-[min(72vw,20rem)] md:overflow-hidden md:transition-[max-width,opacity] md:duration-300 md:ease-out'
                      )
                    : cn(
                        'pointer-events-none opacity-0 md:block md:max-w-0 md:overflow-hidden md:transition-[max-width,opacity] md:duration-300 md:ease-out'
                      )
                )}
                aria-hidden={!isSearchOpen}
              >
                <div className="relative min-w-0">
                  <input
                    ref={inputRefDesktop}
                    id="navbar-search-input-desktop"
                    type="search"
                    autoComplete="off"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('catalog.search')}
                    className={inputClass}
                  />
                  {searchQuery.length > 0 && (
                    <button
                      type="button"
                      className={cn(
                        'absolute top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors',
                        isRTL ? 'left-1' : 'right-1',
                        onLight ? 'text-white/80 hover:bg-white/15' : 'text-gray-500 hover:bg-gray-100'
                      )}
                      aria-label={t('nav.searchClear')}
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                aria-label={t('nav.search')}
                aria-expanded={isSearchOpen}
                aria-controls="navbar-search-dropdown-desktop"
                onClick={() => setIsSearchOpen((o) => !o)}
                className={cn(
                  iconTapClass,
                  'hidden md:inline-flex',
                  onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
                )}
              >
                <Search className="h-5 w-5" strokeWidth={1.75} />
              </button>

              {isSearchOpen && (
                <SearchDropdown
                  id="navbar-search-dropdown-desktop"
                  labelledBy="navbar-search-input-desktop"
                  variant="desktop"
                  productsLoading={productsLoading}
                  searchQuery={searchQuery}
                  filteredProducts={filteredProducts}
                  onPickResult={closeSearch}
                  t={t}
                />
              )}
            </div>

          </div>

          <button
            type="button"
            onClick={openCart}
            className={cn(
              iconTapClass,
              'relative hidden shrink-0 md:inline-flex',
              onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
            )}
            aria-label={t('nav.cart')}
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
            {cartCount > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold',
                  'bg-catchy text-white'
                )}
              >
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>

          {user && role === 'admin' && (
            <Link
              to="/admin"
              className={cn(
                'shrink-0 whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors md:py-0',
                linkClass
              )}
            >
              {t('nav.dashboard')}
            </Link>
          )}
          <div className="flex shrink-0 items-center gap-2 md:gap-2.5">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className={cn(
                'touch-manipulation rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors md:py-1.5',
                'min-h-[40px] min-w-[44px] md:min-h-0 md:min-w-0',
                onLight
                  ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                  : 'border-catchy/25 bg-catchy/5 text-catchy-dark hover:bg-catchy/10'
              )}
            >
              {language === 'en' ? t('nav.langArabic') : t('nav.langEnglish')}
            </button>
            {user ? (
              <button
                type="button"
                onClick={logout}
                className={cn(
                  'touch-manipulation whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors md:py-0',
                  linkClass
                )}
              >
                {t('nav.logout')}
              </button>
            ) : (
              <Link
                to="/login"
                className={cn(
                  'touch-manipulation whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors md:py-0',
                  linkClass
                )}
              >
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile-only: search strip (mounted only when open â€” avoids grid height / blur animation jank) */}
      {isSearchOpen ? (
        <div className="md:hidden w-full min-w-0 overflow-x-hidden overscroll-contain">
          <div
            className={cn(
              'border-b px-[max(1.25rem,env(safe-area-inset-left,0px))] pb-3 pt-2 pe-[max(1.25rem,env(safe-area-inset-right,0px))]',
              onLight
                ? 'border-white/15 bg-black/50 shadow-sm'
                : 'border-black/[0.06] bg-white shadow-sm'
            )}
          >
            <div className="relative min-w-0">
              <input
                ref={inputRefMobile}
                id="navbar-search-input-mobile"
                tabIndex={0}
                type="search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('catalog.search')}
                className={inputClassMobile}
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  className={cn(
                    'absolute top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100',
                    isRTL ? 'left-1' : 'right-1'
                  )}
                  aria-label={t('nav.searchClear')}
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
            <SearchDropdown
              id="navbar-search-dropdown-mobile"
              labelledBy="navbar-search-input-mobile"
              variant="mobile"
              productsLoading={productsLoading}
              searchQuery={searchQuery}
              filteredProducts={filteredProducts}
              onPickResult={closeSearch}
              t={t}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Navbar;
