import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    'nav.home': 'Home',
    'nav.catalog': 'Catalog',
    'nav.cart': 'Cart',
    'nav.login': 'Login',
    'nav.admin': 'Admin',
    'hero.limited': 'Limited Collection',
    'hero.title': 'The Catchy Silhouette',
    'hero.cta': 'Explore New In',
    'hero.slide1.title': 'Latest Arrivals',
    'hero.slide1.subtitle': 'Fresh silhouettes for the new season',
    'hero.slide2.title': 'Exclusive Clearances',
    'hero.slide2.subtitle': 'Timeless pieces at exceptional value',
    'hero.slide3.title': 'Seasonal Edit',
    'hero.slide3.subtitle': 'Curated styles for the current atmosphere',
    'hero.slide4.title': 'New Collection',
    'hero.slide4.subtitle': 'Defining the future of silhouette',
    'featured.title': 'Featured Collections',
    'featured.subtitle': 'Curated Selection',
    'featured.viewAll': 'View All',
    'footer.about': 'About Catchy',
    'footer.aboutText': 'Crafting silhouettes that catch every eye. High-end fashion for the modern individual.',
    'footer.shop': 'Shop',
    'footer.support': 'Support',
    'footer.contact': 'Contact Us',
    'catalog.title': 'Our Collection',
    'catalog.subtitle': 'Discover the perfect outfit for every occasion.',
    'catalog.search': 'Search products...',
    'product.addToCart': 'Add to Bag',
    'product.details': 'Details',
    'product.lowStock': 'Low Stock',
    'product.outOfStock': 'Out of Stock',
    'cat.newArrivals': 'New Arrivals',
    'cat.pants': 'Pants',
    'cat.tops': 'Tops',
    'cat.dresses': 'Dresses',
    'cat.skirts': 'Skirts',
    'cat.jackets': 'Jackets',
    'cat.formal': 'Formal Sets',
    'cat.coordinates': 'Coordinates',
    'cat.all': 'All',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.catalog': 'كتالوج',
    'nav.cart': 'السلة',
    'nav.login': 'تسجيل الدخول',
    'nav.admin': 'لوحة التحكم',
    'hero.limited': 'مجموعة محدودة',
    'hero.title': 'خيال كاشي',
    'hero.cta': 'استكشف الجديد',
    'hero.slide1.title': 'وصلنا حديثاً',
    'hero.slide1.subtitle': 'تصاميم جديدة للموسم القادم',
    'hero.slide2.title': 'تصفيات حصرية',
    'hero.slide2.subtitle': 'قطع كلاسيكية بقيمة استثنائية',
    'hero.slide3.title': 'مختارات الموسم',
    'hero.slide3.subtitle': 'أنماط منسقة للأجواء الحالية',
    'hero.slide4.title': 'مجموعة جديدة',
    'hero.slide4.subtitle': 'تحديد مستقبل الأناقة',
    'featured.title': 'مجموعات مميزة',
    'featured.subtitle': 'اختيارات منسقة',
    'featured.viewAll': 'عرض الكل',
    'footer.about': 'عن كاشي',
    'footer.aboutText': 'نصمم أزياء تخطف الأنظار. أزياء راقية للفرد العصري.',
    'footer.shop': 'تسوق',
    'footer.support': 'الدعم',
    'footer.contact': 'اتصل بنا',
    'catalog.title': 'مجموعتنا',
    'catalog.subtitle': 'اكتشف الزي المثالي لكل مناسبة.',
    'catalog.search': 'ابحث عن المنتجات...',
    'product.addToCart': 'أضف للسلة',
    'product.details': 'التفاصيل',
    'product.lowStock': 'كمية محدودة',
    'product.outOfStock': 'نفذت الكمية',
    'cat.newArrivals': 'وصلنا حديثاً',
    'cat.pants': 'بلاطين',
    'cat.tops': 'بلايز',
    'cat.dresses': 'فساتين',
    'cat.skirts': 'تنانير',
    'cat.jackets': 'جاكيتات',
    'cat.formal': 'طقوم رسمية',
    'cat.coordinates': 'تنسيقات',
    'cat.all': 'الكل',
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ar');

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  const isRTL = language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRTL]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      <div dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'font-arabic' : ''}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
