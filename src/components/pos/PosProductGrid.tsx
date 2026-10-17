import React, { useMemo } from 'react';
import { Loader2, PackageX, QrCode, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  filterPosProductsByCategory,
  filterPosProductsBySearch,
  sortPosProductsNewestFirst,
  type PosCategorySelection,
  type PosProduct,
} from '../../lib/pos/posProduct';
import type { PosCartItem } from '../../types/pos';
import PosProductTile from './PosProductTile';

type PosProductGridProps = {
  products: PosProduct[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selection: PosCategorySelection;
  onQuickAdd: (item: Omit<PosCartItem, 'lineKey'>) => void;
  onOpenPicker: (productId: string, colorId: string | null) => void;
  onScanQr: () => void;
};

const PosProductGrid: React.FC<PosProductGridProps> = ({
  products,
  loading,
  search,
  onSearchChange,
  selection,
  onQuickAdd,
  onOpenPicker,
  onScanQr,
}) => {
  const { t, isRTL } = useLanguage();
  const searching = search.trim().length > 0;

  const visibleProducts = useMemo(() => {
    const filtered = searching
      ? filterPosProductsBySearch(products, search)
      : filterPosProductsByCategory(products, selection);
    return sortPosProductsNewestFirst(filtered);
  }, [products, search, searching, selection]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="flex h-full min-h-0 flex-col bg-neutral-950">
      <div className="shrink-0 border-b border-white/8 bg-neutral-900/50 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('pos.search.placeholder')}
            className="h-11 w-full rounded-xl border border-white/8 bg-neutral-900 ps-10 pe-11 text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-catchy/40 focus:bg-neutral-800/80 focus:ring-2 focus:ring-catchy/15"
          />
          <button
            type="button"
            onClick={onScanQr}
            className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-catchy/10 hover:text-catchy active:scale-90"
            aria-label={t('pos.qr.scanButton')}
            title={t('pos.qr.scanButton')}
          >
            <QrCode size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-5 w-5 animate-spin" /> {t('pos.search.loading')}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-600">
            <PackageX className="h-8 w-8" />
            <p className="text-sm">
              {searching ? t('pos.search.noMatch').replace('{q}', search) : t('pos.search.emptyCategory')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {/* Note: columns dip at `lg` on purpose — that's exactly where the cart/category
                panels reclaim fixed width from this grid, so fewer columns keep cards comfortable. */}
            {visibleProducts.map((product) => (
              <PosProductTile
                key={product.id}
                product={product}
                onQuickAdd={onQuickAdd}
                onOpenPicker={(colorId) => onOpenPicker(product.id, colorId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PosProductGrid;
