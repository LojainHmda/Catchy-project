import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, deleteField } from '../../firebase';
import { X, Upload, Loader2, Tag, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import { useStoreCategories } from '../../hooks/useStoreCategories';
import {
  ensureRemoteProductImage,
  ensureRemoteProductImages,
  uploadProductImageFile,
} from '../../lib/productImageUpload';
import { coerceProductImages } from '../../lib/productImages';
import ProductColorVariantsEditor from './ProductColorVariantsEditor';
import AdminToggle from './AdminToggle';
import {
  newSizeRow,
  resolveProductInventory,
  rowsToSizeStock,
  sizeStockToRows,
  totalFromSizeStock,
  type SizeRow,
} from '../../lib/productInventory';
import {
  applyPercentToPrice,
  buildDiscountUpdate,
  buildRemoveDiscountUpdate,
  discountFormFromProduct,
  getDiscountPercent,
  isProductOnSale,
  parsePriceInput,
  resolveDiscountFromForm,
} from '../../lib/productDiscount';
import type { DiscountFormState } from '../../types/product';
import {
  colorVariantFormFromProduct,
  hasColorVariants,
  legacyToSingleVariantForm,
  newColorVariantRow,
  variantRowsToFirestore,
  type ColorVariantFormRow,
} from '../../lib/productVariants';
import {
  countNewArrivalProducts,
  hasNewArrivalTag,
  isLegacyNewArrivalCategory,
  MAX_NEW_ARRIVAL_PRODUCTS,
  productTags,
  withNewArrivalTag,
} from '../../lib/productTags';

const MAX_PRODUCT_IMAGES = 6;
const MAX_FILE_BEFORE_COMPRESS = 15 * 1024 * 1024;
const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

// deleteField() sentinel used to detect (and drop) field-deletion markers when
// creating a new document, where they are invalid.
const DELETE_FIELD_SENTINEL = deleteField();

const stripFieldDeletions = <T extends Record<string, unknown>>(data: T): T => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      value != null &&
      typeof value === 'object' &&
      typeof (value as { isEqual?: unknown }).isEqual === 'function' &&
      (value as { isEqual: (other: unknown) => boolean }).isEqual(DELETE_FIELD_SENTINEL)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out as T;
};

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';
const LABEL = 'mb-1 block text-xs font-medium text-gray-500';

type ProductFormData = {
  name: string;
  description: string;
  price: string;
  category: string;
  isNewArrival: boolean;
  images: string[];
  videos: string[];
  sizeRows: SizeRow[];
  lifestyleImage: string;
  useMultiColor: boolean;
  colorVariants: ColorVariantFormRow[];
  discount: DiscountFormState;
};

const emptyForm = (): ProductFormData => ({
  name: '',
  description: '',
  price: '',
  category: '',
  isNewArrival: false,
  images: [],
  videos: [],
  sizeRows: [],
  lifestyleImage: '',
  useMultiColor: false,
  colorVariants: [],
  discount: {
    enabled: false,
    mode: 'percent',
    percent: '20',
    compareAtPrice: '',
    salePrice: '',
  },
});

const createDefaults = (): ProductFormData => ({
  ...emptyForm(),
  sizeRows: [newSizeRow('S', ''), newSizeRow('M', ''), newSizeRow('L', '')],
  colorVariants: [
    newColorVariantRow({ name: '', sizeRows: [newSizeRow('S', ''), newSizeRow('M', ''), newSizeRow('L', '')] }),
  ],
});

function formFromProduct(product: any): ProductFormData {
  const multi = hasColorVariants(product);
  const variantForms = colorVariantFormFromProduct(product);
  const { sizeStock } = resolveProductInventory(product);
  let rows = sizeStockToRows(sizeStock);
  if (!rows.length && Array.isArray(product.sizes)) {
    rows = product.sizes.map((s: string) => newSizeRow(String(s), '0'));
  }
  const legacyNewArrivalCategory =
    typeof product.category === 'string' && product.category.trim().toLowerCase() === 'new arrivals';
  return {
    name: product.name,
    description: product.description ?? '',
    price: isProductOnSale(product)
      ? String(Number(product.compareAtPrice))
      : product.price?.toString() ?? '',
    category: legacyNewArrivalCategory ? '' : (product.category ?? ''),
    isNewArrival: hasNewArrivalTag(product),
    images: coerceProductImages(product),
    videos: Array.isArray(product.videos) ? product.videos : [],
    sizeRows: rows.length ? rows : [newSizeRow('One Size', String(product.stock ?? 0))],
    lifestyleImage: typeof product.lifestyleImage === 'string' ? product.lifestyleImage : '',
    useMultiColor: multi,
    colorVariants: multi
      ? variantForms
      : [newColorVariantRow({ name: '', sizeRows: [newSizeRow('S', ''), newSizeRow('M', ''), newSizeRow('L', '')] })],
    discount: discountFormFromProduct(product),
  };
}

export type AdminProductFormModalProps = {
  open: boolean;
  onClose: () => void;
  product?: any | null;
  newArrivalCount?: number;
  onSaved?: (saved: { id: string; [key: string]: unknown }) => void | Promise<void>;
};

const AdminProductFormModal: React.FC<AdminProductFormModalProps> = ({
  open,
  onClose,
  product = null,
  newArrivalCount = 0,
  onSaved,
}) => {
  const { t } = useLanguage();
  const { categories: storeCategories } = useStoreCategories();
  const [formData, setFormData] = useState<ProductFormData>(emptyForm());
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormData(product ? formFromProduct(product) : createDefaults());
    setCustomSizeInput('');
  }, [open, product?.id]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const input = e.target;
    if (!files?.length) return;

    const picked = Array.from(files).filter(
      (f): f is File => f instanceof File && f.type.startsWith('image/')
    );
    if (picked.length === 0) {
      toast.error('Invalid file type', { description: 'Choose image files only (JPEG, PNG, WebP, GIF).' });
      input.value = '';
      return;
    }

    const oversize = picked.find((f) => f.size > MAX_FILE_BEFORE_COMPRESS);
    if (oversize) {
      toast.error('File too large', { description: `"${oversize.name}" exceeds the 15 MB per file limit.` });
      input.value = '';
      return;
    }

    setUploadingImages(true);
    try {
      const capped = picked.slice(0, MAX_PRODUCT_IMAGES);
      const newUrls: string[] = [];
      for (const file of capped) {
        try {
          newUrls.push(await uploadProductImageFile(file));
        } catch (err) {
          console.error('Image upload failed:', file.name, err);
          toast.error('Could not upload image', {
            description:
              err instanceof Error && err.message.includes('Storage')
                ? err.message
                : `Try another file instead of "${file.name}".`,
          });
        }
      }

      if (newUrls.length > 0) {
        setFormData((prev) => {
          const room = MAX_PRODUCT_IMAGES - prev.images.length;
          if (room <= 0) return prev;
          return { ...prev, images: [...prev.images, ...newUrls.slice(0, room)] };
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
      const url = await uploadProductImageFile(file);
      setFormData((prev) => ({ ...prev, lifestyleImage: url }));
    } catch (err) {
      console.error('Lifestyle image upload failed:', err);
      toast.error('Could not upload image', {
        description: err instanceof Error ? err.message : 'Upload failed.',
      });
    } finally {
      setUploadingImages(false);
    }
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

  const alreadyTagged = product ? hasNewArrivalTag(product) : false;
  const newArrivalSlotsUsed =
    newArrivalCount - (alreadyTagged ? 1 : 0) + (formData.isNewArrival ? 1 : 0);
  const newArrivalAtLimit = formData.isNewArrival && newArrivalSlotsUsed > MAX_NEW_ARRIVAL_PRODUCTS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const price = parseFloat(formData.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Invalid price', { description: 'Enter a valid number (0 or greater).' });
      return;
    }

    let finalPrice = price;
    let discountFields: Record<string, unknown> = {};

    if (formData.discount.enabled) {
      const resolved = resolveDiscountFromForm(formData.discount, price);
      if (!resolved.ok) {
        toast.error('Invalid discount', { description: resolved.message });
        return;
      }
      finalPrice = resolved.salePrice;
      discountFields = buildDiscountUpdate(resolved.compareAt, resolved.salePrice);
    } else if (product && isProductOnSale(product)) {
      discountFields = buildRemoveDiscountUpdate({ ...product, price });
    }

    if (formData.isNewArrival) {
      try {
        const otherTagged = await countNewArrivalProducts(db, product?.id);
        if (otherTagged >= MAX_NEW_ARRIVAL_PRODUCTS) {
          toast.error('Latest Arrivals is full', {
            description: `Only ${MAX_NEW_ARRIVAL_PRODUCTS} products can have the "new arrived" tag. Remove it from another product first.`,
          });
          return;
        }
      } catch (err) {
        console.error('Could not verify new arrival slots:', err);
        toast.error('Could not verify Latest Arrivals slots', {
          description: 'Check your connection and try again.',
        });
        return;
      }
    }

    const tags = withNewArrivalTag(productTags(product), formData.isNewArrival);
    const category = isLegacyNewArrivalCategory(formData.category) ? '' : formData.category;

    if (!category.trim()) {
      toast.error('Category required', {
        description: 'Choose a catalog category (e.g. Tops, Dresses). New Arrivals is a tag only.',
      });
      return;
    }

    let sizes: string[] = [];
    let sizeStock: Record<string, number> = {};
    let stock = 0;
    let images: string[] = [];
    let colorVariantsPayload: Record<string, unknown> = {};

    if (formData.useMultiColor) {
      const built = variantRowsToFirestore(formData.colorVariants);
      if (built.error) {
        toast.error('Invalid colors', { description: built.error });
        return;
      }
      const remoteVariants = await Promise.all(
        built.colorVariants.map(async (variant) => ({
          ...variant,
          images: (await ensureRemoteProductImages(variant.images)).filter(Boolean),
        }))
      );
      sizes = built.sizes;
      sizeStock = built.sizeStock;
      stock = built.stock;
      images = remoteVariants.find((v) => v.id === built.defaultColorId)?.images ?? remoteVariants[0]!.images;
      colorVariantsPayload = {
        colorVariants: remoteVariants,
        defaultColorId: built.defaultColorId,
      };
    } else {
      const built = rowsToSizeStock(formData.sizeRows);
      if (built.error) {
        toast.error('Invalid inventory', { description: built.error });
        return;
      }
      sizeStock = built.sizeStock;
      stock = totalFromSizeStock(sizeStock);
      if (stock <= 0) {
        toast.error('No stock', { description: 'Add at least one size with quantity greater than 0.' });
        return;
      }
      images = formData.images.filter((u) => typeof u === 'string' && u.trim().length > 12);
      sizes = Object.keys(sizeStock);
      if (product && hasColorVariants(product)) {
        colorVariantsPayload = {
          colorVariants: deleteField(),
          defaultColorId: deleteField(),
        };
      }
    }

    const videos = formData.videos.filter((u) => typeof u === 'string' && u.trim().length > 12);
    const wasEditing = Boolean(product);

    setSaving(true);
    try {
      const [remoteImages, lifestyleImage] = await Promise.all([
        formData.useMultiColor ? Promise.resolve(images) : ensureRemoteProductImages(images),
        ensureRemoteProductImage(formData.lifestyleImage || ''),
      ]);

      const productData = {
        name: formData.name.trim(),
        description: (formData.description ?? '').trim(),
        category,
        tags,
        images: remoteImages.filter(Boolean),
        videos,
        sizes,
        sizeStock,
        lifestyleImage,
        price: finalPrice,
        stock,
        ...discountFields,
        ...colorVariantsPayload,
        updatedAt: serverTimestamp(),
        createdAt: product ? product.createdAt : serverTimestamp(),
      };

      const payloadBytes = new Blob([JSON.stringify(productData)]).size;
      if (payloadBytes > 1_000_000 * 0.9) {
        toast.error('Product too large for Firestore', {
          description: `About ${Math.round(payloadBytes / 1024)} KB (limit ~1 MB per document). Remove extra fields and try again.`,
        });
        return;
      }

      let saved: { id: string; [key: string]: unknown };
      if (product) {
        await updateDoc(doc(db, 'products', product.id), productData);
        saved = { id: product.id, ...productData };
      } else {
        // deleteField() is only valid on update/set-with-merge. A brand new
        // document has nothing to delete, so drop those sentinels before addDoc.
        const createData = stripFieldDeletions(productData);
        const ref = await addDoc(collection(db, 'products'), createData);
        saved = { id: ref.id, ...createData };
      }

      toast.success(wasEditing ? 'Updated in Firestore' : 'Saved to Firestore', {
        description: wasEditing
          ? 'The product document was updated in Cloud Firestore.'
          : 'A new document was added to the products collection in Cloud Firestore.',
      });

      onClose();
      await onSaved?.(saved);
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
        toast.error('Quota exceeded', { description: 'Remove some images or try again later.' });
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            aria-label="Close product form"
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
                  {product ? 'Edit product' : 'New product'}
                </h2>
                <p className="text-xs text-gray-500">Catalog listing and product detail fields.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
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
                      {storeCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                          {cat.nameAr ? ` (${cat.nameAr})` : ''}
                          {cat.hidden ? ' — hidden' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <label className="text-xs text-gray-600">
                      New Arrivals on home page
                      <span className="ml-1 tabular-nums text-gray-400">
                        ({Math.min(newArrivalSlotsUsed, MAX_NEW_ARRIVAL_PRODUCTS)}/{MAX_NEW_ARRIVAL_PRODUCTS})
                      </span>
                    </label>
                    <AdminToggle
                      checked={formData.isNewArrival}
                      disabled={!formData.isNewArrival && newArrivalCount >= MAX_NEW_ARRIVAL_PRODUCTS && !alreadyTagged}
                      onChange={(checked) => setFormData({ ...formData, isNewArrival: checked })}
                      ariaLabel="Show in Latest Arrivals on home page"
                    />
                  </div>
                  {newArrivalAtLimit ? (
                    <p className="text-[11px] text-amber-700">
                      All {MAX_NEW_ARRIVAL_PRODUCTS} slots are taken. Remove the tag from another product first.
                    </p>
                  ) : null}
                  <div>
                    <label className={LABEL}>
                      {formData.discount.enabled ? 'Original price (ILS)' : 'Price (ILS)'}
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => {
                        const next = e.target.value;
                        setFormData((prev) => {
                          const patch: ProductFormData = { ...prev, price: next };
                          if (prev.discount.enabled && prev.discount.mode === 'percent') {
                            patch.discount = { ...prev.discount, compareAtPrice: next };
                          }
                          return patch;
                        });
                      }}
                      className={INPUT}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                        <Tag size={14} className="text-catchy" />
                        On sale
                      </label>
                      <AdminToggle
                        aria-label="On sale"
                        checked={formData.discount.enabled}
                        onChange={(enabled) =>
                          setFormData((prev) => {
                            const base = prev.price || prev.discount.compareAtPrice;
                            return {
                              ...prev,
                              discount: {
                                ...prev.discount,
                                enabled,
                                compareAtPrice: enabled ? base : prev.discount.compareAtPrice,
                                salePrice:
                                  enabled && prev.discount.mode === 'percent'
                                    ? String(
                                        applyPercentToPrice(
                                          parsePriceInput(base) ?? 0,
                                          parseFloat(prev.discount.percent) || 20
                                        )
                                      )
                                    : prev.discount.salePrice,
                              },
                            };
                          })
                        }
                      />
                    </div>
                    {formData.discount.enabled ? (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                discount: { ...prev.discount, mode: 'percent' },
                              }))
                            }
                            className={cn(
                              'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition',
                              formData.discount.mode === 'percent'
                                ? 'bg-white text-catchy shadow-sm ring-1 ring-catchy/30'
                                : 'text-gray-500 hover:bg-white/80'
                            )}
                          >
                            <Percent size={12} />
                            Percentage
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                discount: { ...prev.discount, mode: 'manual' },
                              }))
                            }
                            className={cn(
                              'inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-medium transition',
                              formData.discount.mode === 'manual'
                                ? 'bg-white text-catchy shadow-sm ring-1 ring-catchy/30'
                                : 'text-gray-500 hover:bg-white/80'
                            )}
                          >
                            Manual prices
                          </button>
                        </div>
                        {formData.discount.mode === 'percent' ? (
                          <div>
                            <label className={LABEL}>Discount %</label>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={formData.discount.percent}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  discount: { ...prev.discount, percent: e.target.value },
                                }))
                              }
                              className={INPUT}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={LABEL}>Original (ILS)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={formData.discount.compareAtPrice}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    discount: { ...prev.discount, compareAtPrice: e.target.value },
                                  }))
                                }
                                className={INPUT}
                              />
                            </div>
                            <div>
                              <label className={LABEL}>Sale price (ILS)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={formData.discount.salePrice}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    discount: { ...prev.discount, salePrice: e.target.value },
                                  }))
                                }
                                className={INPUT}
                              />
                            </div>
                          </div>
                        )}
                        {(() => {
                          const resolved = resolveDiscountFromForm(formData.discount, parseFloat(formData.price) || 0);
                          if (!resolved.ok) return null;
                          const pct = getDiscountPercent(resolved.compareAt, resolved.salePrice);
                          return (
                            <p className="rounded-md bg-white px-2 py-1.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
                              Customer pays{' '}
                              <strong className="text-red-600">ILS {resolved.salePrice.toFixed(2)}</strong>
                              {' · '}
                              <span className="line-through">ILS {resolved.compareAt.toFixed(2)}</span>
                              {' · '}
                              <strong className="text-red-600">-{pct}%</strong>
                            </p>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500">Enable to show a sale price on catalog and product pages.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {!formData.useMultiColor ? (
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
                                setFormData((prev) => ({
                                  ...prev,
                                  images: prev.images.filter((_, idx) => idx !== i),
                                }))
                              }
                              className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto"
                              aria-label="Remove photo"
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
                  ) : null}

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
                            onClick={() => setFormData((prev) => ({ ...prev, lifestyleImage: '' }))}
                            className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto"
                            aria-label="Remove lifestyle photo"
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

                <div className="space-y-3 md:col-span-2">
                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">Multiple colors</p>
                        <p className="text-[11px] text-gray-500">
                          Separate photos and stock per color (recommended for fashion).
                        </p>
                      </div>
                      <AdminToggle
                        aria-label="Multiple colors"
                        checked={formData.useMultiColor}
                        onChange={(next) =>
                          setFormData((prev) => {
                            if (next && prev.colorVariants.length === 0) {
                              return {
                                ...prev,
                                useMultiColor: true,
                                colorVariants: [
                                  legacyToSingleVariantForm({
                                    images: prev.images,
                                    sizeStock: rowsToSizeStock(prev.sizeRows).sizeStock,
                                    stock: prev.sizeRows.reduce(
                                      (sum, row) => sum + (Math.floor(Number(row.quantity)) || 0),
                                      0
                                    ),
                                  }),
                                ],
                              };
                            }
                            return { ...prev, useMultiColor: next };
                          })
                        }
                      />
                    </div>
                  </div>

                  {formData.useMultiColor ? (
                    <ProductColorVariantsEditor
                      variants={formData.colorVariants}
                      onChange={(colorVariants) => setFormData((prev) => ({ ...prev, colorVariants }))}
                      presetSizes={PRESET_SIZES}
                    />
                  ) : (
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
                  )}
                </div>
              </div>

              <div className="mt-4 flex gap-2 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 flex-1 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImages}
                  className="h-9 flex-[2] rounded-md bg-catchy text-sm font-semibold text-white hover:bg-catchy-dark disabled:opacity-50"
                >
                  {saving ? 'Saving…' : product ? 'Save changes' : 'Create product'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default AdminProductFormModal;
