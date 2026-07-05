import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { canonicalCategory } from '../lib/category';
import { catalogCoordinateLooks } from '../lib/coordinatesValidation';
import { useStoreCategories } from './useStoreCategories';
import {
  buildCatalogGridEntries,
  buildCategoryOptions,
  CATALOG_VIEW_PAGE_SIZE,
  productsForCoordinateLook,
} from '../lib/catalog/catalogSelectors';
import {
  coordinateLooksFromBundle,
  linkedProductsFromBundle,
  loadCatalogCoordinates,
  loadCatalogIndex,
  peekCatalogCoordinates,
  peekCatalogIndexStale,
} from '../lib/catalog/catalogService';
import type { CatalogCoordinatesBundle, CatalogIndex, CatalogSortKey } from '../lib/catalog/catalogTypes';

function parseSelectedCats(searchParams: URLSearchParams): string[] {
  const cats = searchParams.get('cats');
  const one = searchParams.get('category');
  const raw = cats
    ? cats.split(',').map((s) => decodeURIComponent(s.trim()))
    : one
      ? [decodeURIComponent(one.trim())]
      : [];
  return raw.map(canonicalCategory).filter(Boolean);
}

export function useCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { categories: storeCategories, visibleCategories } = useStoreCategories();

  const [index, setIndex] = useState<CatalogIndex | null>(() => peekCatalogIndexStale());
  const [indexStatus, setIndexStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    (peekCatalogIndexStale()?.products.length ?? 0) > 0 ? 'ready' : 'loading'
  );
  const [indexError, setIndexError] = useState<string | null>(null);

  const [coordBundle, setCoordBundle] = useState<CatalogCoordinatesBundle | null>(() =>
    peekCatalogCoordinates()
  );
  const [coordStatus, setCoordStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<CatalogSortKey>('newest');
  const [viewPage, setViewPage] = useState(0);

  const selectedCats = useMemo(() => parseSelectedCats(searchParams), [searchParams]);
  const saleOnly = searchParams.get('sale') === '1';
  const coordinatesActive = useMemo(
    () => selectedCats.some((c) => canonicalCategory(c).toLowerCase() === 'coordinates'),
    [selectedCats]
  );

  useEffect(() => {
    let cancelled = false;
    const hadDisplayable = Boolean(peekCatalogIndexStale()?.products.length);

    loadCatalogIndex({ revalidate: hadDisplayable })
      .then((data) => {
        if (!cancelled) {
          setIndex(data);
          setIndexStatus('ready');
          setIndexError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (!hadDisplayable) {
            setIndexStatus('error');
            setIndexError(err instanceof Error ? err.message : 'Could not load catalog');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coordinatesActive) {
      setCoordStatus('idle');
      return;
    }

    const cached = peekCatalogCoordinates();
    if (cached) {
      setCoordBundle(cached);
      setCoordStatus('ready');
    } else {
      setCoordStatus('loading');
    }

    let cancelled = false;
    loadCatalogCoordinates()
      .then((bundle) => {
        if (!cancelled) {
          setCoordBundle(bundle);
          setCoordStatus('ready');
        }
      })
      .catch((err) => {
        console.error('[catalog] coordinates load failed:', err);
        if (!cancelled) setCoordStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [coordinatesActive]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    setViewPage(0);
  }, [debouncedSearch, saleOnly, selectedCats, sortBy]);

  const setSelectedCats = useCallback(
    (cats: string[]) => {
      const next = new URLSearchParams(searchParams);
      next.delete('category');
      if (cats.length === 0) next.delete('cats');
      else next.set('cats', cats.join(','));
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const toggleCat = useCallback(
    (cat: string) => {
      const norm = canonicalCategory(cat);
      const cur = selectedCats.map((c) => canonicalCategory(c));
      const has = cur.some((c) => c.toLowerCase() === norm.toLowerCase());
      const next = has
        ? selectedCats.filter((c) => canonicalCategory(c).toLowerCase() !== norm.toLowerCase())
        : [...selectedCats, cat];
      setSelectedCats(next);
    },
    [selectedCats, setSelectedCats]
  );

  const toggleSaleFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (saleOnly) next.delete('sale');
    else next.set('sale', '1');
    setSearchParams(next);
  }, [saleOnly, searchParams, setSearchParams]);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    const next = new URLSearchParams(searchParams);
    next.delete('cats');
    next.delete('category');
    next.delete('sale');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const retryLoad = useCallback(() => {
    setIndexStatus('loading');
    setIndexError(null);
    loadCatalogIndex()
      .then((data) => {
        setIndex(data);
        setIndexStatus('ready');
      })
      .catch((err: unknown) => {
        setIndexStatus('error');
        setIndexError(err instanceof Error ? err.message : 'Could not load catalog');
      });
  }, []);

  const coordinateLooks = coordinateLooksFromBundle(coordBundle);
  const linkedById = linkedProductsFromBundle(coordBundle);

  const liveCoordinateCount = useMemo(
    () => catalogCoordinateLooks(coordinateLooks, linkedById).length,
    [coordinateLooks, linkedById]
  );

  const coordinatesCatalogReady = !coordinatesActive || coordStatus === 'ready';
  const coordinatesSectionLoading = coordinatesActive && coordStatus === 'loading';
  const productsGridLoading = indexStatus === 'loading' && !index?.products.length;
  const countsLoaded = Boolean(index?.counts.size);

  const categoryOptions = useMemo(
    () =>
      buildCategoryOptions(
        visibleCategories,
        index?.counts ?? new Map(),
        coordinateLooks,
        coordinatesActive,
        liveCoordinateCount
      ),
    [visibleCategories, index?.counts, coordinateLooks, coordinatesActive, liveCoordinateCount]
  );

  const query = useMemo(
    () => ({ selectedCats, sortBy, saleOnly, search: debouncedSearch }),
    [selectedCats, sortBy, saleOnly, debouncedSearch]
  );

  const gridEntries = useMemo(
    () =>
      buildCatalogGridEntries({
        products: index?.products ?? [],
        query,
        coordinatesActive,
        coordinateLooks,
        linkedById,
      }),
    [index?.products, query, coordinatesActive, coordinateLooks, linkedById]
  );

  const totalGridCount = gridEntries.length;
  const totalViewPages = Math.max(1, Math.ceil(totalGridCount / CATALOG_VIEW_PAGE_SIZE));

  const pagedGridEntries = useMemo(() => {
    const start = viewPage * CATALOG_VIEW_PAGE_SIZE;
    return gridEntries.slice(start, start + CATALOG_VIEW_PAGE_SIZE);
  }, [gridEntries, viewPage]);

  useEffect(() => {
    if (viewPage > totalViewPages - 1) {
      setViewPage(Math.max(0, totalViewPages - 1));
    }
  }, [viewPage, totalViewPages]);

  const getProductsForLook = useCallback(
    (look: Parameters<typeof productsForCoordinateLook>[0]) => productsForCoordinateLook(look, linkedById),
    [linkedById]
  );

  return {
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
    coordinatesActive,
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
    coordinatesCatalogReady,
    fetchError: indexError,
    indexComplete: index?.complete ?? true,
    debouncedSearch,
  };
}

export { CATALOG_VIEW_PAGE_SIZE };
