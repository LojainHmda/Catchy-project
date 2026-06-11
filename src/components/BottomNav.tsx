import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { isRTL } = useLanguage();

  const active = (path: string) => location.pathname === path;
  const accountPath = user ? '/orders' : '/login';
  const accountActive = user
    ? location.pathname.startsWith('/orders')
    : location.pathname === '/login';

  return (
    <nav
      className="fixed bottom-0 left-0 z-50 flex w-full justify-around items-center border-t border-outline-variant/30 bg-surface/90 px-5 py-3 backdrop-blur-md sm:hidden"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <Link
        to="/"
        className={cn(
          'flex flex-col items-center justify-center transition-colors p-2',
          active('/') ? 'text-primary' : 'text-on-surface-variant'
        )}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: active('/') ? "'FILL' 1" : "'FILL' 0" }}
        >
          home
        </span>
      </Link>

      <Link
        to="/catalog"
        className={cn(
          'flex flex-col items-center justify-center transition-colors p-2',
          active('/catalog') ? 'text-primary' : 'text-on-surface-variant'
        )}
      >
        <span className="material-symbols-outlined">search</span>
      </Link>

      <button className="flex flex-col items-center justify-center text-on-surface-variant hover:text-primary transition-colors p-2">
        <span className="material-symbols-outlined">favorite</span>
      </button>

      <Link
        to={accountPath}
        className={cn(
          'flex flex-col items-center justify-center transition-colors p-2',
          accountActive ? 'text-primary' : 'text-on-surface-variant'
        )}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: accountActive ? "'FILL' 1" : "'FILL' 0" }}
        >
          person
        </span>
      </Link>
    </nav>
  );
};

export default BottomNav;
