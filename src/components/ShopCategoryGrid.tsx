import React, { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS } from '../constants';
import { cn } from '../lib/utils';
import { db, doc, onSnapshot } from '../firebase';

/** Editorial images per category — shared by Home and Catalog. */
export const SHOP_TILES: { category: string; image: string }[] = [
  {
    category: 'Dresses',
    image:
      'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Tops',
    image:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Shirts',
    image:
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Pants',
    image:
      'https://images.unsplash.com/photo-1624378439575-d8705ad7e357?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Skirts',
    image:
      'https://images.unsplash.com/photo-1583496661160-fb5886a0aa0b?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Long Skirt Sets',
    image:
      'https://images.unsplash.com/photo-1551048632-24e444b48a3e?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Jackets',
    image:
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Formal Sets',
    image:
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Practical Sets',
    image:
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=85&w=900',
  },
  {
    category: 'Coordinates',
    image:
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=85&w=900',
  },
];

function normalizeCategory(c?: string) {
  if (!c || typeof c !== 'string') return '';
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

export interface ShopCategoryGridProps {
  products: { category?: string }[];
  /** When set (e.g. on Catalog), highlights the active tile. Omit on Home. */
  selectedCategory?: string;
  onSelectTile: (category: string) => void;
  showViewAll?: boolean;
  onViewAll?: () => void;
  className?: string;
}

const ShopCategoryGrid: React.FC<ShopCategoryGridProps> = ({
  products,
  selectedCategory,
  onSelectTile,
  showViewAll,
  onViewAll,
  className,
}) => {
  const { t, isRTL } = useLanguage();
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const ref = doc(db, 'site_settings', 'shop_category_tiles');
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      setImageOverrides(data?.images && typeof data.images === 'object' ? data.images : {});
    });
    return unsub;
  }, []);

  const countInCategory = (cat: string) =>
    products.filter((p) => normalizeCategory(p.category) === normalizeCategory(cat)).length;

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-1 gap-1 bg-white sm:grid-cols-2 lg:grid-cols-3',
          className
        )}
      >
        {SHOP_TILES.map((tile) => {
          const count = countInCategory(tile.category);
          const active = selectedCategory === tile.category;
          const label = t(CATEGORY_KEYS[tile.category] || tile.category);
          const itemLine = t('catalog.itemCount').replace('{n}', String(count));

          return (
            <button
              key={tile.category}
              type="button"
              onClick={() => onSelectTile(tile.category)}
              className={cn(
                'group relative aspect-[4/3] w-full overflow-hidden rounded-none text-center font-sans outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-catchy focus-visible:ring-offset-0',
                active && 'z-[1] ring-2 ring-catchy ring-inset'
              )}
            >
              <img
                src={imageOverrides[tile.category] || tile.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                loading="lazy"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20 transition group-hover:from-black/80"
                aria-hidden
              />
              <div className="relative flex h-full min-h-0 flex-col items-center justify-center px-4 py-6">
                <span className="text-2xl font-semibold tracking-tight text-white drop-shadow md:text-3xl">
                  {label}
                </span>
                <span className="mt-1 text-sm font-normal text-white/95">{itemLine}</span>
                <span
                  className={cn(
                    'mt-5 bg-white px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-catchy-dark',
                    'rounded-none border-0 shadow-none'
                  )}
                >
                  {t('catalog.viewCollection')}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {showViewAll && onViewAll && (
        <div className={cn('mt-6 flex justify-center', isRTL && 'font-arabic')}>
          <button
            type="button"
            onClick={onViewAll}
            className={cn(
              'text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 underline-offset-4 transition hover:text-catchy-dark hover:underline',
              selectedCategory === 'All' && 'text-catchy-dark underline'
            )}
          >
            {t('catalog.viewAll')}
          </button>
        </div>
      )}
    </>
  );
};

export default ShopCategoryGrid;
