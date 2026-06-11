import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const linkClass = 'text-sm text-on-secondary-fixed-variant hover:text-primary transition-colors';

const Footer = () => {
  const { user, role, loading, logout } = useAuth();
  const { t, isRTL, language } = useLanguage();
  const isAr = language === 'ar';

  const displayName = user?.displayName?.trim() || user?.email?.split('@')[0] || '';

  return (
    <footer
      className="w-full bg-secondary-container px-5 py-6 pb-20 sm:pb-6"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-center sm:text-start">
            <div
              className="text-lg tracking-[0.2em] text-primary"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CATCHY
            </div>
            <p
              className={cn('mt-1 max-w-xs text-xs text-on-secondary-fixed-variant', isAr ? 'font-arabic' : '')}
              style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
            >
              {t('footer.tagline')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-start sm:grid-cols-3 sm:gap-x-8">
            <div>
              <h4
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t('footer.quickLinks')}
              </h4>
              <ul
                className={cn('flex flex-col gap-1.5', isAr ? 'font-arabic' : '')}
                style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
              >
                <li><Link to="/" className={linkClass}>{t('nav.home')}</Link></li>
                <li><Link to="/catalog" className={linkClass}>{isAr ? 'المجموعات' : 'Collections'}</Link></li>
                <li><Link to="/" className={linkClass}>{t('nav.about')}</Link></li>
              </ul>
            </div>

            <div>
              <h4
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t('footer.help')}
              </h4>
              <ul
                className={cn('flex flex-col gap-1.5', isAr ? 'font-arabic' : '')}
                style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
              >
                <li><span className={cn(linkClass, 'cursor-pointer')}>{t('footer.shipping')}</span></li>
                <li><span className={cn(linkClass, 'cursor-pointer')}>{t('footer.returns')}</span></li>
                <li><span className={cn(linkClass, 'cursor-pointer')}>{t('footer.faq')}</span></li>
              </ul>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <h4
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {t('footer.account')}
              </h4>
              <ul
                className={cn('flex flex-col gap-1.5', isAr ? 'font-arabic' : '')}
                style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
              >
                {loading ? (
                  <li className="h-5 w-24 animate-pulse rounded bg-primary/10" aria-hidden />
                ) : user ? (
                  <>
                    {displayName ? (
                      <li className="text-xs text-on-secondary-fixed-variant/80">
                        {t('footer.signedIn')}{' '}
                        <span className="font-medium text-on-secondary-fixed-variant">{displayName}</span>
                      </li>
                    ) : null}
                    {role === 'admin' ? (
                      <li>
                        <Link to="/admin" className={linkClass}>{t('nav.dashboard')}</Link>
                      </li>
                    ) : (
                      <li>
                        <Link to="/orders" className={linkClass}>{t('footer.myOrders')}</Link>
                      </li>
                    )}
                    <li>
                      <button
                        type="button"
                        onClick={() => void logout()}
                        className={cn(linkClass, 'text-start')}
                      >
                        {t('nav.logout')}
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link to="/login" className={linkClass}>{t('nav.login')}</Link>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-2 border-t border-primary/10 pt-4 sm:flex-row sm:justify-between">
          <div
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-on-secondary-fixed-variant sm:justify-start"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <a href="tel:+966501234567" className="hover:text-primary transition-colors" dir="ltr">
              +966 50 123 4567
            </a>
            <span className="hidden text-primary/20 sm:inline" aria-hidden>·</span>
            <a href="mailto:hello@catchy.com" className="hover:text-primary transition-colors">
              hello@catchy.com
            </a>
          </div>
          <p
            className="text-[10px] uppercase tracking-wider text-on-secondary-fixed-variant"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
