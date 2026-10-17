import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { db, collection, getDocs, doc, updateDoc, query, orderBy, limit, startAfter } from '../firebase';
import { Plus, Search, Edit2, Trash2, Package, Loader2, RefreshCw, ImageIcon, ChevronDown, Eye, EyeOff, QrCode, Barcode } from 'lucide-react';
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
import { cloudinaryTransform } from '../lib/cloudinaryTransform';
import { deleteProductPermanently } from '../lib/admin/deleteProduct';
import ProductSizeStockChips from '../components/admin/ProductSizeStockChips';
import AdminProductFormModal from '../components/admin/AdminProductFormModal';
import AdminProductQrModal from '../components/admin/AdminProductQrModal';
import AdminProductBarcodeModal from '../components/admin/AdminProductBarcodeModal';
import AdminCategoriesPanel from '../components/admin/AdminCategoriesPanel';
import { resolveProductInventory } from '../lib/productInventory';
import { getDiscountPercent, isProductOnSale } from '../lib/productDiscount';
import { hasNewArrivalTag, MAX_NEW_ARRIVAL_PRODUCTS, migrateLegacyNewArrivalProducts, productCategoryLabel } from '../lib/productTags';

const PAGE_SIZE = 50;

type ListTab = 'all' | 'new_arrivals' | 'categories';

type StockFilter = 'all' | 'in' | 'low' | 'out';

/** Bucket a product's total stock — thresholds match the header stats (Low ≤ 10, Out = 0). */
function stockStatusOf(stock: number): Exclude<StockFilter, 'all'> {
  if (stock <= 0) return 'out';
  if (stock <= 10) return 'low';
  return 'in';
}

const AdminProducts = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [qrProduct, setQrProduct] = useState<any>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [listTab, setListTab] = useState<ListTab>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [coordinateLooks, setCoordinateLooks] = useState<CoordinateLook[]>([]);

  const lastDocRef = useRef<any>(null);
  const migrationDoneRef = useRef(false);

  const fetchProducts = useCallback(async () => {
    setListLoading(true);
    lastDocRef.current = null;
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.docs.length === PAGE_SIZE);
      setProducts(list);

      // Run legacy migration once in background — never blocks initial render
      if (!migrationDoneRef.current && list.length > 0) {
        migrationDoneRef.current = true;
        migrateLegacyNewArrivalProducts(db, list)
          .then(async (migrated) => {
            if (migrated > 0) {
              toast.success(t('admin.products.page.toastNewArrivalsSynced'), {
                description: t('admin.products.page.toastNewArrivalsDesc').replace('{n}', String(migrated)),
              });
              // Reload first page to reflect updated tags
              const snap2 = await getDocs(
                query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
              );
              const list2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
              lastDocRef.current = snap2.docs[snap2.docs.length - 1] ?? null;
              setHasMore(snap2.docs.length === PAGE_SIZE);
              setProducts(list2);
            }
          })
          .catch((err) => console.warn('Migration check failed:', err));
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'products'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const newDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (snap.docs.length > 0) lastDocRef.current = snap.docs[snap.docs.length - 1];
      setHasMore(snap.docs.length === PAGE_SIZE);
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...newDocs.filter((d) => !seen.has(d.id))];
      });
    } catch (error) {
      console.error('Error loading more products:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    return subscribeCoordinateLooks(setCoordinateLooks);
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('admin.products.page.confirmDelete'))) {
      try {
        await deleteProductPermanently(id);
        setProducts((prev) => prev.filter((p) => p.id !== id));
        toast.success(t('admin.products.page.toastDeleted'));
      } catch (error) {
        console.error('Error deleting product:', error);
        toast.error(t('admin.products.page.toastDeleteFailed'), {
          description: error instanceof Error ? error.message : t('admin.products.page.toastDeleteFailedDesc'),
        });
      }
    }
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleToggleVisibility = async (product: any) => {
    const nextVisible = product.visible === false;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, visible: nextVisible } : p)));
    try {
      await updateDoc(doc(db, 'products', product.id), { visible: nextVisible });
      toast.success(nextVisible ? t('admin.products.page.toastShown') : t('admin.products.page.toastHidden'));
    } catch (error) {
      console.error('Error toggling product visibility:', error);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, visible: !nextVisible } : p)));
      toast.error(t('admin.products.page.toastVisibilityFailed'), {
        description: error instanceof Error ? error.message : t('admin.products.page.toastDeleteFailedDesc'),
      });
    }
  };

  const stats = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    products.forEach((p) => {
      const status = stockStatusOf(resolveProductInventory(p).stock);
      if (status === 'out') outOfStock += 1;
      else if (status === 'low') lowStock += 1;
      else inStock += 1;
    });
    return { total: products.length, inStock, lowStock, outOfStock };
  }, [products]);

  const coordinateLinkedIds = useMemo(
    () => coordinateLinkedProductIds(coordinateLooks),
    [coordinateLooks]
  );

  const newArrivalCount = useMemo(
    () => products.filter((p) => hasNewArrivalTag(p)).length,
    [products]
  );

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const cat = productCategoryLabel(p.category) || 'Uncategorized';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    map.Coordinates = products.filter((p) => productMatchesCoordinatesFilter(p, coordinateLinkedIds)).length;
    return map;
  }, [products, coordinateLinkedIds]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (listTab === 'new_arrivals') {
        if (!hasNewArrivalTag(p)) return false;
      } else if (categoryFilter !== 'all') {
        if (categoryFilter === 'Coordinates') {
          if (!productMatchesCoordinatesFilter(p, coordinateLinkedIds)) return false;
        } else if (canonicalCategory(p.category) !== categoryFilter) {
          return false;
        }
      }
      if (stockFilter !== 'all' && stockStatusOf(resolveProductInventory(p).stock) !== stockFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, listTab, categoryFilter, stockFilter, coordinateLinkedIds]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const tableThumb = (product: any) =>
    cloudinaryTransform(
      coerceProductImages(product)[0] ||
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200',
      { width: 44, height: 44 }
    );

  const categoryFilters = ['all', ...Object.keys(CATEGORY_ICONS).filter((k) => k !== 'All')];

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{t('admin.nav.products')}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('admin.products.page.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchProducts()}
              disabled={listLoading}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(listLoading && 'animate-spin')} />
              {t('admin.common.refresh')}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-catchy-dark"
            >
              <Plus size={14} />
              {t('admin.products.page.addProduct')}
            </button>
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.common.total')}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{stats.total}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.products.page.statInStock')}</dt>
            <dd className="font-medium tabular-nums text-catchy-dark">{stats.inStock}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.products.page.statLow')}</dt>
            <dd className="font-medium tabular-nums text-amber-700">{stats.lowStock}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">{t('admin.products.page.statOut')}</dt>
            <dd className="font-medium tabular-nums text-red-600">{stats.outOfStock}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setListTab('all')}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            listTab === 'all'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {t('admin.products.page.tabAll')}
          <span className="ms-1.5 tabular-nums text-xs font-normal opacity-70">{products.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setListTab('new_arrivals')}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            listTab === 'new_arrivals'
              ? 'border-catchy text-catchy-dark'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {t('cat.newArrivals')}
          <span className="ms-1.5 tabular-nums text-xs font-normal opacity-70">
            {newArrivalCount}/{MAX_NEW_ARRIVAL_PRODUCTS}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setListTab('categories')}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            listTab === 'categories'
              ? 'border-catchy text-catchy-dark'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {t('admin.products.page.tabCategories')}
        </button>
      </div>

      {listTab === 'categories' ? (
        <div className="mt-4">
          <AdminCategoriesPanel />
        </div>
      ) : (
      <>
      <div className="mt-4 flex flex-col gap-3 border-b border-gray-200 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder={t('admin.products.page.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 bg-white ps-9 pe-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
            />
          </div>
          <div className="relative w-full sm:w-auto">
            <Package className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              aria-label={t('admin.products.page.filterStockAria')}
              className={cn(
                'h-9 w-full appearance-none rounded-md border bg-white ps-9 pe-8 text-sm outline-none transition focus:border-gray-400 sm:w-auto',
                stockFilter === 'all' ? 'border-gray-200 text-gray-700' : 'border-gray-900 font-medium text-gray-900'
              )}
            >
              <option value="all">{t('admin.products.page.stockAll').replace('{n}', String(stats.total))}</option>
              <option value="in">{t('admin.products.page.stockIn').replace('{n}', String(stats.inStock))}</option>
              <option value="low">{t('admin.products.page.stockLow').replace('{n}', String(stats.lowStock))}</option>
              <option value="out">{t('admin.products.page.stockOut').replace('{n}', String(stats.outOfStock))}</option>
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
          </div>
        </div>
        {listTab === 'all' ? (
          <div className="flex flex-wrap gap-1.5">
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
                {cat === 'all' ? t('cat.all') : t(CATEGORY_KEYS[cat] || cat)}
                <span className="ms-1 tabular-nums opacity-70">{categoryCounts[cat] ?? 0}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('admin.products.page.loading')}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">{t('admin.products.page.emptyTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">
              {products.length === 0
                ? t('admin.products.page.emptyFirstItem')
                : listTab === 'new_arrivals'
                  ? t('admin.products.page.emptyNewArrivals')
                  : t('admin.products.page.emptyFilter')}
            </p>
            {products.length === 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white hover:bg-catchy-dark"
                >
                  <Plus size={14} />
                  {t('admin.products.page.addProduct')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await seedDressPants();
                    fetchProducts();
                  }}
                  className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
                >
                  {t('admin.products.page.loadDemo')}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                    <th className="px-4 py-2.5 font-medium">{t('admin.orders.table.product')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('admin.products.page.colCategory')}</th>
                    <th className="min-w-[11rem] px-4 py-2.5 font-medium">{t('admin.products.page.colInventory')}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t('admin.products.page.colPrice')}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t('admin.products.page.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((product) => {
                    const { sizeStock, stock } = resolveProductInventory(product);
                    const images = coerceProductImages(product);
                    const displayCategory = productCategoryLabel(product.category);
                    return (
                      <tr key={product.id} className="transition-colors hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                              <img
                                src={tableThumb(product)}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
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
                                {hasNewArrivalTag(product) ? (
                                  <span className="rounded bg-catchy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-catchy-dark">
                                    {t('cat.newArrivals')}
                                  </span>
                                ) : null}
                                {product.visible === false ? (
                                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                                    {t('coordinates.hiddenBadge')}
                                  </span>
                                ) : null}
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
                            {displayCategory
                              ? t(CATEGORY_KEYS[displayCategory] || displayCategory)
                              : t('admin.products.page.setCategory')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <ProductSizeStockChips sizeStock={sizeStock} totalStock={stock} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-end">
                          {isProductOnSale(product) ? (
                            <div className="text-end">
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
                              onClick={() => setQrProduct(product)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                              aria-label={t('admin.products.page.qrCode')}
                              title={t('admin.products.page.qrCode')}
                            >
                              <QrCode size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setBarcodeProduct(product)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                              aria-label={t('admin.products.page.barcode')}
                              title={t('admin.products.page.barcode')}
                            >
                              <Barcode size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleVisibility(product)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                              aria-label={product.visible === false ? t('admin.products.page.showOnShop') : t('admin.products.page.hideFromShop')}
                              title={product.visible === false ? t('admin.products.page.showOnShop') : t('admin.products.page.hideFromShop')}
                            >
                              {product.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                              aria-label={t('admin.common.edit')}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(product.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                              aria-label={t('admin.common.delete')}
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
                const displayCategory = productCategoryLabel(product.category);
                return (
                  <li key={product.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                        <img src={tableThumb(product)} alt="" className="h-full w-full object-cover" loading="lazy"/>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                          <span>{displayCategory ? t(CATEGORY_KEYS[displayCategory] || displayCategory) : t('admin.products.page.setCategory')}</span>
                          {hasNewArrivalTag(product) ? (
                            <span className="rounded bg-catchy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-catchy-dark">
                              {t('cat.newArrivals')}
                            </span>
                          ) : null}
                          {product.visible === false ? (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                              {t('coordinates.hiddenBadge')}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-gray-900">ILS {product.price}</p>
                    </div>
                    <div className="mt-2 ps-14">
                      <ProductSizeStockChips sizeStock={sizeStock} totalStock={stock} compact maxVisible={4} />
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => setQrProduct(product)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                        aria-label={t('admin.products.page.qrCode')}
                      >
                        <QrCode size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarcodeProduct(product)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                        aria-label={t('admin.products.page.barcode')}
                      >
                        <Barcode size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(product)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                        aria-label={product.visible === false ? t('admin.products.page.showOnShop') : t('admin.products.page.hideFromShop')}
                      >
                        {product.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                        aria-label={t('admin.common.edit')}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={t('admin.common.delete')}
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

      <div className="mt-3 flex flex-col items-center gap-2">
        {hasMore && !searchTerm && listTab === 'all' && categoryFilter === 'all' && stockFilter === 'all' ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ChevronDown size={14} />
            )}
            {t('admin.products.page.loadMore')}
          </button>
        ) : null}
        {hasMore && (searchTerm || listTab === 'new_arrivals' || categoryFilter !== 'all' || stockFilter !== 'all') ? (
          <p className="text-[11px] text-amber-700">
            {t('admin.products.page.partialSearchNotice').replace('{n}', String(products.length))}{' '}
            <button
              type="button"
              onClick={loadMore}
              className="underline underline-offset-2 hover:text-amber-900"
            >
              {t('admin.products.page.loadMoreShort')}
            </button>
            {t('admin.products.page.partialSearchSuffix')}
          </p>
        ) : null}
        <p className="text-xs text-gray-400">
          {t('admin.products.page.showingCount')
            .replace('{shown}', String(filteredProducts.length))
            .replace('{total}', String(products.length))
            .replace('{plus}', hasMore ? '+' : '')}
        </p>
      </div>
      </>
      )}

      <AdminProductFormModal
        open={isModalOpen}
        onClose={closeModal}
        product={editingProduct}
        newArrivalCount={newArrivalCount}
        onSaved={async () => {
          try {
            await fetchProducts();
          } catch (refreshErr) {
            console.error('List refresh failed after save:', refreshErr);
            toast.warning(t('admin.products.page.toastSavedRefreshFailed'), {
              description: t('admin.products.page.toastSavedRefreshFailedDesc'),
            });
          }
        }}
      />

      <AdminProductQrModal open={!!qrProduct} onClose={() => setQrProduct(null)} product={qrProduct} />
      <AdminProductBarcodeModal
        open={!!barcodeProduct}
        onClose={() => setBarcodeProduct(null)}
        product={barcodeProduct}
      />
    </div>
  );
};

export default AdminProducts;
