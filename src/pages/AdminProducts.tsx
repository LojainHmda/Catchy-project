import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from '../firebase';
import { Plus, Search, Edit2, Trash2, X, Upload, Package, Loader2, RefreshCw, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';
import { seedDressPants } from '../lib/seed';
import { fileToAdminImageDataUrl } from '../lib/images';
import { coerceProductImages } from '../lib/productImages';
import ProductSizeStockChips from '../components/admin/ProductSizeStockChips';
import {
  newSizeRow,
  resolveProductInventory,
  rowsToSizeStock,
  sizeStockToRows,
  totalFromSizeStock,
  type SizeRow,
} from '../lib/productInventory';

const MAX_PRODUCT_IMAGES = 6;
const MAX_FILE_BEFORE_COMPRESS = 15 * 1024 * 1024; // 15MB — compressed before save

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';
const LABEL = 'mb-1 block text-xs font-medium text-gray-500';

const AdminProducts = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [customSizeInput, setCustomSizeInput] = useState('');

  const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

  const emptyForm = () => ({
    name: '',
    description: '',
    price: '',
    category: '',
    images: [] as string[],
    videos: [] as string[],
    sizeRows: [] as SizeRow[],
    lifestyleImage: '',
  });

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchProducts();
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const input = e.target;
    if (!files?.length) return;

    const picked = Array.from(files).filter(
      (f): f is File => f instanceof File && f.type.startsWith('image/')
    );
    if (picked.length === 0) {
      toast.error('Invalid file type', {
        description: 'Choose image files only (JPEG, PNG, WebP, GIF).',
      });
      input.value = '';
      return;
    }

    const oversize = picked.find((f) => f.size > MAX_FILE_BEFORE_COMPRESS);
    if (oversize) {
      toast.error('File too large', {
        description: `"${oversize.name}" exceeds the 15 MB per file limit.`,
      });
      input.value = '';
      return;
    }

    setUploadingImages(true);
    try {
      const capped = picked.slice(0, MAX_PRODUCT_IMAGES);
      const newUrls: string[] = [];
      for (const file of capped) {
        try {
          newUrls.push(await fileToAdminImageDataUrl(file));
        } catch (err) {
          console.error('Image failed:', file.name, err);
          toast.error('Could not read image', { description: `Try another file instead of "${file.name}".` });
        }
      }

      if (newUrls.length > 0) {
        setFormData((prev) => {
          const room = MAX_PRODUCT_IMAGES - prev.images.length;
          if (room <= 0) return prev;
          return {
            ...prev,
            images: [...prev.images, ...newUrls.slice(0, room)],
          };
        });
      }
    } finally {
      setUploadingImages(false);
      input.value = '';
    }
  };

  const handleLifestyleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > MAX_FILE_BEFORE_COMPRESS) {
      toast.error('File too large', { description: 'Max 15 MB per image.' });
      return;
    }
    setUploadingImages(true);
    try {
      const url = await fileToAdminImageDataUrl(file);
      setFormData((prev) => ({ ...prev, lifestyleImage: url }));
    } catch {
      toast.error('Could not read image');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const price = parseFloat(formData.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Invalid price', { description: 'Enter a valid number (0 or greater).' });
      return;
    }

    const { sizeStock, error: sizeError } = rowsToSizeStock(formData.sizeRows);
    if (sizeError) {
      toast.error('Invalid inventory', { description: sizeError });
      return;
    }

    const stock = totalFromSizeStock(sizeStock);
    if (stock <= 0) {
      toast.error('No stock', { description: 'Add at least one size with quantity greater than 0.' });
      return;
    }

    const images = formData.images.filter((u) => typeof u === 'string' && u.trim().length > 12);
    const videos = formData.videos.filter((u) => typeof u === 'string' && u.trim().length > 12);
    const sizes = Object.keys(sizeStock);

    const productData = {
      name: formData.name.trim(),
      description: (formData.description ?? '').trim(),
      category: formData.category,
      images,
      videos,
      sizes,
      sizeStock,
      lifestyleImage: formData.lifestyleImage || '',
      price,
      stock,
      updatedAt: serverTimestamp(),
      createdAt: editingProduct ? editingProduct.createdAt : serverTimestamp(),
    };

    const payloadBytes = new Blob([JSON.stringify(productData)]).size;
    const firestoreDocLimit = 1_000_000;
    if (payloadBytes > firestoreDocLimit * 0.9) {
      toast.error('Product too large for Firestore', {
        description: `About ${Math.round(payloadBytes / 1024)} KB (limit ~1 MB per document). Remove or shrink photos and try again.`,
      });
      return;
    }

    const wasEditing = Boolean(editingProduct);
    setSaving(true);
    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), productData);
      }
    } catch (error: unknown) {
      console.error('Error saving product:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const code =
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';

      if (code === 'permission-denied') {
        const pid = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim();
        const rulesUrl = pid
          ? `https://console.firebase.google.com/project/${pid}/firestore/rules`
          : 'https://console.firebase.google.com/';
        toast.error('Firestore: permission denied', {
          description:
            'Your rules in the cloud still block this write. Open Rules below, paste `firestore.rules` from the repo, Publish. Then sign out and sign in again.',
          duration: 25_000,
          action: {
            label: 'Open Rules',
            onClick: () => window.open(rulesUrl, '_blank', 'noopener,noreferrer'),
          },
        });
      } else if (
        msg.includes('Quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        code === 'resource-exhausted'
      ) {
        toast.error('Quota exceeded', {
          description: 'Remove some images or try again later.',
        });
      } else if (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        toast.error('Browser storage full', {
          description: 'Remove images or clear site data for this site, then try again.',
        });
      } else {
        toast.error('Could not save to Firestore', {
          description: msg || code || 'Unknown error — see the browser console.',
        });
      }
      return;
    } finally {
      setSaving(false);
    }

    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData(emptyForm());
    setCustomSizeInput('');

    try {
      await fetchProducts();
      toast.success(wasEditing ? 'Updated in Firestore' : 'Saved to Firestore', {
        description: wasEditing
          ? 'The product document was updated in Cloud Firestore.'
          : 'A new document was added to the products collection in Cloud Firestore.',
      });
    } catch (refreshErr) {
      console.error('List refresh failed after save:', refreshErr);
      toast.warning('Saved to Firestore', {
        description:
          'Your product was written to Cloud Firestore, but the list could not refresh. Reload the page to see it.',
      });
    }
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
    const { sizeStock } = resolveProductInventory(product);
    let rows = sizeStockToRows(sizeStock);
    if (!rows.length && Array.isArray(product.sizes)) {
      rows = product.sizes.map((s: string) => newSizeRow(String(s), '0'));
    }
    setFormData({
      name: product.name,
      description: product.description ?? '',
      price: product.price?.toString() ?? '',
      category: product.category ?? '',
      images: coerceProductImages(product),
      videos: Array.isArray(product.videos) ? product.videos : [],
      sizeRows: rows.length ? rows : [newSizeRow('One Size', String(product.stock ?? 0))],
      lifestyleImage: typeof product.lifestyleImage === 'string' ? product.lifestyleImage : '',
    });
    setCustomSizeInput('');
    setIsModalOpen(true);
  };

  const addSizeRow = (size: string) => {
    const label = size.trim();
    if (!label) return;
    if (formData.sizeRows.some((r) => r.size.trim().toLowerCase() === label.toLowerCase())) {
      toast.error('Size already added', { description: `"${label}" is already in the list.` });
      return;
    }
    setFormData((prev) => ({ ...prev, sizeRows: [...prev.sizeRows, newSizeRow(label, '0')] }));
    setCustomSizeInput('');
  };

  const updateSizeRow = (id: string, patch: Partial<Pick<SizeRow, 'size' | 'quantity'>>) => {
    setFormData((prev) => ({
      ...prev,
      sizeRows: prev.sizeRows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  const removeSizeRow = (id: string) => {
    setFormData((prev) => ({ ...prev, sizeRows: prev.sizeRows.filter((row) => row.id !== id) }));
  };

  const formTotalStock = useMemo(
    () =>
      formData.sizeRows.reduce((sum, row) => {
        const qty = Math.floor(Number(row.quantity));
        return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
      }, 0),
    [formData.sizeRows]
  );

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

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const cat = p.category || 'Uncategorized';
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return map;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, categoryFilter]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({ ...emptyForm(), sizeRows: [newSizeRow('S', ''), newSizeRow('M', ''), newSizeRow('L', '')] });
    setCustomSizeInput('');
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
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
                          ILS {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
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

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border border-gray-200 bg-white shadow-xl sm:rounded-xl"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {editingProduct ? 'Edit product' : 'New product'}
                  </h2>
                  <p className="text-xs text-gray-500">Catalog listing and product detail fields.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <label className={LABEL}>Product name</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className={INPUT}
                        placeholder="Silk evening dress"
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Category</label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className={INPUT}
                      >
                        <option value="">Select category</option>
                        {Object.keys(CATEGORY_ICONS)
                          .filter((k) => k !== 'All')
                          .map((cat) => (
                            <option key={cat} value={cat}>
                              {cat} ({t(CATEGORY_KEYS[cat])})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Price (ILS)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        className={INPUT}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-gray-700">Size inventory</label>
                        <span className="text-xs tabular-nums text-gray-500">
                          Total: <strong className="text-gray-900">{formTotalStock}</strong> units
                        </span>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {PRESET_SIZES.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => addSizeRow(size)}
                            className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:border-catchy hover:text-catchy"
                          >
                            + {size}
                          </button>
                        ))}
                      </div>
                      {formData.sizeRows.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            <span>Size</span>
                            <span>Qty</span>
                            <span />
                          </div>
                          {formData.sizeRows.map((row) => (
                            <div key={row.id} className="grid grid-cols-[1fr_5rem_2rem] items-center gap-2">
                              <input
                                type="text"
                                value={row.size}
                                onChange={(e) => updateSizeRow(row.id, { size: e.target.value })}
                                className={cn(INPUT, 'h-8')}
                                placeholder="e.g. M"
                              />
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={row.quantity}
                                onChange={(e) => updateSizeRow(row.id, { quantity: e.target.value })}
                                className={cn(INPUT, 'h-8 tabular-nums')}
                                placeholder="0"
                              />
                              <button
                                type="button"
                                onClick={() => removeSizeRow(row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Remove size"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">Add sizes and set quantity for each (e.g. 3×M, 2×S).</p>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <input
                          type="text"
                          value={customSizeInput}
                          onChange={(e) => setCustomSizeInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addSizeRow(customSizeInput);
                            }
                          }}
                          className={cn(INPUT, 'h-8 flex-1')}
                          placeholder="Custom size (e.g. 38, Free)"
                        />
                        <button
                          type="button"
                          onClick={() => addSizeRow(customSizeInput)}
                          className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className={LABEL}>
                        Photos ({formData.images.length}/{MAX_PRODUCT_IMAGES})
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {formData.images.map((img, i) => (
                          <div
                            key={`img-${i}`}
                            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                          >
                            <img src={img} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  images: formData.images.filter((_, idx) => idx !== i),
                                })
                              }
                              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label="Remove"
                            >
                              <X size={10} />
                            </button>
                            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] font-medium text-white">
                              {i + 1}
                            </span>
                          </div>
                        ))}
                        {formData.images.length < MAX_PRODUCT_IMAGES && (
                          <label
                            className={cn(
                              'flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400 transition hover:border-catchy hover:text-catchy',
                              uploadingImages && 'pointer-events-none opacity-60'
                            )}
                          >
                            {uploadingImages ? (
                              <Loader2 className="h-4 w-4 animate-spin text-catchy" />
                            ) : (
                              <>
                                <Upload size={14} />
                                <span className="mt-0.5 text-[9px] font-medium">Add</span>
                              </>
                            )}
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className={LABEL}>Video URLs</label>
                      <div className="space-y-1.5">
                        {formData.videos.map((vid, i) => (
                          <div key={`vid-${i}`} className="flex items-center gap-1.5">
                            <input
                              type="url"
                              value={vid}
                              onChange={(e) => {
                                const newVideos = [...formData.videos];
                                newVideos[i] = e.target.value;
                                setFormData({ ...formData, videos: newVideos });
                              }}
                              placeholder="https://…"
                              className={cn(INPUT, 'flex-1')}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData({ ...formData, videos: formData.videos.filter((_, idx) => idx !== i) })
                              }
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, videos: [...formData.videos, ''] })}
                          className="h-8 w-full rounded-md border border-dashed border-gray-200 text-xs font-medium text-gray-600 hover:border-gray-300"
                        >
                          + Add video URL
                        </button>
                      </div>
                    </div>

                    <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3">
                      <label className={LABEL}>
                        Lifestyle photo <span className="font-normal text-gray-400">(detail page only)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        {formData.lifestyleImage ? (
                          <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200">
                            <img
                              src={formData.lifestyleImage}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, lifestyleImage: '' })}
                              className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white opacity-0 group-hover:opacity-100"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : null}
                        <label
                          className={cn(
                            'flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400 hover:border-catchy hover:text-catchy',
                            uploadingImages && 'pointer-events-none opacity-60'
                          )}
                        >
                          {uploadingImages ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Upload size={14} />
                              <span className="text-[9px] font-medium">{formData.lifestyleImage ? 'Replace' : 'Upload'}</span>
                            </>
                          )}
                          <input type="file" accept="image/*" onChange={handleLifestyleImageUpload} className="hidden" />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className={LABEL}>Description</label>
                      <textarea
                        rows={4}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className={cn(INPUT, 'h-auto min-h-[5.5rem] resize-y py-2')}
                        placeholder="Fabric, fit, care instructions…"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 border-t border-gray-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="h-9 flex-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || uploadingImages}
                    className="h-9 flex-[2] rounded-md bg-catchy text-sm font-semibold text-white hover:bg-catchy-dark disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : editingProduct ? 'Save changes' : 'Create product'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminProducts;
