import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { db, collection, getDocs, deleteDoc, doc, query, orderBy } from '../firebase';
import { Plus, Search, Edit2, Trash2, Package, Loader2, RefreshCw, ImageIcon } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';
import { canonicalCategory } from '../lib/category';
import { subscribeCoordinateLooks } from '../lib/coordinatesService';
import {
  coordinateLinkedProductIds,
  productMatchesCoordinatesFilter,
} from '../lib/coordinateProductFilter';
import type { CoordinateLook } from '../types/coordinates';
import { seedDressPants } from '../lib/seed';
import { coerceProductImages } from '../lib/productImages';
import ProductSizeStockChips from '../components/admin/ProductSizeStockChips';
import AdminProductFormModal from '../components/admin/AdminProductFormModal';
import { resolveProductInventory } from '../lib/productInventory';
import { getDiscountPercent, isProductOnSale } from '../lib/productDiscount';

const AdminProducts = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [coordinateLooks, setCoordinateLooks] = useState<CoordinateLook[]>([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    return subscribeCoordinateLooks(setCoordinateLooks);
  }, []);

  const fetchProducts = async () => {
    try {
      setListLoading(true);
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setProducts(list);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setListLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        await fetchProducts();
        toast.success('Product removed from Firestore');
      } catch (error) {
        console.error('Error deleting product:', error);
        toast.error('Could not delete product', {
          description: error instanceof Error ? error.message : 'Check console and Firestore rules.',
        });
      }
    }
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const stats = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    products.forEach((p) => {
      const s = resolveProductInventory(p).stock;
      if (s <= 0) outOfStock += 1;
      else if (s <= 10) lowStock += 1;
      else inStock += 1;
    });
    return { total: products.length, inStock, lowStock, outOfStock };
  }, [products]);

  const coordinateLinkedIds = useMemo(
    () => coordinateLinkedProductIds(coordinateLooks),
    [coordinateLooks]
  );

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const cat = canonicalCategory(p.category) || 'Uncategorized';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    map.Coordinates = products.filter((p) => productMatchesCoordinatesFilter(p, coordinateLinkedIds)).length;
    return map;
  }, [products, coordinateLinkedIds]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'Coordinates') {
          if (!productMatchesCoordinatesFilter(p, coordinateLinkedIds)) return false;
        } else if (canonicalCategory(p.category) !== categoryFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, categoryFilter, coordinateLinkedIds]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const tableThumb = (product: any) =>
    coerceProductImages(product)[0] ||
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200';

  const categoryFilters = ['all', ...Object.keys(CATEGORY_ICONS).filter((k) => k !== 'All')];

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Products</h1>
            <p className="mt-0.5 text-sm text-gray-500">Manage catalog items, pricing, and inventory.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchProducts()}
              disabled={listLoading}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(listLoading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-catchy-dark"
            >
              <Plus size={14} />
              Add product
            </button>
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Total</dt>
            <dd className="font-medium tabular-nums text-gray-900">{stats.total}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">In stock</dt>
            <dd className="font-medium tabular-nums text-catchy-dark">{stats.inStock}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Low</dt>
            <dd className="font-medium tabular-nums text-amber-700">{stats.lowStock}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Out</dt>
            <dd className="font-medium tabular-nums text-red-600">{stats.outOfStock}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4 flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search name, category, ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {categoryFilters.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                categoryFilter === cat ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {cat === 'all' ? 'All' : cat}
              <span className="ml-1 tabular-nums opacity-70">{categoryCounts[cat] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading products…
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">No products found</p>
            <p className="mt-1 text-xs text-gray-500">
              {products.length === 0 ? 'Add your first item to the catalog.' : 'Try a different search or filter.'}
            </p>
            {products.length === 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white hover:bg-catchy-dark"
                >
                  <Plus size={14} />
                  Add product
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await seedDressPants();
                    fetchProducts();
                  }}
                  className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                >
                  Load demo products
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="min-w-[11rem] px-4 py-2.5 font-medium">Inventory</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((product) => {
                    const { sizeStock, stock } = resolveProductInventory(product);
                    const images = coerceProductImages(product);
                    return (
                      <tr key={product.id} className="transition-colors hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                              <img
                                src={tableThumb(product)}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200';
                                }}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-gray-900">{product.name}</p>
                              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="font-mono">{product.id.slice(0, 8)}</span>
                                {images.length > 1 ? (
                                  <span className="inline-flex items-center gap-0.5 text-gray-400">
                                    <ImageIcon size={10} />
                                    {images.length}
                                  </span>
                                ) : null}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {CATEGORY_ICONS[product.category]
                              ? React.createElement(CATEGORY_ICONS[product.category], {
                                  size: 12,
                                  className: 'text-gray-400',
                                })
                              : null}
                            {t(CATEGORY_KEYS[product.category] || product.category || '—')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <ProductSizeStockChips sizeStock={sizeStock} totalStock={stock} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          {isProductOnSale(product) ? (
                            <div className="text-right">
                              <p className="font-medium tabular-nums text-red-600">
                                ILS {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-xs tabular-nums text-gray-400 line-through">
                                ILS {Number(product.compareAtPrice).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                              </p>
                              <span className="inline-flex rounded bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-600">
                                -{getDiscountPercent(Number(product.compareAtPrice), Number(product.price))}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium tabular-nums text-gray-900">
                              ILS {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                              aria-label="Edit"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(product.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-gray-100 md:hidden">
              {filteredProducts.map((product) => {
                const { sizeStock, stock } = resolveProductInventory(product);
                return (
                  <li key={product.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                        <img src={tableThumb(product)} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.category || '—'}</p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-gray-900">ILS {product.price}</p>
                    </div>
                    <div className="mt-2 pl-14">
                      <ProductSizeStockChips sizeStock={sizeStock} totalStock={stock} compact maxVisible={4} />
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Showing {filteredProducts.length} of {products.length} products
      </p>

      <AdminProductFormModal
        open={isModalOpen}
        onClose={closeModal}
        product={editingProduct}
        onSaved={async () => {
          try {
            await fetchProducts();
          } catch (refreshErr) {
            console.error('List refresh failed after save:', refreshErr);
            toast.warning('Saved to Firestore', {
              description:
                'Your product was written to Cloud Firestore, but the list could not refresh. Reload the page to see it.',
            });
          }
        }}
      />
    </div>
  );
};

export default AdminProducts;
