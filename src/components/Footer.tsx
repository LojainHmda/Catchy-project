import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const Footer = () => {
  const { t, isRTL } = useLanguage();
  return (
    <footer className="border-t border-gray-100 bg-white px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12 md:gap-6">
          <div className={cn('md:col-span-5', isRTL && 'flex flex-col items-start')}>
            <div dir="ltr" className={cn('mb-2 flex items-center gap-1', isRTL && 'ml-auto')}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-catchy text-[10px] font-medium text-white">
                C
              </div>
              <span
                className={cn(
                  'text-lg tracking-[0.12em] text-catchy',
                  isRTL ? 'font-arabic' : 'font-serif'
                )}
              >
                ATCHY
              </span>
            </div>
            <p
              dir={isRTL ? 'rtl' : undefined}
              className={cn(
                'max-w-sm text-[10px] leading-relaxed tracking-wide text-catchy uppercase',
                isRTL && 'ml-auto w-full max-w-none font-arabic text-right normal-case'
              )}
            >
              {t('footer.tagline')}
            </p>
          </div>
          <div
            className={cn(
              'flex flex-col gap-1.5 text-[10px] uppercase tracking-widest text-catchy md:col-span-3',
              isRTL && 'font-arabic'
            )}
          >
            <span className="mb-0.5 opacity-30">{t('footer.legal')}</span>
            <Link to="/login" className="hover:opacity-60">
              {t('nav.login')}
            </Link>
            <Link to="/privacy" className="hover:opacity-60">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="hover:opacity-60">
              {t('footer.terms')}
            </Link>
          </div>
          <div
            className={cn(
              'flex flex-col gap-1.5 text-[10px] uppercase tracking-widest text-catchy md:col-span-4',
              isRTL ? 'md:items-start md:text-left font-arabic' : 'md:items-end md:text-right'
            )}
          >
            <span className="mb-0.5 opacity-30">{t('footer.newsletter')}</span>
            <div className="w-full max-w-xs border-b border-catchy py-1">
              <input
                type="email"
                placeholder={t('footer.emailPlaceholder')}
                className={cn(
                  'w-full border-none bg-transparent text-[10px] tracking-widest focus:ring-0 placeholder:text-catchy/30',
                  isRTL && 'font-arabic text-end normal-case'
                )}
              />
            </div>
          </div>
        </div>
        <div
          className={cn(
            'mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-[8px] uppercase tracking-[0.2em] text-catchy/40 leading-none',
            isRTL && 'font-arabic'
          )}
        >
          <p>{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
