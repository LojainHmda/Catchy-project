type HeroTextSlide = {
  title?: string;
  titleAr?: string;
  subtitle?: string;
  subtitleAr?: string;
};

const I18N_KEY = /^[a-z][a-z0-9]*(\.[a-zA-Z0-9_]+)+$/;

export function looksLikeHeroI18nKey(s?: string) {
  return !!s && I18N_KEY.test(s);
}

export function heroSlideField(
  slide: HeroTextSlide,
  field: 'title' | 'subtitle',
  language: 'en' | 'ar',
  t: (key: string) => string,
  fallbackKey: string
): string {
  const en = field === 'title' ? slide.title : slide.subtitle;
  const ar = field === 'title' ? slide.titleAr : slide.subtitleAr;
  const primary = language === 'ar' ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim();
  if (!primary) return t(fallbackKey);
  if (looksLikeHeroI18nKey(primary)) return t(primary);
  return primary;
}
