import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const BottomNav = () => {
  const location = useLocation();
  const { isRTL } = useLanguage();

  const active = (path: string) => location.pathname === path;

  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-5 py-3 bg-surface/90 backdrop-blur-md border-t border-outline-variant/30"
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
        to="/login"
        className={cn(
          'flex flex-col items-center justify-center transition-colors p-2',
          active('/login') ? 'text-primary' : 'text-on-surface-variant'
        )}
      >
        <span className="material-symbols-outlined">person</span>
      </Link>
    </nav>
  );
};

export default BottomNav;
