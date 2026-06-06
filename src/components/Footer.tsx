import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

const Footer = () => {
  const { t, isRTL, language } = useLanguage();
  const isAr = language === 'ar';

  return (
    <footer
      className="flex flex-col items-center gap-8 py-12 px-5 w-full text-center bg-secondary-container"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="text-xl text-primary tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
        CATCHY
      </div>

      <div className="grid grid-cols-2 gap-x-12 gap-y-8 w-full text-start">
        <div>
          <h4
            className="text-xs font-semibold text-primary mb-4 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {isAr ? 'روابط سريعة' : 'Quick Links'}
          </h4>
          <ul
            className={cn('flex flex-col gap-2 text-sm text-on-secondary-fixed-variant', isAr ? 'font-arabic' : '')}
            style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
          >
            <li><Link to="/" className="hover:text-primary transition-colors">{isAr ? 'الرئيسية' : 'Home'}</Link></li>
            <li><Link to="/catalog" className="hover:text-primary transition-colors">{isAr ? 'المجموعات' : 'Collections'}</Link></li>
            <li><Link to="/" className="hover:text-primary transition-colors">{isAr ? 'عن المتجر' : 'About'}</Link></li>
            <li><Link to="/login" className="hover:text-primary transition-colors">{t('nav.login')}</Link></li>
          </ul>
        </div>

        <div>
          <h4
            className="text-xs font-semibold text-primary mb-4 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {isAr ? 'المساعدة' : 'Help'}
          </h4>
          <ul
            className={cn('flex flex-col gap-2 text-sm text-on-secondary-fixed-variant', isAr ? 'font-arabic' : '')}
            style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
          >
            <li className="hover:text-primary transition-colors cursor-pointer">{isAr ? 'سياسة الشحن' : 'Shipping Policy'}</li>
            <li className="hover:text-primary transition-colors cursor-pointer">{isAr ? 'الاسترجاع والاستبدال' : 'Returns'}</li>
            <li className="hover:text-primary transition-colors cursor-pointer">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</li>
          </ul>
        </div>
      </div>

      <div className="w-full text-center mt-4">
        <h4
          className="text-xs font-semibold text-primary mb-4 uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {isAr ? 'تواصل معنا' : 'Contact Us'}
        </h4>
        <p
          className="text-sm text-on-secondary-fixed-variant mb-2"
          dir="ltr"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          +966 50 123 4567
        </p>
        <p
          className="text-sm text-on-secondary-fixed-variant mb-4"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          hello@catchy.com
        </p>
        <div className="flex justify-center gap-6 mt-2">
          <span className="material-symbols-outlined text-primary cursor-pointer hover:opacity-70">phone</span>
          <span className="material-symbols-outlined text-primary cursor-pointer hover:opacity-70">mail</span>
          <span className="material-symbols-outlined text-primary cursor-pointer hover:opacity-70">location_on</span>
        </div>
      </div>

      <div className="border-t border-primary/10 w-full pt-8">
        <p
          className="text-[10px] text-on-secondary-fixed-variant uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          © 2024 CATCHY. ALL RIGHTS RESERVED.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
