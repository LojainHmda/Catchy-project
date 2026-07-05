import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { getCatalogSaleMeta } from '../lib/catalogSale';
import CatalogProductCard from '../components/CatalogProductCard';
import CoordinateCatalogCard from '../components/CoordinateCatalogCard';
import { canonicalCategory } from '../lib/category';
import { categoryLabel, findCategoryById } from '../lib/categoriesService';
import { CATALOG_VIEW_PAGE_SIZE, useCatalog } from '../hooks/useCatalog';

const Catalog = () => {
  const { t, isRTL } = useLanguage();
  const {
    searchParams,
    setSearchParams,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    viewPage,
    setViewPage,
    selectedCats,
    saleOnly,
    toggleCat,
    toggleSaleFilter,
    clearAllFilters,
    retryLoad,
    categoryOptions,
    storeCategories,
    countsLoaded,
    pagedGridEntries,
    totalGridCount,
    totalViewPages,
    getProductsForLook,
    productsGridLoading,
    coordinatesSectionLoading,
    fetchError,
    indexComplete,
    debouncedSearch,
  } = useCatalog();

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
      const cat = findCategoryById(storeCategories, c);
      pills.push({
        key: `c-${c}`,
        label: cat ? categoryLabel(cat, isRTL) : c,
        onRemove: () => toggleCat(c),
      });
    });
    return pills;
  }, [saleOnly, searchParams, selectedCats, t, isRTL, storeCategories, setSearchParams, toggleCat]);

  const showEmptyState = totalGridCount === 0 && !productsGridLoading && !coordinatesSectionLoading && !fetchError;
  const showLoadError = Boolean(fetchError) && totalGridCount === 0 && !productsGridLoading;

  const showingLine = useMemo(() => {
    if (productsGridLoading) return t('catalog.loadingMore');
    if (coordinatesSectionLoading) return t('catalog.loadingCoordinates');
    if (totalGridCount === 0) {
      return t('catalog.showingLine').replace('{shown}', '0').replace('{total}', '0').replace('{for}', '');
    }
    const start = viewPage * CATALOG_VIEW_PAGE_SIZE + 1;
    const end = Math.min((viewPage + 1) * CATALOG_VIEW_PAGE_SIZE, totalGridCount);
    let forPart =
      debouncedSearch.length > 0
        ? t('catalog.showingForSearch').replace('{q}', debouncedSearch)
        : '';
    if (saleOnly) {
      const tag = ` · ${t('catalog.saleOnly')}`;
      forPart = forPart ? forPart + tag : tag;
    }
    const truncated = !indexComplete ? t('catalog.partialIndex') : '';
    return t('catalog.showingPaged')
      .replace('{start}', String(start))
      .replace('{end}', String(end))
      .replace('{total}', String(totalGridCount))
      .replace('{more}', truncated)
      .replace('{for}', forPart);
  }, [
    totalGridCount,
    viewPage,
    debouncedSearch,
    saleOnly,
    productsGridLoading,
    coordinatesSectionLoading,
    indexComplete,
    t,
  ]);

  const gridSkeleton = (
    <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-6">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="aspect-[5/6] w-full max-w-[10.5rem] animate-pulse rounded-md bg-neutral-200 sm:max-w-[11rem]"
        />
      ))}
    </div>
  );

  const coordinateSkeleton = (
    <div className="mb-4 grid grid-cols-2 justify-items-center gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-5">
      {Array.from({ length: 2 }, (_, i) => (
        <div
          key={`coord-${i}`}
          className="aspect-[5/6] w-full max-w-[10.5rem] animate-pulse rounded-md bg-neutral-200 sm:max-w-[11rem]"
        />
      ))}
    </div>
  );

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
              <span className="truncate font-medium text-catchy-dark">{t('catalog.breadcrumbCatalog')}</span>
            </nav>

            <div className="flex h-6 shrink-0 flex-nowrap items-center">
              <select
                id="catalog-sort"
                name="catalog-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label={t('catalog.sortBy')}
                className="h-6 max-w-[8.75rem] shrink-0 rounded-md border border-gray-200 bg-white py-0 pl-2 pr-5 text-[10px] font-medium leading-tight text-catchy-dark outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
              >
                <option value="newest">{t('catalog.sortNewest')}</option>
                <option value="priceAsc">{t('catalog.sortPriceAsc')}</option>
                <option value="priceDesc">{t('catalog.sortPriceDesc')}</option>
              </select>
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
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className={cn('min-w-0 flex-1', isRTL && 'flex flex-col items-start')}>
                <div
                  dir={isRTL ? 'rtl' : 'ltr'}
                  className="flex w-full gap-1.5 overflow-x-auto pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {categoryOptions.map((opt) => {
                    const checked = selectedCats.some(
                      (c) => canonicalCategory(c).toLowerCase() === opt.id.toLowerCase()
                    );
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleCat(opt.id)}
                        aria-pressed={checked}
                        className={cn(
                          chipClass(checked),
                          'inline-flex items-center gap-1',
                          checked && opt.isCoordinates && 'border-emerald-700 bg-emerald-700 hover:bg-emerald-800'
                        )}
                      >
                        <span>{categoryLabel(opt, isRTL)}</span>
                        {countsLoaded && (
                          <span className={cn('tabular-nums', checked ? 'text-white/80' : 'text-gray-400')}>
                            {opt.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={toggleSaleFilter}
                    aria-pressed={saleOnly}
                    className={cn(
                      chipClass(saleOnly),
                      'inline-flex items-center gap-1',
                      saleOnly && 'border-red-600 bg-red-600 hover:bg-red-700'
                    )}
                  >
                    <span>{t('nav.sale')}</span>
                  </button>
                </div>
              </div>
              <form
                role="search"
                onSubmit={(e) => e.preventDefault()}
                className={cn(
                  'relative w-full max-w-[9.5rem] shrink-0 sm:w-[9.5rem] md:w-[10.5rem]',
                  isRTL ? 'self-start sm:self-auto' : 'self-end sm:self-auto'
                )}
              >
                <label htmlFor="catalog-search" className="sr-only">
                  {t('catalog.search')}
                </label>
                <Search
                  className={cn(
                    'pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400',
                    isRTL ? 'right-2.5' : 'left-2.5'
                  )}
                  aria-hidden
                />
                <input
                  id="catalog-search"
                  name="catalog-search"
                  type="search"
                  autoComplete="off"
                  dir={isRTL ? 'rtl' : 'ltr'}
                  placeholder={t('catalog.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    'h-8 w-full rounded-lg border border-gray-200 bg-white py-0 text-xs outline-none ring-catchy/20 placeholder:text-gray-400 focus:border-catchy focus:ring-2',
                    isRTL ? 'pr-9 pl-2.5 text-start' : 'pl-9 pr-2.5'
                  )}
                />
              </form>
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
            {productsGridLoading ? (
              gridSkeleton
            ) : totalGridCount > 0 || coordinatesSectionLoading ? (
              <>
                {coordinatesSectionLoading ? coordinateSkeleton : null}
                {totalGridCount > 0 ? (
                  <>
                    <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-5">
                      {pagedGridEntries.map((entry, index) => {
                        if (entry.kind === 'look') {
                          return (
                            <CoordinateCatalogCard
                              key={`look-${entry.look.id}`}
                              look={entry.look}
                              linkedProducts={getProductsForLook(entry.look)}
                              isRTL={isRTL}
                            />
                          );
                        }
                        const meta = getCatalogSaleMeta(entry.product);
                        return (
                          <CatalogProductCard
                            key={entry.product.id}
                            product={entry.product}
                            compareAtPrice={meta.compareAt}
                            discountPercent={meta.discountPercent}
                            saleLabel={t('catalog.sale')}
                            colorSwatches={
                              entry.product.colorCount > 1 ? entry.product.colorSwatches : undefined
                            }
                            priority={index < 4}
                          />
                        );
                      })}
                    </div>

                    {totalViewPages > 1 ? (
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
                            disabled={viewPage >= totalViewPages - 1}
                            onClick={() => setViewPage((p) => p + 1)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-catchy-dark transition hover:border-catchy disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {t('catalog.nextPage')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : showLoadError ? (
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-8 py-12 text-center">
                <Loader2 className="mx-auto mb-4 h-10 w-10 text-amber-500" />
                <h2 className="text-lg font-semibold text-catchy-dark">{t('catalog.loadError')}</h2>
                <p className="mt-2 text-sm text-gray-500">{fetchError}</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-catchy px-4 py-2 text-sm font-semibold text-white hover:bg-catchy-dark"
                >
                  {t('catalog.retry')}
                </button>
              </div>
            ) : showEmptyState ? (
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
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Catalog;
