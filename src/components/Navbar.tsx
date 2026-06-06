import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const Navbar = () => {
  const location = useLocation();
  const { user, role, logout } = useAuth();
  const { cartCount, openCart, closeCart } = useCart();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAr = language === 'ar';

  useEffect(() => { closeCart(); setMenuOpen(false); }, [location.pathname, closeCart]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '/',        ar: 'الرئيسية',    en: 'Home' },
    { href: '/catalog', ar: 'المجموعات',  en: 'Collections' },
    { href: '/',        ar: 'عن المتجر',  en: 'About' },
    { href: '/',        ar: 'تواصل معنا', en: 'Contact' },
  ];

  return (
    <>
      {/* Announcement bar */}
      <div
        className="w-full bg-primary text-on-primary text-center py-2 text-xs tracking-wide"
        dir={isRTL ? 'rtl' : 'ltr'}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        <span className="material-symbols-outlined align-middle mx-1" style={{ fontSize: '14px' }}>local_shipping</span>
        {isAr ? 'توصيل مجاني للطلبيات فوق 300 ريال' : 'Free shipping on orders over 300 SAR'}
      </div>

      {/* Desktop header */}
      <header
        className={cn(
          'sticky top-0 z-50 bg-white transition-shadow duration-300 hidden md:block',
          scrolled && 'shadow-sm'
        )}
      >
        <div className="grid grid-cols-3 items-center px-10 py-4 max-w-screen-xl mx-auto">
          {/* Left: cart + search */}
          <div className="flex items-center gap-5">
            <button
              onClick={openCart}
              className="relative flex items-center gap-1 hover:opacity-70 transition-opacity"
              aria-label={t('nav.cart')}
            >
              <span className="material-symbols-outlined text-on-surface" style={{ fontSize: '22px' }}>shopping_bag</span>
              <span className="text-xs text-on-surface-variant" style={{ fontFamily: 'var(--font-body)' }}>
                {cartCount}
              </span>
            </button>
            <Link to="/catalog" aria-label="Search" className="hover:opacity-70 transition-opacity">
              <span className="material-symbols-outlined text-on-surface" style={{ fontSize: '22px' }}>search</span>
            </Link>
          </div>

          {/* Center: logo */}
          <div className="flex justify-center">
            <Link
              to="/"
              className="text-2xl tracking-[0.25em] text-primary select-none"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CATCHY
            </Link>
          </div>

          {/* Right: nav links */}
          <nav
            className="flex items-center justify-end gap-6"
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {navLinks.map((link) => (
              <Link
                key={link.ar}
                to={link.href}
                className={cn(
                  'text-sm transition-colors hover:text-primary pb-0.5',
                  location.pathname === link.href && link.href !== '/'
                    ? 'text-primary border-b border-primary'
                    : link.href === '/' && location.pathname === '/'
                    ? 'text-primary border-b border-primary'
                    : 'text-on-surface-variant'
                )}
                style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
              >
                {isAr ? link.ar : link.en}
              </Link>
            ))}
            {user && role === 'admin' && (
              <Link to="/admin" className="text-sm text-on-surface-variant hover:text-primary transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
                {t('nav.dashboard')}
              </Link>
            )}
            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="text-xs border border-outline-variant rounded-full px-3 py-1 text-on-surface-variant hover:text-primary transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {isAr ? 'EN' : 'ع'}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile header */}
      <header
        className={cn(
          'sticky top-0 z-50 bg-white transition-shadow duration-300 flex md:hidden justify-between items-center px-5 py-4',
          scrolled && 'shadow-sm'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <button onClick={() => setMenuOpen(true)} className="hover:opacity-70 active:scale-95 transition-all">
          <span className="material-symbols-outlined text-on-surface">menu</span>
        </button>
        <Link to="/" className="text-xl tracking-[0.25em] text-primary" style={{ fontFamily: 'var(--font-display)' }}>
          CATCHY
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/catalog" className="hover:opacity-70">
            <span className="material-symbols-outlined text-on-surface">search</span>
          </Link>
          <button onClick={openCart} className="relative hover:opacity-70">
            <span className="material-symbols-outlined text-on-surface">shopping_bag</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary text-on-primary px-1 text-[9px] font-bold">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-[200] flex md:hidden" dir={isRTL ? 'rtl' : 'ltr'}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className={cn('relative z-10 flex w-72 flex-col bg-white px-6 py-8 shadow-xl h-full', isRTL ? 'mr-auto' : 'ml-auto')}>
            <button onClick={() => setMenuOpen(false)} className="mb-8 self-start">
              <span className="material-symbols-outlined text-on-surface">close</span>
            </button>
            <nav className="flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link key={link.ar} to={link.href} className="text-lg text-on-surface font-medium" style={{ fontFamily: 'var(--font-body)' }}>
                  {isAr ? link.ar : link.en}
                </Link>
              ))}
              {user && role === 'admin' && (
                <Link to="/admin" className="text-lg text-on-surface font-medium">{t('nav.dashboard')}</Link>
              )}
            </nav>
            <div className="mt-auto flex flex-col gap-4">
              <button
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className="self-start rounded-full border border-outline-variant px-4 py-2 text-sm text-on-surface-variant"
              >
                {isAr ? 'English' : 'العربية'}
              </button>
              {user ? (
                <button onClick={logout} className="self-start text-sm text-on-surface-variant">{t('nav.logout')}</button>
              ) : (
                <Link to="/login" className="self-start text-sm text-on-surface-variant">{t('nav.login')}</Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
