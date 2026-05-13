import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { db, collection, getDocs, query, orderBy } from '../firebase';
import { Search, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATALOG_FILTER_CATEGORIES } from '../constants';
import { cn } from '../lib/utils';
import { getCatalogSaleMeta, isProductDiscounted } from '../lib/catalogSale';
import CatalogProductCard from '../components/CatalogProductCard';

function normalizeCategory(c?: string) {
  if (!c || typeof c !== 'string') return '';
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

function inPriceRange(price: number, key: string): boolean {
  if (key === '0-50') return price < 50;
  if (key === '50-100') return price >= 50 && price < 100;
  if (key === '100-150') return price >= 100 && price < 150;
  if (key === '150+') return price >= 150;
  return true;
}

type SortKey = 'popularity' | 'priceAsc' | 'priceDesc' | 'name';

const PRICE_KEYS = ['0-50', '50-100', '100-150', '150+'] as const;

const Catalog = () => {
  const { t, isRTL } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priceRanges, setPriceRanges] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('popularity');
  const [openSections, setOpenSections] = useState({
    category: true,
    price: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        setProducts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)));
      } catch (error) {
        console.error('Error fetching catalog:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectedCats = useMemo(() => {
    const cats = searchParams.get('cats');
    const one = searchParams.get('category');
    if (cats) {
      return cats
        .split(',')
        .map((s) => decodeURIComponent(s.trim()))
        .filter(Boolean);
    }
    if (one) return [decodeURIComponent(one.trim())];
    return [];
  }, [searchParams]);

  const saleOnly = searchParams.get('sale') === '1';

  const setSelectedCats = (cats: string[]) => {
    const next = new URLSearchParams(searchParams);
    next.delete('category');
    if (cats.length === 0) next.delete('cats');
    else next.set('cats', cats.join(','));
    setSearchParams(next);
  };

  const toggleCat = (cat: string) => {
    const norm = normalizeCategory(cat);
    const cur = selectedCats.map((c) => normalizeCategory(c));
    const has = cur.some((c) => c.toLowerCase() === norm.toLowerCase());
    const next = has
      ? selectedCats.filter((c) => normalizeCategory(c).toLowerCase() !== norm.toLowerCase())
      : [...selectedCats, cat];
    setSelectedCats(next);
  };

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      const c = normalizeCategory(p.category);
      if (!c) return;
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    return map;
  }, [products]);

  const categoryOptions = useMemo(() => {
    return CATALOG_FILTER_CATEGORIES.map((cat) => {
      const key = normalizeCategory(cat);
      return [cat, categoryCounts.get(key) ?? 0] as [string, number];
    });
  }, [categoryCounts]);

  const baseFiltered = useMemo(() => {
    return products.filter((p) => {
      if (saleOnly && !isProductDiscounted(p)) return false;
      if (searchTerm && !String(p.name).toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (selectedCats.length) {
        const pc = p.category ? normalizeCategory(p.category).toLowerCase() : '';
        const ok = selectedCats.some((c) => normalizeCategory(c).toLowerCase() === pc);
        if (!ok) return false;
      }
      if (priceRanges.length) {
        if (!priceRanges.some((k) => inPriceRange(Number(p.price) || 0, k))) return false;
      }
      return true;
    });
  }, [products, saleOnly, searchTerm, selectedCats, priceRanges]);

  const sortedProducts = useMemo(() => {
    const list = [...baseFiltered];
    if (sortBy === 'priceAsc') list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    else if (sortBy === 'priceDesc') list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    else if (sortBy === 'name') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [baseFiltered, sortBy]);

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  };

  const togglePrice = (key: string) => {
    setPriceRanges((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const clearAllFilters = () => {
    setSelectedCats([]);
    setPriceRanges([]);
    setSearchTerm('');
    const next = new URLSearchParams(searchParams);
    next.delete('cats');
    next.delete('category');
    next.delete('sale');
    setSearchParams(next);
  };

  const filterPills = useMemo(() => {
    const pills: { key: string; label: string; onRemove: () => void }[] = [];
    if (saleOnly) {
      pills.push({
        key: 'sale',
        label: t('nav.sale'),
        onRemove: () => {
          const next = new URLSearchParams(searchParams);
          next.delete('sale');
          setSearchParams(next);
        },
      });
    }
    selectedCats.forEach((c) => {
      pills.push({
        key: `c-${c}`,
        label: t(CATEGORY_KEYS[normalizeCategory(c)] || c),
        onRemove: () => toggleCat(c),
      });
    });
    priceRanges.forEach((k) => {
      const labelKey =
        k === '0-50'
          ? 'catalog.price0_50'
          : k === '50-100'
            ? 'catalog.price50_100'
            : k === '100-150'
              ? 'catalog.price100_150'
              : 'catalog.price150_plus';
      pills.push({
        key: `p-${k}`,
        label: t(labelKey),
        onRemove: () => setPriceRanges((prev) => prev.filter((x) => x !== k)),
      });
    });
    return pills;
  }, [saleOnly, searchParams, selectedCats, priceRanges, t, setSearchParams]);

  const showingLine = useMemo(() => {
    let line = t('catalog.showingLine')
      .replace('{shown}', String(sortedProducts.length))
      .replace('{total}', String(products.length));
    let forPart =
      searchTerm.trim().length > 0
        ? t('catalog.showingForSearch').replace('{q}', searchTerm.trim())
        : '';
    if (saleOnly) {
      const tag = ` · ${t('catalog.saleOnly')}`;
      forPart = forPart ? forPart + tag : tag;
    }
    return line.replace('{for}', forPart);
  }, [sortedProducts.length, products.length, searchTerm, saleOnly, t]);

  return (
    <div className="min-h-screen bg-neutral-50 text-catchy-dark">
      <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-16 md:px-8 md:pb-20 md:pt-20">
        <div className={cn('flex flex-col gap-6 lg:flex-row lg:gap-8', isRTL && 'lg:flex-row-reverse')}>
          {/* Sidebar */}
          <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-72 lg:self-start">
            <div className="rounded-xl border border-gray-200/90 bg-white p-3 shadow-sm sm:p-4">
              {/* Category */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('category')}
                  className="flex w-full items-center justify-between py-2 text-left text-sm font-semibold text-catchy-dark"
                >
                  {t('catalog.filterCategory')}
                  {openSections.category ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {openSections.category && (
                  <ul className="space-y-1 pb-2 pl-0.5">
                    {categoryOptions.map(([cat, count]) => {
                      const checked = selectedCats.some(
                        (c) => normalizeCategory(c).toLowerCase() === cat.toLowerCase()
                      );
                      return (
                        <li key={cat}>
                          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg py-1.5 pl-1 pr-1 text-sm hover:bg-gray-50">
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCat(cat)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-catchy focus:ring-catchy"
                              />
                              <span className="truncate">{t(CATEGORY_KEYS[cat] || cat)}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-gray-400">{count}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Price */}
              <div className="border-t border-gray-100 pt-1">
                <button
                  type="button"
                  onClick={() => toggleSection('price')}
                  className="flex w-full items-center justify-between py-2 text-left text-sm font-semibold text-catchy-dark"
                >
                  {t('catalog.filterPrice')}
                  {openSections.price ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                {openSections.price && (
                  <ul className="space-y-1 pb-2 pl-0.5">
                    {PRICE_KEYS.map((key) => {
                      const labelKey =
                        key === '0-50'
                          ? 'catalog.price0_50'
                          : key === '50-100'
                            ? 'catalog.price50_100'
                            : key === '100-150'
                              ? 'catalog.price100_150'
                              : 'catalog.price150_plus';
                      return (
                        <li key={key}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-1 text-sm hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={priceRanges.includes(key)}
                              onChange={() => togglePrice(key)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-catchy focus:ring-catchy"
                            />
                            {t(labelKey)}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>

          {/* Main */}
          <div className="min-w-0 flex-1">
            <nav
              className={cn(
                'flex flex-wrap items-center gap-1 text-xs text-gray-500',
                isRTL && 'flex-row-reverse justify-end'
              )}
              aria-label="Breadcrumb"
            >
              <Link to="/" className="transition hover:text-catchy-dark">
                {t('catalog.breadcrumbHome')}
              </Link>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-catchy-dark">{t('catalog.breadcrumbCatalog')}</span>
            </nav>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1">
                <Search
                  className={cn(
                    'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400',
                    isRTL ? 'right-3' : 'left-3'
                  )}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder={t('catalog.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    'w-full rounded-lg border border-gray-200 bg-white py-2.5 text-sm outline-none ring-catchy/20 placeholder:text-gray-400 focus:border-catchy focus:ring-2',
                    isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                  )}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label htmlFor="catalog-sort" className="text-xs font-medium text-gray-500">
                  {t('catalog.sortBy')}
                </label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-catchy-dark outline-none focus:border-catchy focus:ring-2 focus:ring-catchy/20"
                >
                  <option value="popularity">{t('catalog.sortPopularity')}</option>
                  <option value="priceAsc">{t('catalog.sortPriceAsc')}</option>
                  <option value="priceDesc">{t('catalog.sortPriceDesc')}</option>
                  <option value="name">{t('catalog.sortName')}</option>
                </select>
              </div>
            </div>

            <p className={cn('mt-4 text-sm text-gray-600', isRTL && 'font-arabic')}>{showingLine}</p>

            {filterPills.length > 0 && (
              <div className={cn('mt-4 flex flex-wrap gap-2', isRTL && 'flex-row-reverse')}>
                {filterPills.map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={pill.onRemove}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-catchy-dark shadow-sm transition hover:border-gray-300"
                  >
                    {pill.label}
                    <X className="h-3 w-3 text-gray-400" aria-hidden />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-semibold text-catchy underline-offset-2 hover:underline"
                >
                  {t('catalog.clearFilters')}
                </button>
              </div>
            )}

            <div className="mt-6">
              {loading ? (
                <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className="aspect-[5/6] w-full max-w-[10.5rem] animate-pulse rounded-md bg-neutral-200 sm:max-w-[11.5rem] lg:max-w-[12rem]"
                    />
                  ))}
                </div>
              ) : sortedProducts.length > 0 ? (
                <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
                  {sortedProducts.map((product) => {
                    const meta = getCatalogSaleMeta(product);
                    const colorsLine = t('catalog.colorsCount').replace('{n}', String(meta.nColors));
                    return (
                      <CatalogProductCard
                        key={product.id}
                        product={product}
                        compareAtPrice={meta.compareAt}
                        saleLabel={t('catalog.sale')}
                        colorsLine={colorsLine}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
                  <Search className="mx-auto mb-4 h-10 w-10 text-gray-300" />
                  <h2 className="text-lg font-semibold text-catchy-dark">{t('catalog.emptyTitle')}</h2>
                  <p className="mt-2 text-sm text-gray-500">{t('catalog.emptyHint')}</p>
                  <Link
                    to="/"
                    className="mt-6 inline-block text-sm font-semibold text-catchy underline-offset-2 hover:underline"
                  >
                    {t('nav.home')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Catalog;
