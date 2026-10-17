import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { loadCatalogIndex, peekCatalogIndexStale } from '../lib/catalog/catalogService';
import type { CatalogListProduct } from '../lib/catalogProductList';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import { cloudinaryTransform } from '../lib/cloudinaryTransform';

const MAX_RESULTS = 6;

export type SearchOverlayProps = {
  /** Where the trigger icon sits in the header — controls which side the dropdown anchors to. */
  variant?: 'desktop' | 'mobile';
  iconSize?: string;
};

const SearchOverlay: React.FC<SearchOverlayProps> = ({ variant = 'desktop', iconSize = '22px' }) => {
  const { t, isRTL, language } = useLanguage();
  const navigate = useNavigate();
  const isAr = language === 'ar';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<CatalogListProduct[]>(
    () => peekCatalogIndexStale()?.products ?? []
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (products.length === 0) {
      loadCatalogIndex()
        .then((data) => setProducts(data.products))
        .catch(() => {});
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open, products.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return [];
    return products
      .filter((p) => {
        const haystack = [p.name, p.category, ...(p.collections ?? [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, MAX_RESULTS);
  }, [products, needle]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const goToCatalogWithQuery = () => {
    const q = query.trim();
    close();
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog');
  };

  const anchorRight = variant === 'mobile' ? !isRTL : isRTL;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('catalog.search')}
        className="shrink-0 hover:opacity-70 transition-opacity"
      >
        <span className="material-symbols-outlined text-on-surface" style={{ fontSize: iconSize }}>
          search
        </span>
      </button>

      {open && (
        <div
          dir={isRTL ? 'rtl' : 'ltr'}
          className={cn(
            'absolute top-full z-[60] mt-3 w-[21rem] max-w-[88vw] overflow-hidden rounded-xl border border-outline-variant/40 bg-white shadow-xl',
            anchorRight ? 'right-0' : 'left-0'
          )}
        >
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (results.length === 1) {
                close();
                navigate(`/product/${results[0].id}`);
              } else if (query.trim()) {
                goToCatalogWithQuery();
              }
            }}
            className="flex items-center gap-2 border-b border-outline-variant/30 px-3 py-2.5"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>
              search
            </span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('catalog.search')}
              dir={isRTL ? 'rtl' : 'ltr'}
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
              style={{ fontFamily: isAr ? undefined : 'var(--font-body)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear"
                className="shrink-0 text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  close
                </span>
              </button>
            )}
          </form>

          {needle && (
            <div className="max-h-[26rem] overflow-y-auto">
              {results.length > 0 ? (
                <>
                  <ul>
                    {results.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={`/product/${p.id}`}
                          onClick={close}
                          className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-container"
                        >
                          <img
                            src={cloudinaryTransform(p.images?.[0] || PRODUCT_IMAGE_PLACEHOLDER, { width: 40, height: 48 })}
                            alt=""
                            loading="lazy"
                            className="h-12 w-10 shrink-0 rounded-md bg-surface-container object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span dir="auto" className="block truncate text-sm font-medium text-on-surface">
                              {p.name}
                            </span>
                            <span className="block text-xs text-on-surface-variant">ILS {p.price}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={goToCatalogWithQuery}
                    className="block w-full border-t border-outline-variant/30 px-3 py-2.5 text-center text-xs font-semibold text-primary hover:bg-surface-container"
                  >
                    {isAr ? 'عرض كل النتائج' : 'View all results'}
                  </button>
                </>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-on-surface-variant">
                  {isAr ? 'لا توجد نتائج' : 'No results found'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchOverlay;
