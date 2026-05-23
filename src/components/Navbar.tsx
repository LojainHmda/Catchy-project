import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, ChevronDown, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import CatchyLogo from './CatchyLogo';

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { user, role, logout } = useAuth();
  const { cartCount, openCart, closeCart } = useCart();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

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

  const onLight = isHome && !scrolled;

  const linkClass = cn(
    'text-sm font-semibold uppercase tracking-[0.2em] transition-colors',
    onLight ? 'text-white/90 hover:text-white' : 'text-catchy-dark/80 hover:text-catchy'
  );
  const desktopNavLinkClass = cn(
    linkClass,
    language === 'en' && 'text-xs tracking-[0.08em] sm:text-sm sm:tracking-[0.1em]'
  );

  const iconTapClass = cn(
    'inline-flex shrink-0 items-center justify-center rounded-full transition-colors touch-manipulation',
    'min-h-[44px] min-w-[44px] p-0 sm:min-h-0 sm:min-w-0 sm:p-2'
  );

  return (
    <div
      className={cn(
        'left-0 right-0 z-[100] w-full min-w-0 max-w-[100vw] max-sm:overflow-x-hidden',
        isHome ? 'fixed top-0' : 'sticky top-0'
      )}
    >
      <nav
        dir={isRTL ? 'rtl' : 'ltr'}
        className={cn(
          'w-full min-w-0 touch-manipulation max-sm:transition-none sm:transition-all sm:duration-500',
          'py-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:py-5',
          'pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] sm:px-10 lg:px-14',
          'sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center',
          onLight
            ? 'bg-transparent'
            : 'border-b border-black/[0.06] bg-white/95 text-catchy-dark shadow-sm max-sm:bg-white max-sm:backdrop-blur-none sm:backdrop-blur-md'
        )}
      >
        {/* Mobile — fixed physical layout (LTR) so AR/EN match: utils left, logo absolutely centered, cart right */}
        <div
          className="relative flex w-full items-center justify-between gap-x-2 sm:hidden"
          dir="ltr"
        >
          <div className="flex min-w-0 items-center gap-1.5">
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
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className={cn(
                  'shrink-0 touch-manipulation rounded-full border px-2 py-1.5 text-[10px] font-bold tracking-wider transition-colors',
                  'min-h-9 min-w-9',
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
                    'min-h-9 min-w-9',
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
                    'min-h-9 min-w-9',
                    onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
                  )}
                >
                  <User className="h-5 w-5" strokeWidth={1.75} />
                </Link>
              )}
            </div>
          </div>

          <CatchyLogo className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" />

          <div className="flex shrink-0 items-center justify-end">
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
          </div>
        </div>

        <CatchyLogo className="relative z-10 hidden sm:col-start-2 sm:row-start-1 sm:inline-flex sm:justify-self-center" />

        <div
          className={cn(
            'hidden items-center sm:col-start-1 sm:row-start-1 sm:flex sm:justify-self-start rtl:gap-x-reverse',
            language === 'en' ? 'gap-2 sm:gap-3' : 'gap-8 sm:gap-12'
          )}
        >
          <Link to="/catalog" className={cn(desktopNavLinkClass, 'inline-flex items-center gap-1')}>
            {t('nav.catalog')}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
          </Link>
          <Link to="/catalog?sale=1" className={desktopNavLinkClass}>
            {t('nav.sale')}
          </Link>
          <Link to="/catalog" className={desktopNavLinkClass}>
            {t('home.newArrivals')}
          </Link>
          <Link to="/#products-grid" className={desktopNavLinkClass}>
            {t('nav.about')}
          </Link>
        </div>

        <div
          className={cn(
            'hidden shrink-0 items-center gap-3 sm:col-start-3 sm:row-start-1 sm:flex sm:justify-self-end sm:gap-6 rtl:gap-x-reverse'
          )}
        >
          <button
            type="button"
            onClick={openCart}
            className={cn(
              iconTapClass,
              'relative hidden shrink-0 sm:inline-flex',
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
                'shrink-0 whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors sm:py-0',
                linkClass
              )}
            >
              {t('nav.dashboard')}
            </Link>
          )}
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className={cn(
                'touch-manipulation rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors sm:py-1.5',
                'min-h-[40px] min-w-[44px] sm:min-h-0 sm:min-w-0',
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
                  'touch-manipulation whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors sm:py-0',
                  linkClass
                )}
              >
                {t('nav.logout')}
              </button>
            ) : (
              <Link
                to="/login"
                className={cn(
                  'touch-manipulation whitespace-nowrap py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors sm:py-0',
                  linkClass
                )}
              >
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
