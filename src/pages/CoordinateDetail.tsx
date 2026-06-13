import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, ShoppingCart, Heart, Share2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { db, doc, getDoc } from '../firebase';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { fetchCoordinateLook } from '../lib/coordinatesService';
import { getCoordinateImages } from '../lib/coordinateImages';
import {
  coordinateLookAsCartProduct,
  validateCoordinateItemSizes,
  coordinateAvailableSets,
  coordinateHasAnyStock,
  type CoordinateItemSizes,
} from '../lib/coordinateCart';
import { resolveCoordinate } from '../lib/coordinateResolve';
import { isLookVisibleToCustomers } from '../lib/coordinatesValidation';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import CoordinateImageCollage from '../components/CoordinateImageCollage';
import ImageLightbox from '../components/ImageLightbox';
import CoordinateSetItemsGrid from '../components/CoordinateSetItemsGrid';
import CoordinateItemSizePicker from '../components/CoordinateItemSizePicker';
import ProductPriceDisplay, { ProductSaleBadge } from '../components/ProductPriceDisplay';
import type { CoordinateLook } from '../types/coordinates';

const CoordinateDetail = () => {
  const { id } = useParams();
  const { addToCart, openCart } = useCart();
  const { t, isRTL, language } = useLanguage();
  const [look, setLook] = useState<CoordinateLook | null>(null);
  const [linkedProducts, setLinkedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [itemSizes, setItemSizes] = useState<CoordinateItemSizes>({});
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (!id) return;
    const favs = JSON.parse(localStorage.getItem('catchy_favorites') || '[]');
    setIsFavorited(favs.includes(`coord:${id}`));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchCoordinateLook(id);
        if (cancelled) return;
        setLook(data);
        if (!data?.productIds?.length) {
          setLinkedProducts([]);
          return;
        }
        const products = await Promise.all(
          data.productIds.map(async (pid) => {
            try {
              const snap = await getDoc(doc(db, 'products', pid));
              if (snap.exists()) return { id: snap.id, ...snap.data() };
            } catch { /* skip */ }
            return null;
          })
        );
        if (!cancelled) setLinkedProducts(products.filter(Boolean));
      } catch (e) {
        console.error('fetchCoordinateLook:', e);
        if (!cancelled) setLook(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const images = useMemo(
    () => (look ? getCoordinateImages(look, linkedProducts) : []),
    [look, linkedProducts]
  );
  const resolved = useMemo(
    () => (look && linkedProducts.length ? resolveCoordinate(look, linkedProducts) : null),
    [look, linkedProducts]
  );
  const isAr = language === 'ar';
  const title = look ? (isAr && look.titleAr ? look.titleAr : look.title) : '';
  const tagline = look ? (isAr && look.taglineAr ? look.taglineAr : look.tagline) : '';

  const sizeValidationError = useMemo(
    () => validateCoordinateItemSizes(linkedProducts, itemSizes),
    [linkedProducts, itemSizes]
  );
  const availableSets = useMemo(
    () => coordinateAvailableSets(linkedProducts, itemSizes),
    [linkedProducts, itemSizes]
  );
  const hasStock = coordinateHasAnyStock(linkedProducts);
  const canAdd = hasStock && !sizeValidationError && availableSets > 0;

  useEffect(() => {
    setQuantity(1);
    setItemSizes({});
  }, [look?.id]);

  useEffect(() => {
    if (quantity > availableSets && availableSets > 0) setQuantity(availableSets);
  }, [quantity, availableSets]);

  const handleItemSizeChange = (productId: string, size: string | null) => {
    setItemSizes((prev) => {
      const next = { ...prev };
      if (size) next[productId] = size;
      else delete next[productId];
      return next;
    });
  };

  const saleMeta = resolved
    ? { onSale: resolved.onSale, compareAt: resolved.compareAtPrice, discountPercent: resolved.discountPercent }
    : null;
  const onSale = saleMeta?.onSale ?? false;
  const price = resolved?.price ?? 0;

  const handleAddToCart = () => {
    if (!look || !resolved) return;
    if (sizeValidationError) {
      toast.error(sizeValidationError);
      return;
    }
    if (!canAdd) return;
    setIsAdding(true);
    addToCart(coordinateLookAsCartProduct(look, resolved, linkedProducts, itemSizes), quantity);
    openCart();
    setTimeout(() => setIsAdding(false), 800);
  };

  const handleToggleFavorite = () => {
    if (!id) return;
    const key = `coord:${id}`;
    const favorites = JSON.parse(localStorage.getItem('catchy_favorites') || '[]');
    const index = favorites.indexOf(key);
    if (index > -1) favorites.splice(index, 1);
    else favorites.push(key);
    localStorage.setItem('catchy_favorites', JSON.stringify(favorites));
    setIsFavorited(!isFavorited);
  };

  const backLink = (
    <Link
      to="/catalog?category=Coordinates"
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition hover:text-gray-900',
        isRTL && 'font-arabic flex-row-reverse'
      )}
    >
      <ArrowLeft size={16} className={cn(isRTL && 'rotate-180')} />
      {t('coordinates.backToCatalog')}
    </Link>
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  if (!look || !isLookVisibleToCustomers(look, linkedProducts)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-catchy-dark">{t('coordinates.notFound')}</h1>
        {backLink}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-16 text-catchy-dark" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 border-b border-gray-100 pb-4">{backLink}</div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="relative mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none">
            <div className="relative">
              {onSale && saleMeta ? (
                <ProductSaleBadge label={t('catalog.sale')} percent={saleMeta.discountPercent} className="left-2 top-2 z-[2]" />
              ) : null}
              <CoordinateImageCollage
                images={images}
                variant="detail"
                className="rounded-xl shadow-sm ring-1 ring-black/[0.06]"
                onImageClick={(index) => {
                  setLightboxIndex(index);
                  setLightboxOpen(true);
                }}
              />
            </div>
            <p className={cn('mt-2 text-center text-[11px] text-gray-400', isRTL && 'font-arabic')}>
              {t('coordinates.tapToZoom')}
            </p>
          </div>

          <div className={cn('flex flex-col', isRTL && 'font-arabic text-start')}>
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
              {t('cat.coordinates')}
            </p>
            <h1 className="mb-3 text-2xl font-bold leading-snug text-gray-900 md:text-3xl">{title}</h1>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <ProductPriceDisplay
                price={price}
                compareAtPrice={resolved?.compareAtPrice ?? undefined}
                onSale={onSale}
                variant="detail"
                saveLabel={t('product.youSave')}
                percentOffLabel={t('product.percentOff')}
                isRTL={isRTL}
              />
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
                  hasStock ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                  isRTL && 'font-arabic'
                )}
              >
                {hasStock ? t('product.inStock') : t('product.outOfStock')}
              </span>
            </div>

            {tagline ? (
              <p className="mb-4 text-sm leading-relaxed text-gray-500">{tagline}</p>
            ) : null}

            {resolved && resolved.bundleDiscount ? (
              <p className={cn('mb-3 text-xs text-gray-500', isRTL && 'font-arabic')}>
                {t('coordinates.itemsSeparately')} ILS {resolved.itemsTotal}
              </p>
            ) : null}

            <CoordinateItemSizePicker
              products={linkedProducts}
              itemSizes={itemSizes}
              onChange={handleItemSizeChange}
              isRTL={isRTL}
              sizeLabel={t('coordinates.sizePerItem')}
              selectSizeHint={t('product.selectSize')}
            />

            <div className="mb-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center rounded-lg border border-gray-100 bg-gray-50 p-0.5">
                  <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900">−</button>
                  <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                  <button type="button" onClick={() => setQuantity(Math.min(availableSets || 1, quantity + 1))} disabled={!canAdd || quantity >= availableSets} className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-40">+</button>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  disabled={!canAdd || isAdding}
                  onClick={handleAddToCart}
                  className={cn(
                    'inline-flex flex-1 min-w-[10rem] items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold uppercase tracking-wide transition',
                    canAdd ? 'bg-catchy text-white shadow-lg shadow-catchy/20 hover:bg-catchy-dark' : 'cursor-not-allowed bg-gray-200 text-gray-400',
                    isRTL && 'font-arabic'
                  )}
                >
                  {isAdding ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
                  {t('product.addToBag')}
                </motion.button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleToggleFavorite} className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 transition hover:border-catchy', isFavorited && 'border-red-200 bg-red-50 text-red-500')}>
                  <Heart size={18} fill={isFavorited ? 'currentColor' : 'none'} />
                </button>
                <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 transition hover:border-catchy">
                  <Share2 size={18} />
                </button>
              </div>
              <p className={cn('flex items-center gap-1.5 text-xs text-gray-400', isRTL && 'font-arabic')}>
                <ShieldCheck size={14} className="text-emerald-500" />
                {t('product.secureCheckout')}
              </p>
            </div>
          </div>
        </div>

        <CoordinateSetItemsGrid
          products={linkedProducts}
          heading={t('coordinates.inThisSet')}
          isRTL={isRTL}
        />
      </div>

      <ImageLightbox
        images={images.length > 0 ? images : [PRODUCT_IMAGE_PLACEHOLDER]}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
        alt={title}
      />
    </div>
  );
};

export default CoordinateDetail;
