import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db, doc, getDoc } from '../firebase';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS } from '../constants';
import { ShoppingCart, Heart, Share2, ArrowLeft, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { coerceProductImages, isRemoteImageUrl, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

const ProductDetail = () => {
  const { id } = useParams();
  const { addToCart } = useCart();
  const { t, isRTL } = useLanguage();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists) {
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

  const galleryImages = React.useMemo(
    () => (product ? coerceProductImages(product) : []),
    [product]
  );

  React.useEffect(() => {
    setSelectedImage(0);
  }, [product?.id, galleryImages.length]);

  React.useEffect(() => {
    if (selectedImage >= galleryImages.length) {
      setSelectedImage(Math.max(0, galleryImages.length - 1));
    }
  }, [galleryImages.length, selectedImage]);

  const handleAddToCart = () => {
    if (!product) return;
    setIsAdding(true);
    addToCart(product, quantity);
    setTimeout(() => setIsAdding(false), 1000);
  };

  const categoryLabel = product?.category
    ? t(CATEGORY_KEYS[product.category] || product.category)
    : '';

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
    <div className="min-h-screen bg-white pt-14 pb-10 md:pt-16 md:pb-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 border-b border-gray-100 pb-4">{backLink}</div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative mx-auto aspect-[3/4] w-full max-h-[min(70vh,420px)] max-w-xs overflow-hidden rounded-xl bg-gray-100 sm:max-w-sm lg:mx-0 lg:max-h-[min(75vh,480px)] lg:max-w-none"
            >
              <img
                src={galleryImages[selectedImage] || PRODUCT_IMAGE_PLACEHOLDER}
                alt={product.name}
                className="h-full w-full object-cover"
                referrerPolicy={
                  isRemoteImageUrl(galleryImages[selectedImage] || '') ? 'no-referrer' : undefined
                }
                onError={(e) => {
                  const el = e.currentTarget;
                  const src = el.currentSrc || el.src;
                  if (src.startsWith('data:')) return;
                  el.onerror = null;
                  el.src = PRODUCT_IMAGE_PLACEHOLDER;
                }}
              />
              <span
                className={cn(
                  'absolute top-2 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-900',
                  isRTL ? 'right-2 font-arabic' : 'left-2'
                )}
              >
                {t('product.new')}
              </span>
            </motion.div>
            {galleryImages.length > 1 ? (
              <div className="grid grid-cols-4 gap-2 sm:max-w-sm lg:max-w-none">
                {galleryImages.map((img: string, i: number) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(i)}
                    className={cn(
                      'aspect-square overflow-hidden rounded-lg border-2 transition-all',
                      selectedImage === i
                        ? 'border-catchy shadow-sm'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                  >
                    <img
                      src={img}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy={isRemoteImageUrl(img) ? 'no-referrer' : undefined}
                    />
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
                <p className="text-xl font-black text-gray-900 md:text-2xl">£{product.price}</p>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
                    product.stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
                    isRTL && 'font-arabic'
                  )}
                >
                  {product.stock > 0 ? t('product.inStock') : t('product.outOfStock')}
                </span>
              </div>
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
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900"
                  >
                    +
                  </button>
                </div>
                <p className={cn('text-xs font-medium text-gray-400', isRTL && 'font-arabic')}>
                  {t('product.stockAvailable').replace('{n}', String(product.stock))}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={product.stock === 0 || isAdding}
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
                  className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-gray-400 transition-colors hover:text-red-500"
                  aria-label="Wishlist"
                >
                  <Heart size={18} />
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-gray-400 transition-colors hover:text-blue-500"
                  aria-label="Share"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-5 sm:grid-cols-3">
              <div className={cn('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={16} />
                </div>
                <p className={cn('text-[10px] font-bold uppercase tracking-wide text-gray-900', isRTL && 'font-arabic')}>
                  {t('product.secureCheckout')}
                </p>
              </div>
              <div className={cn('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Truck size={16} />
                </div>
                <p className={cn('text-[10px] font-bold uppercase tracking-wide text-gray-900', isRTL && 'font-arabic')}>
                  {t('product.freeShipping')}
                </p>
              </div>
              <div className={cn('flex items-center gap-2', isRTL && 'flex-row-reverse')}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <RotateCcw size={16} />
                </div>
                <p className={cn('text-[10px] font-bold uppercase tracking-wide text-gray-900', isRTL && 'font-arabic')}>
                  {t('product.returns30Day')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
