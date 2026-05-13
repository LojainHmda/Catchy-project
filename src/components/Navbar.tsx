import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const Navbar = () => {
  const { user, role, login, logout } = useAuth();
  const { cartCount } = useCart();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinkClass = "relative text-[11px] uppercase tracking-[0.25em] text-catchy after:content-[''] after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-[1px] after:bg-catchy after:transition-[width] after:duration-300 hover:after:w-full";

  return (
    <nav 
      dir={isRTL ? 'rtl' : 'ltr'}
      className={cn(
        "sticky top-0 left-0 w-full z-[100] flex justify-between items-center px-6 md:px-12 py-3 md:py-4 transition-all duration-500",
        scrolled ? "bg-zinc-50/90 text-gray-900 py-3 shadow-sm backdrop-blur-md" : "bg-zinc-50 text-gray-900"
      )}
    >
      <div className="hidden md:flex items-center space-x-12 rtl:space-x-reverse">
        <Link to="/catalog" className={navLinkClass}>{t('nav.catalog')}</Link>
        <button 
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className={cn(navLinkClass, "font-bold px-3 py-1 bg-catchy/10 rounded-full border border-catchy/20 hover:bg-catchy/20 transition-colors")}
        >
          {language === 'en' ? 'العربية' : 'English'}
        </button>
      </div>
      
      {/* Logo: Only first C in circle */}
      <Link 
        to="/" 
        dir="ltr"
        className="flex items-center cursor-pointer space-x-3"
      >
        <div className="w-10 h-10 rounded-full bg-catchy flex items-center justify-center text-white font-bold text-lg shadow-md">C</div>
        <span className="text-3xl tracking-[0.5em] font-bold uppercase text-catchy-dark ml-[-0.2em]">Atchy</span>
      </Link>
      
      <div className="flex items-center space-x-6 md:space-x-12 rtl:space-x-reverse">
        <Link to="/cart" className={navLinkClass}>{t('nav.cart')} ({cartCount})</Link>
        {user ? (
          <>
            {role === 'admin' && <Link to="/admin" className={navLinkClass}>Admin</Link>}
            <button onClick={logout} className={navLinkClass}>Logout</button>
          </>
        ) : (
          <Link to="/login" className={navLinkClass}>{t('nav.login')}</Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
