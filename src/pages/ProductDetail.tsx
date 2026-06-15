import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db, doc, getDoc } from '../firebase';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS } from '../constants';
import { ShoppingCart, Heart, Share2, ArrowLeft, ZoomIn } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';
import ImageLightbox from '../components/ImageLightbox';
import {
  availableSizes,
  hasSizedInventory,
  sortedSizeStockEntries,
  stockForSelection,
} from '../lib/productInventory';
import {
  defaultVariantId,
  parseColorVariants,
  resolveVariantSelection,
  variantLabel,
} from '../lib/productVariants';
import ColorSwatchPicker from '../components/product/ColorSwatchPicker';
import { getCatalogSaleMeta } from '../lib/catalogSale';
import ProductPriceDisplay, { ProductSaleBadge } from '../components/ProductPriceDisplay';
import SizeRequiredModal from '../components/product/SizeRequiredModal';

const ProductDetail = () => {
  const { id } = useParams();
  const { addToCart, openCart } = useCart();
  const { t, isRTL, language } = useLanguage();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [sizePromptOpen, setSizePromptOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    if (!id) return;
    const favorites = JSON.parse(localStorage.getItem('catchy_favorites') || '[]');
    setIsFavorited(favorites.includes(id));
  }, [id]);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProduct({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const colorVariants = useMemo(
    () => (product ? parseColorVariants(product.colorVariants) : []),
    [product]
  );

  const variantSelection = useMemo(
    () => (product ? resolveVariantSelection(product, selectedColorId) : null),
    [product, selectedColorId]
  );

  const galleryImages = React.useMemo(
    () => variantSelection?.images ?? (product ? coerceProductImages(product) : []),
    [variantSelection, product]
  );

  const allMedia = React.useMemo(() => {
    if (!product) return [];
    const images = variantSelection?.images ?? coerceProductImages(product);
    const lifestyle =
      typeof product.lifestyleImage === 'string' && product.lifestyleImage.trim().length > 12
        ? [product.lifestyleImage as string]
        : [];
    const videos = Array.isArray(product.videos)
      ? product.videos.filter((v: any) => typeof v === 'string' && v.trim())
      : [];
    return [
      ...images.map((img: string) => ({ type: 'image', url: img, tag: '' })),
      ...lifestyle.map((img: string) => ({ type: 'image', url: img, tag: 'real-life' })),
      ...videos.map((vid: string) => ({ type: 'video', url: vid, tag: '' })),
    ];
  }, [product, variantSelection]);

  const lightboxImages = useMemo(
    () =>
      allMedia
        .filter((media) => media.type === 'image')
        .map((media) => media.url),
    [allMedia]
  );

  const openLightbox = () => {
    const current = allMedia[selectedImage];
    if (!current || current.type === 'video') return;
    const index = lightboxImages.indexOf(current.url);
    setLightboxIndex(index >= 0 ? index : 0);
    setLightboxOpen(true);
  };

  const handleLightboxIndexChange = (index: number) => {
    setLightboxIndex(index);
    const url = lightboxImages[index];
    const mediaIndex = allMedia.findIndex((media) => media.type === 'image' && media.url === url);
    if (mediaIndex >= 0) setSelectedImage(mediaIndex);
  };

  const isVideoMedia = allMedia[selectedImage]?.type === 'video';

  React.useEffect(() => {
    setSelectedImage(0);
  }, [product?.id, selectedColorId, galleryImages.length]);

  React.useEffect(() => {
    if (!product) return;
    setSelectedColorId(defaultVariantId(product));
    setSelectedSize(null);
  }, [product?.id]);

  React.useEffect(() => {
    if (selectedImage >= allMedia.length) {
      setSelectedImage(Math.max(0, allMedia.length - 1));
    }
  }, [allMedia.length, selectedImage]);

  const sizeStock = variantSelection?.sizeStock ?? {};
  const totalStock = variantSelection?.stock ?? 0;
  const sized = hasSizedInventory(sizeStock);
  const sizeOptions = useMemo(
    () => (sized ? sortedSizeStockEntries(sizeStock, { includeZero: false }).map(([size]) => size) : []),
    [sizeStock, sized]
  );
  const inStockSizes = useMemo(
    () => (sized ? availableSizes(sizeStock) : []),
    [sizeStock, sized]
  );

  const selectedStock = stockForSelection(sizeStock, totalStock, selectedSize);
  const outOfStock = sized ? inStockSizes.length === 0 : totalStock <= 0;
  const canAddWithSelection = sized ? Boolean(selectedSize && selectedStock > 0) : totalStock > 0;

  useEffect(() => {
    setQuantity(1);
  }, [selectedColorId, product?.id]);

  useEffect(() => {
    setSelectedSize(null);
  }, [selectedColorId, product?.id]);

  useEffect(() => {
    if (quantity > selectedStock && selectedStock > 0) {
      setQuantity(selectedStock);
    }
  }, [quantity, selectedStock]);

  const handleAddToCart = () => {
    if (!product) return;
    if (sized && !selectedSize) {
      setSizePromptOpen(true);
      return;
    }
    if (variantSelection?.hasVariants && !selectedColorId) return;
    if (!canAddWithSelection) return;
    setIsAdding(true);
    const colorName = variantSelection?.variant
      ? variantLabel(variantSelection.variant, language === 'ar')
      : undefined;
    addToCart(product, quantity, selectedSize, selectedColorId, colorName);
    openCart();
    setTimeout(() => setIsAdding(false), 1000);
  };

  const handleToggleFavorite = () => {
    if (!id) return;
    const favorites = JSON.parse(localStorage.getItem('catchy_favorites') || '[]');
    const index = favorites.indexOf(id);
    if (index > -1) {
      favorites.splice(index, 1);
    } else {
      favorites.push(id);
    }
    localStorage.setItem('catchy_favorites', JSON.stringify(favorites));
    setIsFavorited(!isFavorited);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = `Check out ${product.name} at CATCHY!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: text,
          url: url,
        });
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const categoryLabel = product?.category
    ? t(CATEGORY_KEYS[product.category] || product.category)
    : '';

  const saleMeta = product ? getCatalogSaleMeta(product) : null;
  const onSale = saleMeta?.onSale ?? false;

  const backLink = (
    <Link
      to="/catalog"
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900',
        isRTL && 'font-arabic flex-row-reverse'
      )}
    >
      <ArrowLeft size={16} className={cn(isRTL && 'rotate-180')} /> {t('product.backToCatalog')}
    </Link>
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-catchy border-t-transparent" aria-hidden />
      </div>
    );
  }

  if (!product) {
    return (
      <div
        className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <h2 className={cn('text-xl font-bold text-gray-900', isRTL && 'font-arabic')}>
          {t('product.notFound')}
        </h2>
        {backLink}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-10 pt-2 md:pb-12 md:pt-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 border-b border-gray-100 pb-4">{backLink}</div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative mx-auto aspect-[3/4] w-full max-h-[min(70vh,420px)] max-w-xs overflow-hidden rounded-xl bg-gray-100 sm:max-w-sm lg:mx-0 lg:max-h-[min(75vh,480px)] lg:max-w-none"
            >
              {isVideoMedia && allMedia[selectedImage] ? (
                <video
                  src={allMedia[selectedImage].url}
                  controls
                  playsInline
                  className="absolute inset-0 h-full w-full max-h-full max-w-full object-contain"
                  poster={galleryImages[0] || PRODUCT_IMAGE_PLACEHOLDER}
                />
              ) : (
                <button
                  type="button"
                  onClick={openLightbox}
                  className="group absolute inset-0 h-full w-full cursor-zoom-in border-0 bg-transparent p-0"
                  aria-label={t('product.tapToZoom')}
                >
                  <img
                    src={allMedia[selectedImage]?.url || PRODUCT_IMAGE_PLACEHOLDER}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    referrerPolicy={
                      isRemoteImageUrl(allMedia[selectedImage]?.url || '') ? 'no-referrer' : undefined
                    }
                    onError={(e) => {
                      const el = e.currentTarget;
                      const src = el.currentSrc || el.src;
                      if (src.startsWith('data:')) return;
                      el.onerror = null;
                      el.src = PRODUCT_IMAGE_PLACEHOLDER;
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-2 end-2 z-[1] inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn size={12} />
                    {t('product.tapToZoom')}
                  </span>
                </button>
              )}
              <span
                className={cn(
                  'absolute top-2 z-[1] bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-900',
                  isRTL ? 'right-2 font-arabic' : 'left-2'
                )}
              >
                {onSale ? t('catalog.sale') : t('product.new')}
              </span>
              {onSale && saleMeta ? (
                <ProductSaleBadge
                  label={t('catalog.sale')}
                  percent={saleMeta.discountPercent}
                  className={cn('top-2', isRTL ? 'left-2' : 'right-2')}
                />
              ) : null}
            </motion.div>
            {!isVideoMedia ? (
              <p className={cn('text-center text-[11px] text-gray-400', isRTL && 'font-arabic')}>
                {t('product.tapToZoom')}
              </p>
            ) : null}
            {allMedia.length > 1 ? (
              <div className="grid grid-cols-4 gap-2 sm:max-w-sm lg:max-w-none">
                {allMedia.map((media: any, i: number) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(i)}
                    className={cn(
                      'aspect-square overflow-hidden rounded-lg border-2 transition-all relative',
                      selectedImage === i
                        ? 'border-catchy shadow-sm'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                  >
                    <img
                      src={media.type === 'video' ? 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%23333%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E' : media.url}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy={isRemoteImageUrl(media.url || '') ? 'no-referrer' : undefined}
                    />
                    {(media as any).tag === 'real-life' && (
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-white leading-tight">
                        Real
                      </span>
                    )}
                    {media.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                          <span className="text-[10px] font-bold">▶</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col">
            <div className="mb-5">
              <p
                className={cn(
                  'mb-1 text-[10px] font-black uppercase tracking-[0.15em] text-catchy',
                  isRTL && 'font-arabic'
                )}
              >
                {categoryLabel}
              </p>
              <h1
                className={cn(
                  'mb-3 text-2xl font-bold leading-snug text-gray-900 md:text-3xl',
                  isRTL && 'font-arabic'
                )}
              >
                {product.name}
              </h1>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <ProductPriceDisplay
                  price={Number(product.price)}
                  compareAtPrice={product.compareAtPrice}
                  onSale={product.onSale}
                  sale={product.sale}
                  variant="detail"
                  saveLabel={t('product.youSave')}
                  percentOffLabel={t('product.percentOff')}
                  isRTL={isRTL}
                />
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
                    totalStock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                    isRTL && 'font-arabic'
                  )}
                >
                  {totalStock > 0 ? t('product.inStock') : t('product.outOfStock')}
                </span>
              </div>

              {colorVariants.length > 1 ? (
                <div className="mb-4">
                  <ColorSwatchPicker
                    variants={colorVariants}
                    selectedId={selectedColorId}
                    onSelect={setSelectedColorId}
                    isRTL={isRTL}
                    isAr={language === 'ar'}
                    label={t('product.color')}
                  />
                </div>
              ) : null}

              {sized && sizeOptions.length > 0 ? (
                <div className="mb-4">
                  <p
                    className={cn(
                      'mb-2 w-fit max-w-full text-start text-[10px] text-gray-400',
                      isRTL ? 'font-arabic font-bold normal-case tracking-normal' : 'font-black uppercase tracking-[0.12em]'
                    )}
                  >
                    {isRTL && selectedSize ? (
                      <>
                        <span>{t('product.size')}</span>
                        <span className="text-catchy">{`\u00A0${selectedSize}`}</span>
                      </>
                    ) : (
                      <>
                        {t('product.size')}
                        {selectedSize ? <span className="ms-1.5 text-catchy">{selectedSize}</span> : null}
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sizeOptions.map((size) => {
                      const qty = sizeStock[size] ?? 0;
                      const active = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSelectedSize(active ? null : size)}
                          className={cn(
                            'flex min-w-[2.75rem] flex-col items-center rounded-lg border px-3 py-1.5 text-sm font-bold transition-all',
                            active
                              ? 'border-catchy bg-catchy text-white shadow-sm shadow-catchy/20'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-catchy hover:text-catchy'
                          )}
                        >
                          <span>{size}</span>
                          <span className={cn('text-[9px] font-medium', active ? 'text-white/80' : 'text-gray-400')}>
                            {qty}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {!selectedSize && inStockSizes.length > 0 ? (
                    <p className={cn('mt-2 text-xs text-gray-400', isRTL && 'font-arabic')}>{t('product.selectSize')}</p>
                  ) : null}
                </div>
              ) : null}

              <p className={cn('text-sm leading-relaxed text-gray-500 md:text-[15px]', isRTL && 'font-arabic')}>
                {product.description || t('product.defaultDescription')}
              </p>
            </div>

            <div className="mb-6 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center rounded-lg border border-gray-100 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-gray-900">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(selectedStock, quantity + 1))}
                    disabled={selectedStock <= quantity}
                    className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <p className={cn('text-xs font-medium text-gray-400', isRTL && 'font-arabic')}>
                  {sized && selectedSize
                    ? t('product.sizeLeft').replace('{n}', String(selectedStock))
                    : t('product.stockAvailable').replace('{n}', String(totalStock))}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={outOfStock || isAdding}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl bg-catchy py-3 text-sm font-bold text-white shadow-md shadow-catchy/20 transition-all hover:bg-catchy-dark disabled:cursor-not-allowed disabled:opacity-50',
                    isRTL && 'font-arabic flex-row-reverse'
                  )}
                >
                  <ShoppingCart size={18} />
                  {isAdding ? t('product.addedToBag') : t('product.addToShoppingBag')}
                </button>
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  className={cn(
                    'rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 transition-colors flex items-center gap-1.5',
                    isFavorited
                      ? 'text-red-500 border-red-200 bg-red-50 hover:bg-red-100'
                      : 'text-gray-400 hover:text-red-500'
                  )}
                  aria-label="Toggle favorite"
                  title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart size={16} fill={isFavorited ? 'currentColor' : 'none'} />
                  <span className="text-xs font-medium">{isFavorited ? 'Favorited' : 'Favorite'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-gray-400 transition-colors hover:text-blue-500 active:scale-95"
                  aria-label="Share"
                  title="Share this product"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SizeRequiredModal open={sizePromptOpen} onClose={() => setSizePromptOpen(false)} />
      <ImageLightbox
        images={lightboxImages.length > 0 ? lightboxImages : [PRODUCT_IMAGE_PLACEHOLDER]}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={handleLightboxIndexChange}
        alt={product.name}
      />
    </div>
  );
};

export default ProductDetail;
