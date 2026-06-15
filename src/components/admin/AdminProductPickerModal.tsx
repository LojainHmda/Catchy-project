import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Check, Square, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CATEGORY_ICONS } from '../../constants';
import { cn } from '../../lib/utils';
import { canonicalCategory } from '../../lib/category';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';

export type AdminProductPickerModalProps = {
  open: boolean;
  onClose: () => void;
  products: Array<{ id: string; name?: string; price?: number; category?: string }>;
  selectedIds: string[];
  maxSelection: number;
  onSelectMany: (productIds: string[]) => void;
};

const AdminProductPickerModal: React.FC<AdminProductPickerModalProps> = ({
  open,
  onClose,
  products,
  selectedIds,
  maxSelection,
  onSelectMany,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) {
      setSearch('');
      setCategoryFilter('all');
      setPickedIds(new Set());
    }
  }, [open]);

  const categoryFilters = useMemo(
    () => ['all', ...Object.keys(CATEGORY_ICONS).filter((k) => k !== 'All')],
    []
  );

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const cat = canonicalCategory(p.category) || 'Uncategorized';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...products]
      .filter((p) => p?.id)
      .filter((p) => {
        if (categoryFilter !== 'all' && canonicalCategory(p.category) !== categoryFilter) return false;
        if (!q) return true;
        return (
          String(p.name ?? '').toLowerCase().includes(q) ||
          String(p.category ?? '').toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  }, [products, search, categoryFilter]);

  const inSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const remainingSlots = Math.max(0, maxSelection - selectedIds.length);
  const pickedCount = pickedIds.size;

  const togglePick = (productId: string) => {
    if (inSet.has(productId)) return;
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
        return next;
      }
      if (next.size >= remainingSlots) return prev;
      next.add(productId);
      return next;
    });
  };

  const selectableVisible = useMemo(
    () => filtered.filter((p) => !inSet.has(p.id)),
    [filtered, inSet]
  );

  const selectAllVisible = () => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      for (const p of selectableVisible) {
        if (next.size >= remainingSlots) break;
        next.add(p.id);
      }
      return next;
    });
  };

  const clearPicked = () => setPickedIds(new Set());

  const handleAddSelected = () => {
    if (pickedCount === 0) return;
    onSelectMany([...pickedIds]);
    setPickedIds(new Set());
    onClose();
  };

  const chipClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    );

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]"
            aria-label="Close picker"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-picker-title"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            className="fixed left-1/2 top-1/2 z-[61] flex max-h-[min(36rem,90vh)] w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div>
                <h2 id="product-picker-title" className="text-sm font-semibold text-gray-900">
                  Select items
                </h2>
                <p className="text-[11px] text-gray-500">
                  {selectedIds.length}/{maxSelection} in set
                  {remainingSlots > 0 ? ` · ${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} left` : ' · set full'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </header>

            <div className="shrink-0 space-y-2 border-b border-gray-100 px-4 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, category, ID…"
                  className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-catchy"
                />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categoryFilters.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={chipClass(categoryFilter === cat)}
                  >
                    {cat === 'all' ? 'All' : cat}
                    <span className="ms-1 tabular-nums opacity-70">{categoryCounts[cat] ?? 0}</span>
                  </button>
                ))}
              </div>
              {remainingSlots > 0 && selectableVisible.length > 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-gray-500">
                    {pickedCount > 0 ? `${pickedCount} selected` : `${selectableVisible.length} shown`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      className="text-[10px] font-semibold text-catchy hover:underline"
                    >
                      Select all shown
                    </button>
                    {pickedCount > 0 ? (
                      <button
                        type="button"
                        onClick={clearPicked}
                        className="text-[10px] font-medium text-gray-500 hover:underline"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-gray-500">No products match.</li>
              ) : (
                filtered.map((p) => {
                  const alreadyInSet = inSet.has(p.id);
                  const picked = pickedIds.has(p.id);
                  const disabled = !alreadyInSet && !picked && pickedIds.size >= remainingSlots;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => togglePick(p.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs transition',
                          (picked || alreadyInSet) && 'bg-catchy/10 ring-1 ring-catchy/25',
                          !picked && !alreadyInSet && !disabled && 'hover:bg-gray-50',
                          disabled && 'cursor-not-allowed opacity-40',
                          alreadyInSet && 'cursor-default'
                        )}
                      >
                        <span className="shrink-0 text-catchy">
                          {alreadyInSet || picked ? (
                            <CheckSquare size={16} strokeWidth={2} />
                          ) : (
                            <Square size={16} strokeWidth={2} className="text-gray-300" />
                          )}
                        </span>
                        <img
                          src={coerceProductImages(p)[0] ?? PRODUCT_IMAGE_PLACEHOLDER}
                          alt=""
                          className="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-black/5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900">{p.name ?? 'Product'}</p>
                          <p className="text-[10px] text-gray-500">
                            ILS {Number(p.price) || 0}
                            {p.category ? ` · ${p.category}` : ''}
                          </p>
                        </div>
                        {alreadyInSet ? (
                          <span className="shrink-0 text-[9px] font-bold uppercase text-catchy">In set</span>
                        ) : picked ? (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-catchy text-white">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <footer className="flex shrink-0 gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pickedCount === 0 || remainingSlots === 0}
                onClick={handleAddSelected}
                className="inline-flex h-9 flex-[1.4] items-center justify-center rounded-md bg-catchy text-xs font-semibold text-white hover:bg-catchy-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pickedCount > 0 ? `Add ${pickedCount} item${pickedCount === 1 ? '' : 's'}` : 'Add selected'}
              </button>
            </footer>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export default AdminProductPickerModal;
