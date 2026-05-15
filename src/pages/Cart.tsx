import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Cart = () => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();
  const { t, isRTL } = useLanguage();

  const itemCountLine =
    cartCount === 1
      ? t('cart.itemCountOne')
      : t('cart.itemCount').replace('{n}', String(cartCount));

  if (cart.length === 0) {
    return (
      <motion.div
        className="flex min-h-[60vh] flex-col items-center justify-center bg-white p-6"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-50 text-gray-200">
            <ShoppingBag size={40} />
          </div>
          <h1 className={cn('mb-3 text-2xl text-gray-900 md:text-3xl', isRTL ? 'font-arabic' : 'font-serif')}>
            {t('cart.emptyTitle')}
          </h1>
          <p className={cn('mx-auto mb-8 max-w-sm text-sm text-gray-500', isRTL && 'font-arabic')}>
            {t('cart.emptyDesc')}
          </p>
          <Link
            to="/catalog"
            className={cn(
              'inline-flex items-center gap-2 rounded-xl bg-catchy px-8 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-catchy/20 transition-all hover:bg-catchy-dark',
              isRTL && 'font-arabic flex-row-reverse'
            )}
          >
            {t('cart.startShopping')} <ArrowRight size={16} className={cn(isRTL && 'rotate-180')} />
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-14 pb-10 md:pt-16 md:pb-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className={cn('mb-1 text-[9px] font-black uppercase tracking-[0.35em] text-catchy/60', isRTL && 'font-arabic')}>
              {t('cart.yourSelection')}
            </p>
            <h1
              className={cn(
                'text-2xl font-light italic text-gray-900 md:text-3xl',
                isRTL ? 'font-arabic not-italic' : 'font-serif'
              )}
            >
              {t('cart.title')}
            </h1>
          </div>
          <p className={cn('text-sm font-medium text-gray-500', isRTL && 'font-arabic')}>{itemCountLine}</p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="space-y-5 lg:col-span-7">
            <AnimatePresence mode="popLayout">
              {cart.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: isRTL ? 12 : -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isRTL ? -12 : 12 }}
                  className="group flex gap-4 border-b border-gray-100 pb-5 sm:flex-row"
                >
                  <Link
                    to={`/product/${item.id}`}
                    className="aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl bg-gray-50 shadow-sm transition-shadow group-hover:shadow-md sm:w-28"
                  >
                    <img
                      src={item.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400'}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 py-0.5">
                    <div>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <Link to={`/product/${item.id}`} className="min-w-0 hover:text-catchy transition-colors">
                          <h3
                            className={cn(
                              'text-base font-semibold leading-snug text-gray-900 md:text-lg',
                              isRTL ? 'font-arabic' : 'font-serif'
                            )}
                          >
                            {item.name}
                          </h3>
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                          aria-label="Remove"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-gray-900">£{item.price}</p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg border border-gray-100 bg-gray-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-900"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-gray-900">
                        £{(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <Link
              to="/catalog"
              className={cn(
                'inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 transition-colors hover:text-catchy',
                isRTL && 'font-arabic flex-row-reverse'
              )}
            >
              <ArrowLeft size={14} className={cn(isRTL && 'rotate-180')} /> {t('cart.continueShopping')}
            </Link>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-24 rounded-2xl border border-gray-100 bg-gray-50 p-5 md:p-6">
              <h2 className={cn('mb-4 text-lg text-gray-900 md:text-xl', isRTL ? 'font-arabic' : 'font-serif')}>
                {t('cart.orderSummary')}
              </h2>

              <div className="mb-5 space-y-3">
                <div
                  className={cn(
                    'flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500',
                    isRTL && 'font-arabic'
                  )}
                >
                  <span>{t('cart.subtotal')}</span>
                  <span className="text-gray-900">£{cartTotal.toFixed(2)}</span>
                </div>
                <div
                  className={cn(
                    'flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500',
                    isRTL && 'font-arabic'
                  )}
                >
                  <span>{t('cart.shipping')}</span>
                  <span className="text-emerald-600">{t('cart.shippingFree')}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                  <span className={cn('text-base text-gray-900', isRTL ? 'font-arabic' : 'font-serif')}>
                    {t('cart.total')}
                  </span>
                  <span className="text-xl font-black text-gray-900">£{cartTotal.toFixed(2)}</span>
                </div>
              </div>

              <button
                type="button"
                className={cn(
                  'w-full rounded-xl bg-catchy py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-md shadow-catchy/20 transition-all hover:bg-catchy-dark active:scale-[0.98]',
                  isRTL && 'font-arabic'
                )}
              >
                {t('cart.checkout')}
              </button>

              <div className="mt-5 space-y-2">
                <p
                  className={cn(
                    'text-center text-[9px] font-bold uppercase tracking-widest text-gray-400',
                    isRTL && 'font-arabic'
                  )}
                >
                  {t('cart.securePayments')}
                </p>
                <div className="flex justify-center gap-3 opacity-30 grayscale">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-3" />
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg"
                    alt="Mastercard"
                    className="h-4"
                  />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
