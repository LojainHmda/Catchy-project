import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Trash2, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { canonicalCategory } from '../../lib/category';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { getCoordinateImages } from '../../lib/coordinateImages';
import CoordinateImageCollage from '../CoordinateImageCollage';
import { resolveCoordinate, itemsTotalForLook } from '../../lib/coordinateResolve';
import { validateCoordinateLook, coordinateSizesSummary } from '../../lib/coordinatesValidation';
import { formatSizeStockSummary, resolveProductInventory } from '../../lib/productInventory';
import type { CoordinateLook } from '../../types/coordinates';

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';
const LABEL = 'mb-1 block text-xs font-medium text-gray-500';
const MAX_PRODUCTS = 4;

export type CoordinateLookDraft = {
  title: string;
  titleAr: string;
  price: number;
  priceAutoSync: boolean;
  productIds: string[];
};

export type CoordinateEditDrawerProps = {
  look: CoordinateLook | null;
  open: boolean;
  saving: boolean;
  onClose: () => void;
  allProducts: any[];
  productsById: Record<string, any>;
  onSave: (id: string, draft: CoordinateLookDraft, publish: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const CoordinateEditDrawer: React.FC<CoordinateEditDrawerProps> = ({
  look,
  open,
  saving,
  onClose,
  allProducts,
  productsById,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [price, setPrice] = useState('');
  const [priceAutoSync, setPriceAutoSync] = useState(true);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!look) return;
    setTitle(look.title);
    setTitleAr(look.titleAr ?? '');
    setPriceAutoSync(look.priceAutoSync !== false);
    setProductIds(look.productIds ?? []);
    setProductQuery('');
    setDirty(false);
    const linked = (look.productIds ?? []).map((id) => productsById[id]).filter(Boolean);
    const itemsTotal = itemsTotalForLook(look, linked);
    const displayPrice =
      look.priceAutoSync !== false ? itemsTotal : look.price && look.price > 0 ? look.price : itemsTotal;
    setPrice(displayPrice > 0 ? String(displayPrice) : '');
  }, [look?.id, open]);

  const linkedProducts = productIds.map((id) => productsById[id]).filter(Boolean);
  const draftLook = useMemo(
    (): Pick<CoordinateLook, 'productIds' | 'price' | 'priceAutoSync' | 'image' | 'images'> => ({
      productIds,
      price: Number(price) || 0,
      priceAutoSync,
      image: '',
      images: [],
    }),
    [productIds, price, priceAutoSync]
  );
  const collageImages = getCoordinateImages(draftLook, linkedProducts);
  const resolved = resolveCoordinate(
    { ...draftLook, title, titleAr: titleAr || undefined },
    linkedProducts
  );
  const itemsTotal = itemsTotalForLook(draftLook, linkedProducts);

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    let pool = allProducts;
    if (!q) {
      const coords = allProducts.filter((p) => canonicalCategory(p.category) === 'Coordinates');
      const rest = allProducts.filter((p) => canonicalCategory(p.category) !== 'Coordinates');
      pool = [...coords, ...rest];
      return pool.slice(0, 8);
    }
    return pool
      .filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allProducts, productQuery]);

  const toggleProduct = (productId: string) => {
    setDirty(true);
    setProductIds((prev) => {
      const has = prev.includes(productId);
      if (has) return prev.filter((id) => id !== productId);
      if (prev.length >= MAX_PRODUCTS) {
        toast.error(`Maximum ${MAX_PRODUCTS} items per set`);
        return prev;
      }
      const next = [...prev, productId];
      if (priceAutoSync) {
        const linked = next.map((id) => productsById[id]).filter(Boolean);
        const total = itemsTotalForLook({ productIds: next }, linked);
        if (total > 0) setPrice(String(total));
      }
      return next;
    });
  };

  const buildDraft = (): CoordinateLookDraft => ({
    title: title.trim(),
    titleAr: titleAr.trim(),
    price: Number(price) || 0,
    priceAutoSync,
    productIds,
  });

  const handleSave = async (publish: boolean) => {
    if (!look) return;
    const draft = buildDraft();
    const check = validateCoordinateLook(
      { ...look, ...draft, title: draft.title, titleAr: draft.titleAr || undefined },
      linkedProducts
    );
    if (!check.ok) {
      toast.error(publish ? 'Cannot publish' : 'Cannot save', { description: check.message });
      return;
    }
    try {
      await onSave(look.id, draft, publish);
      setDirty(false);
      if (publish) onClose();
    } catch {
      /* toast handled in parent */
    }
  };

  if (!look) return null;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            aria-label="Close editor"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{title || look.title}</p>
                <p className="text-[11px] text-gray-400">
                  {dirty ? 'Unsaved changes' : look.published !== false ? 'Live on catalog' : 'Draft — not published'}
                </p>
              </div>
              <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div>
                <label className={LABEL}>Catalog collage (from item photos)</label>
                {collageImages.length > 0 ? (
                  <CoordinateImageCollage images={collageImages} variant="card" className="max-w-[11rem]" />
                ) : (
                  <p className="rounded-md border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                    Add products with photos — the grid builds automatically.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LABEL}>Title (EN)</label>
                  <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Title (AR)</label>
                  <input value={titleAr} dir="rtl" onChange={(e) => { setTitleAr(e.target.value); setDirty(true); }} className={INPUT} />
                </div>
              </div>

              <div>
                <label className={LABEL}>Items in this set (max {MAX_PRODUCTS})</label>
                <p className="mb-2 text-[11px] text-gray-400">
                  Stock and sizes come from each product. Shoppers pick a size per item when ordering.
                </p>
                {linkedProducts.length > 0 ? (
                  <ul className="mb-2 space-y-1 rounded-md border border-gray-100 bg-gray-50/50 p-1">
                    {linkedProducts.map((p) => {
                      const { sizeStock } = resolveProductInventory(p);
                      const sizeLabel = formatSizeStockSummary(sizeStock, 3);
                      return (
                        <li key={p.id} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs">
                          <img src={coerceProductImages(p)[0] ?? PRODUCT_IMAGE_PLACEHOLDER} alt="" className="h-8 w-6 rounded object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-gray-900">{p.name}</p>
                            <p className="text-[10px] text-gray-500">ILS {p.price} · {sizeLabel}</p>
                          </div>
                          <button type="button" onClick={() => toggleProduct(p.id)} className="shrink-0 text-gray-400 hover:text-red-500">
                            <X size={12} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products to add…"
                    className={cn(INPUT, 'pl-8')}
                  />
                </div>
                {(productQuery.trim() || productIds.length < MAX_PRODUCTS) && (
                  <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-gray-100">
                    {productResults.map((p) => {
                      if (productIds.includes(p.id)) return null;
                      const { sizeStock } = resolveProductInventory(p);
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={productIds.length >= MAX_PRODUCTS}
                            onClick={() => toggleProduct(p.id)}
                            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-gray-50 disabled:opacity-40"
                          >
                            <img src={coerceProductImages(p)[0] ?? PRODUCT_IMAGE_PLACEHOLDER} alt="" className="h-7 w-5 rounded object-cover" />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="shrink-0 tabular-nums text-[10px] text-gray-500">ILS {p.price}</span>
                            <span className="shrink-0 text-[10px] text-gray-400">{formatSizeStockSummary(sizeStock, 2)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-gray-700">Set price (ILS)</label>
                  {itemsTotal > 0 ? <span className="text-[10px] text-gray-500">Items total: ILS {itemsTotal}</span> : null}
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceAutoSync(false);
                    setDirty(true);
                  }}
                  className={INPUT}
                  placeholder={itemsTotal > 0 ? String(itemsTotal) : 'Add items first'}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={itemsTotal <= 0}
                    onClick={() => {
                      setPrice(String(itemsTotal));
                      setPriceAutoSync(true);
                      setDirty(true);
                    }}
                    className="text-[11px] font-medium text-catchy hover:underline disabled:text-gray-400"
                  >
                    Sync from items
                  </button>
                  {priceAutoSync ? (
                    <span className="text-[10px] text-emerald-700">Follows items total</span>
                  ) : (
                    <span className="text-[10px] text-amber-700">Custom bundle price</span>
                  )}
                </div>
              </div>

              {resolved ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs">
                  <p className="font-semibold text-emerald-900">Preview</p>
                  <p className="mt-1 tabular-nums text-emerald-800">
                    ILS {resolved.price}
                    {resolved.compareAtPrice && resolved.compareAtPrice > resolved.price ? (
                      <span className="ms-2 text-gray-500 line-through">ILS {resolved.compareAtPrice}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-emerald-700">
                    Sizes: {coordinateSizesSummary({ ...look, productIds }, linkedProducts)}
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="flex shrink-0 flex-wrap gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(false)}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save draft'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="inline-flex h-9 flex-[1.2] items-center justify-center rounded-md bg-catchy text-xs font-semibold text-white hover:bg-catchy-dark disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save & publish'}
              </button>
              <button
                type="button"
                onClick={() => onDelete(look.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export default CoordinateEditDrawer;
