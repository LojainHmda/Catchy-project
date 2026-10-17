import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, deleteField } from '../../firebase';
import { X, Upload, Loader2, Tag, Percent, RefreshCw, Trash2, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../context/LanguageContext';
import { cn, sanitizeIntegerInput, sanitizeDecimalInput } from '../../lib/utils';
import { useStoreCategories } from '../../hooks/useStoreCategories';
import {
  ensureRemoteProductImage,
  ensureRemoteProductImages,
  uploadProductImageFile,
} from '../../lib/productImageUpload';
import {
  deleteProductVideoIfOwned,
  MAX_VIDEO_MB,
  uploadProductVideoFile,
  validateProductVideoFile,
} from '../../lib/productVideoUpload';
import { coerceProductImages } from '../../lib/productImages';
import { cloudinaryTransform } from '../../lib/cloudinaryTransform';
import { resolveProductCreatedAt } from '../../lib/admin/resolveProductCreatedAt';
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
  /** Extra collections this product also belongs to, alongside `category` (e.g. Offers, Offers Bundle). */
  collections: string[];
  isNewArrival: boolean;
  visible: boolean;
  barcode: string;
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
  collections: [],
  isNewArrival: false,
  visible: true,
  barcode: '',
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
    collections: Array.isArray(product.collections)
      ? product.collections.filter((c: unknown): c is string => typeof c === 'string' && c.trim().length > 0)
      : [],
    isNewArrival: hasNewArrivalTag(product),
    visible: product.visible !== false,
    barcode: typeof product.barcode === 'string' ? product.barcode : '',
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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoDragOver, setVideoDragOver] = useState(false);

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
      toast.error(t('admin.products.form.invalidFileType'), { description: t('admin.products.form.invalidFileTypeDesc') });
      input.value = '';
      return;
    }

    const oversize = picked.find((f) => f.size > MAX_FILE_BEFORE_COMPRESS);
    if (oversize) {
      toast.error(t('admin.products.form.fileTooLarge'), { description: t('admin.products.form.fileTooLargeDesc').replace('{name}', oversize.name) });
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
          toast.error(t('admin.products.form.uploadImageFailed'), {
            description:
              err instanceof Error && err.message.includes('Storage')
                ? err.message
                : t('admin.products.form.tryAnotherFile').replace('{name}', file.name),
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
      toast.error(t('admin.products.form.fileTooLarge'), { description: t('admin.products.form.maxFileSize') });
      return;
    }
    setUploadingImages(true);
    try {
      const url = await uploadProductImageFile(file);
      setFormData((prev) => ({ ...prev, lifestyleImage: url }));
    } catch (err) {
      console.error('Lifestyle image upload failed:', err);
      toast.error(t('admin.products.form.uploadImageFailed'), {
        description: err instanceof Error ? err.message : t('admin.products.form.uploadFailed'),
      });
    } finally {
      setUploadingImages(false);
    }
  };

  const handleVideoFile = (file: File) => {
    const validationError = validateProductVideoFile(file, t);
    if (validationError) {
      toast.error(t('admin.products.form.invalidVideoToastTitle'), { description: validationError });
      return;
    }

    setUploadingVideo(true);
    setVideoUploadProgress(0);
    const previousUrl = formData.videos[0] ?? null;

    uploadProductVideoFile(file, setVideoUploadProgress).then(
      async (url) => {
        setFormData((prev) => ({ ...prev, videos: [url] }));
        if (previousUrl) await deleteProductVideoIfOwned(previousUrl);
        toast.success(t('admin.products.form.videoUploaded'));
        setUploadingVideo(false);
        setVideoUploadProgress(0);
      },
      (err: Error) => {
        toast.error(t('admin.products.form.videoUploadFailed'), { description: err.message });
        setUploadingVideo(false);
        setVideoUploadProgress(0);
      }
    );
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleVideoFile(file);
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setVideoDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleVideoFile(file);
  };

  const handleRemoveVideo = async () => {
    const url = formData.videos[0];
    setFormData((prev) => ({ ...prev, videos: [] }));
    if (url) await deleteProductVideoIfOwned(url);
  };

  const addSizeRow = (size: string) => {
    const label = size.trim();
    if (!label) return;
    if (formData.sizeRows.some((r) => r.size.trim().toLowerCase() === label.toLowerCase())) {
      toast.error(t('admin.products.form.sizeAlreadyAdded'), { description: t('admin.products.form.sizeAlreadyAddedDesc').replace('{label}', label) });
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
      toast.error(t('admin.products.form.invalidPrice'), { description: t('admin.products.form.invalidPriceDesc') });
      return;
    }

    let finalPrice = price;
    let discountFields: Record<string, unknown> = {};

    if (formData.discount.enabled) {
      const resolved = resolveDiscountFromForm(formData.discount, price, t);
      if (!resolved.ok) {
        toast.error(t('admin.products.form.invalidDiscount'), { description: resolved.message });
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
          toast.error(t('admin.products.form.newArrivalsFull'), {
            description: t('admin.products.form.newArrivalsFullDesc').replace('{n}', String(MAX_NEW_ARRIVAL_PRODUCTS)),
          });
          return;
        }
      } catch (err) {
        console.error('Could not verify new arrival slots:', err);
        toast.error(t('admin.products.form.newArrivalsCheckFailed'), {
          description: t('admin.products.form.checkConnection'),
        });
        return;
      }
    }

    const tags = withNewArrivalTag(productTags(product), formData.isNewArrival);
    const category = isLegacyNewArrivalCategory(formData.category) ? '' : formData.category;
    const collections = [...new Set(formData.collections)].filter((c) => c && c !== category);

    if (!category.trim()) {
      toast.error(t('admin.products.form.categoryRequired'), {
        description: t('admin.products.form.categoryRequiredDesc'),
      });
      return;
    }

    let sizes: string[] = [];
    let sizeStock: Record<string, number> = {};
    let stock = 0;
    let images: string[] = [];
    let colorVariantsPayload: Record<string, unknown> = {};

    if (formData.useMultiColor) {
      const built = variantRowsToFirestore(formData.colorVariants, t);
      if (built.error) {
        toast.error(t('admin.products.form.invalidColors'), { description: built.error });
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
      const built = rowsToSizeStock(formData.sizeRows, t);
      if (built.error) {
        toast.error(t('admin.products.form.invalidInventory'), { description: built.error });
        return;
      }
      sizeStock = built.sizeStock;
      stock = totalFromSizeStock(sizeStock);
      if (stock <= 0) {
        toast.error(t('admin.products.form.noStock'), { description: t('admin.products.form.noStockDesc') });
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
        collections,
        tags,
        images: remoteImages.filter(Boolean),
        videos,
        sizes,
        sizeStock,
        lifestyleImage,
        price: finalPrice,
        stock,
        visible: formData.visible,
        barcode: formData.barcode.trim(),
        ...discountFields,
        ...colorVariantsPayload,
        updatedAt: serverTimestamp(),
        createdAt: resolveProductCreatedAt(product, serverTimestamp),
      };

      const payloadBytes = new Blob([JSON.stringify(productData)]).size;
      if (payloadBytes > 1_000_000 * 0.9) {
        toast.error(t('admin.products.form.tooLargeForFirestore'), {
          description: t('admin.products.form.tooLargeForFirestoreDesc').replace('{kb}', String(Math.round(payloadBytes / 1024))),
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

      toast.success(wasEditing ? t('admin.products.form.toastUpdated') : t('admin.products.form.toastCreated'), {
        description: wasEditing
          ? t('admin.products.form.toastUpdatedDesc')
          : t('admin.products.form.toastCreatedDesc'),
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
        toast.error(t('admin.products.form.permissionDenied'), {
          description: t('admin.products.form.permissionDeniedDesc'),
          duration: 25_000,
          action: {
            label: t('admin.products.form.openRules'),
            onClick: () => window.open(rulesUrl, '_blank', 'noopener,noreferrer'),
          },
        });
      } else if (
        msg.includes('Quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        code === 'resource-exhausted'
      ) {
        toast.error(t('admin.products.form.quotaExceeded'), { description: t('admin.products.form.quotaExceededDesc') });
      } else if (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        toast.error(t('admin.products.form.storageFull'), {
          description: t('admin.products.form.storageFullDesc'),
        });
      } else {
        toast.error(t('admin.products.form.saveFailed'), {
          description: msg || code || t('admin.products.form.unknownError'),
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
            aria-label={t('admin.products.form.closeAria')}
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
                  {product ? t('admin.products.form.editTitle') : t('admin.products.form.newTitle')}
                </h2>
                <p className="text-xs text-gray-500">{t('admin.products.form.subtitle')}</p>
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
                    <label className={LABEL}>{t('admin.products.form.productName')}</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={INPUT}
                      placeholder={t('admin.products.form.productNamePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>{t('admin.products.page.colCategory')}</label>
                    <select
                      required
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={INPUT}
                    >
                      <option value="">{t('admin.products.form.selectCategory')}</option>
                      {storeCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                          {cat.nameAr ? ` (${cat.nameAr})` : ''}
                          {cat.hidden ? ` — ${t('admin.products.form.hiddenSuffix')}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="rounded-md border border-gray-200 px-3 py-2">
                    <p className={LABEL}>
                      {t('admin.products.form.alsoShowIn')}
                      <span className="ms-1 normal-case text-gray-400">{t('admin.products.form.alsoShowInHint')}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {storeCategories
                        .filter((cat) => cat.id !== formData.category && !cat.locked)
                        .map((cat) => {
                          const checked = formData.collections.includes(cat.id);
                          return (
                            <label
                              key={cat.id}
                              className={cn(
                                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition',
                                checked
                                  ? 'border-catchy bg-catchy/10 text-catchy-dark'
                                  : 'border-gray-200 text-gray-600 hover:border-catchy/40'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    collections: e.target.checked
                                      ? [...prev.collections, cat.id]
                                      : prev.collections.filter((c) => c !== cat.id),
                                  }))
                                }
                                className="h-3.5 w-3.5 accent-catchy"
                              />
                              {cat.name}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <label className="text-xs text-gray-600">
                      {t('admin.products.form.newArrivalsToggle')}
                      <span className="ms-1 tabular-nums text-gray-400">
                        ({Math.min(newArrivalSlotsUsed, MAX_NEW_ARRIVAL_PRODUCTS)}/{MAX_NEW_ARRIVAL_PRODUCTS})
                      </span>
                    </label>
                    <AdminToggle
                      checked={formData.isNewArrival}
                      disabled={!formData.isNewArrival && newArrivalCount >= MAX_NEW_ARRIVAL_PRODUCTS && !alreadyTagged}
                      onChange={(checked) => setFormData({ ...formData, isNewArrival: checked })}
                      aria-label={t('admin.products.form.newArrivalsToggleAria')}
                    />
                  </div>
                  {newArrivalAtLimit ? (
                    <p className="text-[11px] text-amber-700">
                      {t('admin.products.form.allSlotsTaken').replace('{n}', String(MAX_NEW_ARRIVAL_PRODUCTS))}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2">
                    <label className="text-xs text-gray-600">
                      {t('admin.products.form.visibleToggle')}
                      <span className="ms-1 text-gray-400">{t('admin.products.form.visibleToggleHint')}</span>
                    </label>
                    <AdminToggle
                      checked={formData.visible}
                      onChange={(checked) => setFormData({ ...formData, visible: checked })}
                      aria-label={t('admin.products.form.visibleToggleAria')}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>
                      {t('admin.products.form.barcodeLabel')} <span className="font-normal text-gray-400">{t('admin.products.form.barcodeHint')}</span>
                    </label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className={INPUT}
                      placeholder={t('admin.products.form.barcodePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>
                      {formData.discount.enabled ? t('admin.products.form.originalPrice') : t('admin.products.form.price')}
                    </label>
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      dir="ltr"
                      value={formData.price}
                      onChange={(e) => {
                        const next = sanitizeDecimalInput(e.target.value);
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
                        {t('admin.products.form.onSale')}
                      </label>
                      <AdminToggle
                        aria-label={t('admin.products.form.onSale')}
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
                            {t('admin.products.form.percentage')}
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
                            {t('admin.products.form.manualPrices')}
                          </button>
                        </div>
                        {formData.discount.mode === 'percent' ? (
                          <div>
                            <label className={LABEL}>{t('admin.products.form.discountPercent')}</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              lang="en"
                              dir="ltr"
                              value={formData.discount.percent}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  discount: { ...prev.discount, percent: sanitizeIntegerInput(e.target.value) },
                                }))
                              }
                              className={INPUT}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={LABEL}>{t('admin.products.form.originalIls')}</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                dir="ltr"
                                value={formData.discount.compareAtPrice}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    discount: { ...prev.discount, compareAtPrice: sanitizeDecimalInput(e.target.value) },
                                  }))
                                }
                                className={INPUT}
                              />
                            </div>
                            <div>
                              <label className={LABEL}>{t('admin.products.form.salePriceIls')}</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                lang="en"
                                dir="ltr"
                                value={formData.discount.salePrice}
                                onChange={(e) =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    discount: { ...prev.discount, salePrice: sanitizeDecimalInput(e.target.value) },
                                  }))
                                }
                                className={INPUT}
                              />
                            </div>
                          </div>
                        )}
                        {(() => {
                          const resolved = resolveDiscountFromForm(formData.discount, parseFloat(formData.price) || 0, t);
                          if (!resolved.ok) return null;
                          const pct = getDiscountPercent(resolved.compareAt, resolved.salePrice);
                          return (
                            <p className="rounded-md bg-white px-2 py-1.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
                              {t('admin.products.form.customerPays')}{' '}
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
                      <p className="text-[11px] text-gray-500">{t('admin.products.form.enableSaleHint')}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {!formData.useMultiColor ? (
                    <div>
                      <label className={LABEL}>
                        {t('admin.products.form.photos').replace('{n}', String(formData.images.length)).replace('{max}', String(MAX_PRODUCT_IMAGES))}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {formData.images.map((img, i) => (
                          <div
                            key={`img-${i}`}
                            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
                          >
                            <img
                              src={cloudinaryTransform(img, { width: 64, height: 64 })}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  images: prev.images.filter((_, idx) => idx !== i),
                                }))
                              }
                              className="absolute end-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto"
                              aria-label={t('admin.products.form.removePhoto')}
                            >
                              <X size={10} />
                            </button>
                            <span className="absolute bottom-0.5 start-0.5 rounded bg-black/55 px-1 text-[9px] font-medium text-white">
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
                                <span className="mt-0.5 text-[9px] font-medium">{t('admin.common.add')}</span>
                              </>
                            )}
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className={LABEL}>{t('admin.products.form.videoLabel')}</label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoFileChange}
                      disabled={uploadingVideo}
                      className="hidden"
                      id="product-video-file-input"
                    />
                    {formData.videos[0] ? (
                      <div className="space-y-2">
                        <div className="relative aspect-video max-h-48 overflow-hidden rounded-lg bg-black">
                          <video src={formData.videos[0]} controls muted className="h-full w-full object-contain" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="product-video-file-input"
                            className={cn(
                              'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:border-gray-300',
                              uploadingVideo && 'pointer-events-none opacity-60'
                            )}
                          >
                            <RefreshCw size={13} />
                            {t('admin.products.form.replace')}
                          </label>
                          <button
                            type="button"
                            onClick={handleRemoveVideo}
                            disabled={uploadingVideo}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-red-100 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                          >
                            <Trash2 size={13} />
                            {t('admin.common.remove')}
                          </button>
                          {uploadingVideo && (
                            <span className="text-xs text-gray-400">{t('admin.products.form.uploadingPercent').replace('{n}', String(videoUploadProgress))}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <label
                        htmlFor="product-video-file-input"
                        onDragOver={(e) => { e.preventDefault(); setVideoDragOver(true); }}
                        onDragLeave={() => setVideoDragOver(false)}
                        onDrop={handleVideoDrop}
                        className={cn(
                          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors',
                          videoDragOver ? 'border-catchy bg-emerald-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                          uploadingVideo && 'pointer-events-none'
                        )}
                      >
                        {uploadingVideo ? (
                          <>
                            <Loader2 size={22} className="animate-spin text-catchy" />
                            <p className="text-xs font-medium text-gray-600">{t('admin.products.form.uploadingPercent').replace('{n}', String(videoUploadProgress))}</p>
                            <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full rounded-full bg-catchy transition-all duration-300"
                                style={{ width: `${videoUploadProgress}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <Video size={22} className="text-gray-300" />
                            <p className="text-xs font-medium text-gray-600">
                              {t('admin.products.form.dragDropVideo')} <span className="text-catchy underline">{t('admin.products.form.browse')}</span>
                            </p>
                            <p className="text-[11px] text-gray-400">{t('admin.products.form.videoFormats').replace('{n}', String(MAX_VIDEO_MB))}</p>
                          </>
                        )}
                      </label>
                    )}
                  </div>

                  <div className="rounded-md border border-gray-200 bg-gray-50/80 p-3">
                    <label className={LABEL}>
                      {t('admin.products.form.lifestylePhoto')} <span className="font-normal text-gray-400">{t('admin.products.form.lifestylePhotoHint')}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {formData.lifestyleImage ? (
                        <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200">
                          <img
                            src={cloudinaryTransform(formData.lifestyleImage, { width: 64, height: 64 })}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, lifestyleImage: '' }))}
                            className="absolute end-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded bg-black/65 text-white transition-opacity sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto"
                            aria-label={t('admin.products.form.removeLifestylePhoto')}
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
                            <span className="text-[9px] font-medium">{formData.lifestyleImage ? t('admin.products.form.replace') : t('admin.products.form.upload')}</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={handleLifestyleImageUpload} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className={LABEL}>{t('admin.products.form.description')}</label>
                    <textarea
                      rows={4}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={cn(INPUT, 'h-auto min-h-[5.5rem] resize-y py-2')}
                      placeholder={t('admin.products.form.descriptionPlaceholder')}
                    />
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{t('admin.products.form.multipleColors')}</p>
                        <p className="text-[11px] text-gray-500">
                          {t('admin.products.form.multipleColorsHint')}
                        </p>
                      </div>
                      <AdminToggle
                        aria-label={t('admin.products.form.multipleColors')}
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
                        <label className="text-xs font-medium text-gray-700">{t('admin.products.form.sizeInventory')}</label>
                        <span className="text-xs tabular-nums text-gray-500">
                          {t('admin.common.total')}: <strong className="text-gray-900">{formTotalStock}</strong> {t('admin.products.form.units')}
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
                            <span>{t('admin.common.size')}</span>
                            <span>{t('admin.common.qty')}</span>
                            <span />
                          </div>
                          {formData.sizeRows.map((row) => (
                            <div key={row.id} className="grid grid-cols-[1fr_5rem_2rem] items-center gap-2">
                              <input
                                type="text"
                                value={row.size}
                                onChange={(e) => updateSizeRow(row.id, { size: e.target.value })}
                                className={cn(INPUT, 'h-8')}
                                placeholder={t('admin.products.form.sizeExamplePlaceholder')}
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                lang="en"
                                dir="ltr"
                                value={row.quantity}
                                onChange={(e) => updateSizeRow(row.id, { quantity: sanitizeIntegerInput(e.target.value) })}
                                className={cn(INPUT, 'h-8 tabular-nums')}
                                placeholder="0"
                              />
                              <button
                                type="button"
                                onClick={() => removeSizeRow(row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={t('admin.products.form.removeSize')}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">{t('admin.products.form.addSizesHint')}</p>
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
                          placeholder={t('admin.products.form.customSizePlaceholder')}
                        />
                        <button
                          type="button"
                          onClick={() => addSizeRow(customSizeInput)}
                          className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('admin.common.add')}
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
                  {t('admin.common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImages || uploadingVideo}
                  className="h-9 flex-[2] rounded-md bg-catchy text-sm font-semibold text-white hover:bg-catchy-dark disabled:opacity-50"
                >
                  {saving ? t('admin.products.form.saving') : product ? t('admin.orders.edit.saveChanges') : t('admin.products.form.createProduct')}
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
