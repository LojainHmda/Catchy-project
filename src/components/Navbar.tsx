import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, ShoppingBag, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { user, role, logout } = useAuth();
  const { cartCount } = useCart();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const onLight = isHome && !scrolled;

  const linkClass = cn(
    'text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors',
    onLight ? 'text-white/90 hover:text-white' : 'text-catchy-dark/80 hover:text-catchy'
  );

  return (
    <nav
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn(
        'top-0 left-0 w-full z-[100] flex items-center justify-between px-5 md:px-10 lg:px-14 py-4 md:py-5 transition-all duration-500',
        isHome ? 'fixed' : 'sticky',
        onLight ? 'bg-transparent' : 'bg-white/95 text-catchy-dark shadow-sm backdrop-blur-md border-b border-black/[0.06]'
      )}
    >
      <Link
        to="/"
        dir="ltr"
        className="flex shrink-0 items-center gap-2.5"
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
            'font-serif text-xl tracking-[0.35em] md:text-2xl',
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

      <div className="flex items-center gap-4 md:gap-6 rtl:gap-x-reverse">
        <Link
          to="/catalog"
          aria-label={t('nav.search')}
          className={cn('rounded-full p-2 transition-colors', onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100')}
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <Link
          to="/cart"
          className={cn(
            'relative rounded-full p-2 transition-colors',
            onLight ? 'text-white hover:bg-white/10' : 'text-catchy-dark hover:bg-gray-100'
          )}
          aria-label={t('nav.cart')}
        >
          <ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
          {cartCount > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold',
                onLight ? 'bg-catchy text-white' : 'bg-catchy text-white'
              )}
            >
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </Link>
        {user && role === 'admin' && (
          <Link
            to="/admin"
            className={cn('text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors', linkClass)}
          >
            {t('nav.dashboard')}
          </Link>
        )}
        <div className="flex items-center gap-2 md:gap-2.5">
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
              onLight
                ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                : 'border-catchy/25 bg-catchy/5 text-catchy-dark hover:bg-catchy/10'
            )}
          >
            {language === 'en' ? 'العربية' : 'EN'}
          </button>
          {user ? (
            <button type="button" onClick={logout} className={cn('text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors', linkClass)}>
              {t('nav.logout')}
            </button>
          ) : (
            <Link to="/login" className={cn('text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors', linkClass)}>
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
