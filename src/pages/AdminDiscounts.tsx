import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Percent, Search, Trash2, Tag, Loader2, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  db,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from '../firebase';
import { cn } from '../lib/utils';
import { coerceProductImages } from '../lib/productImages';
import {
  applyPercentToPrice,
  buildDiscountUpdate,
  buildRemoveDiscountUpdate,
  getDiscountPercent,
  isProductOnSale,
  roundPrice,
  validateDiscountInputs,
} from '../lib/productDiscount';
import type { ProductRecord } from '../types/product';

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';

const AdminDiscounts = () => {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPercent, setBulkPercent] = useState('20');
  const [applyModalOpen, setApplyModalOpen] = useState(false);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ProductRecord)));
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Could not load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const discountedProducts = useMemo(
    () => products.filter((p) => isProductOnSale(p)),
    [products]
  );

  const filteredDiscounted = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return discountedProducts;
    return discountedProducts.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
  }, [discountedProducts, searchTerm]);

  const notOnSaleProducts = useMemo(
    () => products.filter((p) => !isProductOnSale(p)),
    [products]
  );

  const filteredForApply = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return notOnSaleProducts.filter((p) => {
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [notOnSaleProducts, searchTerm]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRemoveDiscount = async (product: ProductRecord) => {
    if (!window.confirm(`Remove discount from "${product.name}"? Price will restore to original.`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'products', product.id), {
        ...buildRemoveDiscountUpdate(product),
        updatedAt: serverTimestamp(),
      });
      await fetchProducts();
      toast.success('Discount removed', { description: `"${product.name}" is back at full price.` });
    } catch (error) {
      console.error(error);
      toast.error('Could not remove discount');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkApply = async () => {
    const percent = parseFloat(bulkPercent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
      toast.error('Enter a discount between 1% and 99%');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Select at least one product');
      return;
    }

    setSaving(true);
    let ok = 0;
    let failed = 0;

    for (const id of selectedIds) {
      const product = products.find((p) => p.id === id);
      if (!product || isProductOnSale(product)) continue;

      const basePrice = roundPrice(Number(product.price));
      if (basePrice <= 0) {
        failed += 1;
        continue;
      }

      const salePrice = applyPercentToPrice(basePrice, percent);
      const check = validateDiscountInputs(basePrice, salePrice);
      if (!check.ok) {
        failed += 1;
        continue;
      }

      try {
        await updateDoc(doc(db, 'products', id), {
          ...buildDiscountUpdate(basePrice, salePrice),
          updatedAt: serverTimestamp(),
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }

    setSaving(false);
    setApplyModalOpen(false);
    setSelectedIds(new Set());
    await fetchProducts();

    if (ok > 0) {
      toast.success(`Applied ${percent}% off to ${ok} product${ok === 1 ? '' : 's'}`);
    }
    if (failed > 0) {
      toast.warning(`${failed} product${failed === 1 ? '' : 's'} could not be updated`);
    }
  };

  const tableThumb = (product: ProductRecord) =>
    coerceProductImages(product)[0] ||
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200';

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Discounts</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Create, apply, and remove product sales. Discounts appear on the catalog and product pages.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchProducts()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setApplyModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-catchy-dark"
            >
              <Percent size={14} />
              Apply discount
            </button>
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">On sale</dt>
            <dd className="font-medium tabular-nums text-red-600">{discountedProducts.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Full price</dt>
            <dd className="font-medium tabular-nums text-gray-900">{notOnSaleProducts.length}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4 flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search discounted products…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading discounts…
          </div>
        ) : filteredDiscounted.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Tag className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">No active discounts</p>
            <p className="mt-1 text-xs text-gray-500">
              Apply a percentage discount to products, or set a sale when editing a product.
            </p>
            <button
              type="button"
              onClick={() => setApplyModalOpen(true)}
              className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white hover:bg-catchy-dark"
            >
              <Percent size={14} />
              Apply discount
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Original</th>
                  <th className="px-4 py-2.5 font-medium">Sale price</th>
                  <th className="px-4 py-2.5 font-medium">Off</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDiscounted.map((product) => {
                  const compareAt = Number(product.compareAtPrice);
                  const price = Number(product.price);
                  const pct = getDiscountPercent(compareAt, price);
                  return (
                    <tr key={product.id} className="transition-colors hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                            <img src={tableThumb(product)} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.category || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-400 line-through">
                        ILS {compareAt.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums text-red-600">
                        ILS {price.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                          -{pct}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleRemoveDiscount(product)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {applyModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setApplyModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-xl sm:rounded-xl"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Apply discount</h2>
                  <p className="text-xs text-gray-500">Select products and set a percentage off their current price.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setApplyModalOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="border-b border-gray-100 px-4 py-3">
                <label className="mb-1 block text-xs font-medium text-gray-500">Discount percentage</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={bulkPercent}
                    onChange={(e) => setBulkPercent(e.target.value)}
                    className={cn(INPUT, 'max-w-[6rem]')}
                  />
                  <span className="text-sm text-gray-500">% off current price</span>
                </div>
              </div>

              <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: '50vh' }}>
                <p className="mb-2 text-xs font-medium text-gray-500">
                  {selectedIds.size} selected · {filteredForApply.length} available
                </p>
                <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                  {filteredForApply.slice(0, 100).map((product) => {
                    const base = Number(product.price);
                    const preview = applyPercentToPrice(base, parseFloat(bulkPercent) || 0);
                    const checked = selectedIds.has(product.id);
                    return (
                      <li key={product.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(product.id)}
                            className="h-4 w-4 rounded border-gray-300 text-catchy focus:ring-catchy"
                          />
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-gray-100">
                            <img src={tableThumb(product)} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">
                              ILS {base.toFixed(2)} →{' '}
                              <span className="font-semibold text-red-600">ILS {preview.toFixed(2)}</span>
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex gap-2 border-t border-gray-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setApplyModalOpen(false)}
                  className="h-9 flex-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || selectedIds.size === 0}
                  onClick={handleBulkApply}
                  className="h-9 flex-[2] rounded-md bg-catchy text-sm font-semibold text-white hover:bg-catchy-dark disabled:opacity-50"
                >
                  {saving ? 'Applying…' : `Apply to ${selectedIds.size} product${selectedIds.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDiscounts;
