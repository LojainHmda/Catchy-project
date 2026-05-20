import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Search, X, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATALOG_FILTER_CATEGORIES } from '../constants';
import { cn } from '../lib/utils';
import { getCatalogSaleMeta, isProductDiscounted } from '../lib/catalogSale';
import CatalogProductCard from '../components/CatalogProductCard';
import { canonicalCategory } from '../lib/category';
import {
  CATALOG_VIEW_PAGE_SIZE,
  fetchCatalogCategoryCounts,
  fetchCatalogProductsPage,
  type CatalogSortKey,
} from '../lib/catalogPagination';

const Catalog = () => {
  const { t, isRTL } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [viewPage, setViewPage] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map());
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const fetchGenRef = useRef(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<CatalogSortKey>('priceAsc');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    fetchCatalogCategoryCounts()
      .then(setCategoryCounts)
      .catch((e) => console.error('Category counts:', e));
  }, []);

  const selectedCats = useMemo(() => {
    const cats = searchParams.get('cats');
    const one = searchParams.get('category');
    const raw = cats
      ? cats.split(',').map((s) => decodeURIComponent(s.trim()))
      : one
        ? [decodeURIComponent(one.trim())]
        : [];
    return raw.map(canonicalCategory).filter(Boolean);
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
    const norm = canonicalCategory(cat);
    const cur = selectedCats.map((c) => canonicalCategory(c));
    const has = cur.some((c) => c.toLowerCase() === norm.toLowerCase());
    const next = has
      ? selectedCats.filter((c) => canonicalCategory(c).toLowerCase() !== norm.toLowerCase())
      : [...selectedCats, cat];
    setSelectedCats(next);
  };

  const loadProducts = useCallback(
    async (reset: boolean) => {
      const gen = ++fetchGenRef.current;
      if (reset) {
        setLoading(true);
        lastDocRef.current = null;
      } else {
        setLoadingMore(true);
      }

      try {
        const { items, lastDoc, hasMore: more } = await fetchCatalogProductsPage({
          selectedCats,
          sortBy,
          cursor: reset ? null : lastDocRef.current,
        });

        if (gen !== fetchGenRef.current) return;

        lastDocRef.current = lastDoc;
        setHasMore(more);
        setProducts((prev) => (reset ? items : [...prev, ...items]));
        if (reset) setViewPage(0);
      } catch (error) {
        console.error('Error fetching catalog:', error);
        if (gen === fetchGenRef.current && reset) setProducts([]);
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [selectedCats, sortBy]
  );

  useEffect(() => {
    loadProducts(true);
  }, [loadProducts]);

  useEffect(() => {
    setViewPage(0);
  }, [debouncedSearch, saleOnly]);

  const categoryOptions = useMemo(() => {
    return CATALOG_FILTER_CATEGORIES.map((cat) => {
      const key = canonicalCategory(cat);
      return [cat, categoryCounts.get(key) ?? 0] as [string, number];
    });
  }, [categoryCounts]);

  const sortedProducts = useMemo(() => {
    const list = products.filter((p) => {
      if (saleOnly && !isProductDiscounted(p)) return false;
      if (debouncedSearch && !String(p.name).toLowerCase().includes(debouncedSearch.toLowerCase())) {
        return false;
      }
      if (selectedCats.length) {
        const pc = p.category ? canonicalCategory(p.category).toLowerCase() : '';
        const ok = selectedCats.some((c) => canonicalCategory(c).toLowerCase() === pc);
        if (!ok) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const diff = (Number(a.price) || 0) - (Number(b.price) || 0);
      return sortBy === 'priceAsc' ? diff : -diff;
    });

    return list;
  }, [products, saleOnly, debouncedSearch, selectedCats, sortBy]);

  const totalViewPages = Math.max(1, Math.ceil(sortedProducts.length / CATALOG_VIEW_PAGE_SIZE));

  const pagedProducts = useMemo(() => {
    const start = viewPage * CATALOG_VIEW_PAGE_SIZE;
    return sortedProducts.slice(start, start + CATALOG_VIEW_PAGE_SIZE);
  }, [sortedProducts, viewPage]);

  useEffect(() => {
    if (viewPage > totalViewPages - 1) {
      setViewPage(Math.max(0, totalViewPages - 1));
    }
  }, [viewPage, totalViewPages]);

  useEffect(() => {
    const onLastPage = viewPage >= totalViewPages - 1;
    const slotsNeeded = (viewPage + 1) * CATALOG_VIEW_PAGE_SIZE;
    const needMoreFromServer =
      onLastPage && hasMore && !loading && !loadingMore && sortedProducts.length < slotsNeeded;
    if (needMoreFromServer) loadProducts(false);
  }, [viewPage, totalViewPages, hasMore, loading, loadingMore, sortedProducts.length, loadProducts]);

  const clearAllFilters = () => {
    setSelectedCats([]);
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
        label: t(CATEGORY_KEYS[canonicalCategory(c)] || c),
        onRemove: () => toggleCat(c),
      });
    });
    return pills;
  }, [saleOnly, searchParams, selectedCats, t, setSearchParams]);

  const showingLine = useMemo(() => {
    if (sortedProducts.length === 0 && !loading) {
      return t('catalog.showingLine').replace('{shown}', '0').replace('{total}', '0').replace('{for}', '');
    }
    const start = sortedProducts.length === 0 ? 0 : viewPage * CATALOG_VIEW_PAGE_SIZE + 1;
    const end = Math.min((viewPage + 1) * CATALOG_VIEW_PAGE_SIZE, sortedProducts.length);
    let forPart =
      debouncedSearch.length > 0
        ? t('catalog.showingForSearch').replace('{q}', debouncedSearch)
        : '';
    if (saleOnly) {
      const tag = ` · ${t('catalog.saleOnly')}`;
      forPart = forPart ? forPart + tag : tag;
    }
    const more = hasMore ? t('catalog.moreAvailable') : '';
    return t('catalog.showingPaged')
      .replace('{start}', String(start))
      .replace('{end}', String(end))
      .replace('{loaded}', String(sortedProducts.length))
      .replace('{more}', more)
      .replace('{for}', forPart);
  }, [sortedProducts.length, viewPage, debouncedSearch, saleOnly, hasMore, loading, t]);

  const chipClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
      active
        ? 'border-catchy bg-catchy text-white shadow-sm'
        : 'border-gray-200 bg-white text-catchy-dark hover:border-catchy/35 hover:bg-catchy/5'
    );

  return (
    <div className="min-h-screen bg-neutral-50 text-catchy-dark">
      <div className="mx-auto max-w-[1400px] px-4 pb-4 pt-2 md:px-8 md:pb-6 md:pt-3">
        <div className="min-w-0">
            <div
              className={cn(
                'flex w-full min-w-0 flex-row flex-nowrap items-center justify-between gap-1',
                isRTL && 'flex-row-reverse'
              )}
            >
              <nav
                className={cn(
                  'flex min-w-0 flex-nowrap items-center gap-0.5 text-[10px] leading-none text-gray-500',
                  isRTL && 'flex-row-reverse'
                )}
                aria-label="Breadcrumb"
              >
                <Link to="/" className="shrink-0 transition hover:text-catchy-dark">
                  {t('catalog.breadcrumbHome')}
                </Link>
                <span className="shrink-0 text-gray-300">/</span>
                <span className="truncate font-medium text-catchy-dark">
                  {t('catalog.breadcrumbCatalog')}
                </span>
              </nav>

              <div className="flex h-6 shrink-0 flex-nowrap items-center">
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as CatalogSortKey)}
                  aria-label={t('catalog.sortBy')}
                  className="h-6 max-w-[8.75rem] shrink-0 rounded-md border border-gray-200 bg-white py-0 pl-2 pr-5 text-[10px] font-medium leading-tight text-catchy-dark outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                >
                  <option value="priceAsc">{t('catalog.sortPriceAsc')}</option>
                  <option value="priceDesc">{t('catalog.sortPriceDesc')}</option>
                </select>
              </div>
            </div>

            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1">
                <Search
                  className={cn(
                    'pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400',
                    isRTL ? 'right-2.5' : 'left-2.5'
                  )}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder={t('catalog.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    'h-8 w-full rounded-lg border border-gray-200 bg-white py-0 text-xs outline-none ring-catchy/20 placeholder:text-gray-400 focus:border-catchy focus:ring-2',
                    isRTL ? 'pr-9 pl-2.5' : 'pl-9 pr-2.5'
                  )}
                />
              </div>
            </div>

            <div
              className={cn(
                'mt-1.5 rounded-xl border border-gray-200/80 bg-white px-2.5 py-2 shadow-sm sm:px-3',
                isRTL && 'font-arabic'
              )}
            >
              <div
                dir={isRTL ? 'rtl' : 'ltr'}
                className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className={cn('min-w-0 flex-1', isRTL && 'flex flex-col items-start')}>
                  <p
                    className={cn(
                      'mb-1 w-full text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400',
                      isRTL && 'text-start'
                    )}
                  >
                    {t('catalog.filterCategory')}
                  </p>
                  <div
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className="flex w-full gap-1.5 overflow-x-auto pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {categoryOptions.map(([cat, count]) => {
                      const checked = selectedCats.some(
                        (c) => canonicalCategory(c).toLowerCase() === cat.toLowerCase()
                      );
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCat(cat)}
                          aria-pressed={checked}
                          className={cn(chipClass(checked), 'inline-flex items-center gap-1')}
                        >
                          <span>{t(CATEGORY_KEYS[cat] || cat)}</span>
                          <span className={cn('tabular-nums', checked ? 'text-white/80' : 'text-gray-400')}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <p
              className={cn(
                'mt-1.5 mb-0 text-xs leading-none text-gray-600',
                isRTL ? 'text-start font-arabic' : 'text-end'
              )}
            >
              {showingLine}
            </p>

            {filterPills.length > 0 && (
              <div className={cn('mt-1.5 flex flex-wrap gap-2', isRTL && 'flex-row-reverse')}>
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

            <div className={cn(filterPills.length > 0 ? 'mt-1.5' : 'mt-2')}>
              {loading ? (
                <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className="aspect-[5/6] w-full max-w-[10.5rem] animate-pulse rounded-md bg-neutral-200 sm:max-w-[11rem]"
                    />
                  ))}
                </div>
              ) : sortedProducts.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-5">
                    {pagedProducts.map((product) => {
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

                  <div
                    className={cn(
                      'mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3',
                      isRTL && 'font-arabic'
                    )}
                  >
                    <p className="text-[11px] leading-none text-gray-500">
                      {t('catalog.pageInfo')
                        .replace('{page}', String(viewPage + 1))
                        .replace('{pages}', String(totalViewPages))}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <button
                        type="button"
                        disabled={viewPage === 0}
                        onClick={() => setViewPage((p) => Math.max(0, p - 1))}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-catchy-dark transition hover:border-catchy disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t('catalog.prevPage')}
                      </button>
                      <button
                        type="button"
                        disabled={viewPage >= totalViewPages - 1 && !hasMore}
                        onClick={() => {
                          if (viewPage < totalViewPages - 1) {
                            setViewPage((p) => p + 1);
                          } else if (hasMore) {
                            loadProducts(false);
                          }
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-catchy-dark transition hover:border-catchy disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {t('catalog.nextPage')}
                      </button>
                      {hasMore && (
                        <button
                          type="button"
                          disabled={loadingMore}
                          onClick={() => loadProducts(false)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-catchy px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-catchy-dark disabled:opacity-60"
                        >
                          {loadingMore ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          {loadingMore ? t('catalog.loadingMore') : t('catalog.loadMore')}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-8 py-12 text-center">
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
  );
};

export default Catalog;
