import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import CartPanel from './CartPanel';

const CartDrawer = () => {
  const { isCartOpen, closeCart, cartCount } = useCart();
  const { t, isRTL } = useLanguage();

  const itemCountLine =
    cartCount === 1
      ? t('cart.itemCountOne')
      : t('cart.itemCount').replace('{n}', String(cartCount));

  useEffect(() => {
    if (!isCartOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCartOpen, closeCart]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isCartOpen && (
        <div className="fixed inset-0 z-[200]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('cart.close')}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeCart}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('cart.title')}
            dir={isRTL ? 'rtl' : 'ltr'}
            className={cn(
              'fixed inset-y-0 flex w-full max-w-md flex-col bg-white shadow-2xl',
              isRTL ? 'left-0' : 'right-0',
              isRTL && 'font-arabic'
            )}
            initial={{ x: isRTL ? '-100%' : '100%' }}
            animate={{ x: 0 }}
            exit={{ x: isRTL ? '-100%' : '100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h2 className={cn('text-lg font-medium text-gray-900', isRTL ? 'font-arabic' : 'font-serif')}>
                  {t('cart.title')}
                </h2>
                <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>{itemCountLine}</p>
              </div>
              <button
                type="button"
                onClick={closeCart}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label={t('cart.close')}
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <CartPanel variant="drawer" onClose={closeCart} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CartDrawer;
