import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react';
import { useCart, type CartItem } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useCheckout } from '../hooks/useCheckout';
import CartOrderSummary from './orders/CartOrderSummary';
import { formatOrderMoney } from '../lib/orders';
import { sortedSizeStockEntries } from '../lib/productInventory';
import { cn } from '../lib/utils';

type CartProductGroup = {
  productId: string;
  name: string;
  price: number;
  image: string;
  lines: CartItem[];
};

function groupCartByProduct(cart: CartItem[]): CartProductGroup[] {
  const groups: CartProductGroup[] = [];
  const indexByProduct = new Map<string, number>();

  for (const item of cart) {
    const existingIndex = indexByProduct.get(item.id);
    if (existingIndex !== undefined) {
      groups[existingIndex].lines.push(item);
      continue;
    }

    indexByProduct.set(item.id, groups.length);
    groups.push({
      productId: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      lines: [item],
    });
  }

  return groups.map((group) => {
    if (group.lines.length <= 1) return group;
    const sizeOrder = sortedSizeStockEntries(
      Object.fromEntries(group.lines.filter((line) => line.size).map((line) => [line.size!, 1]))
    ).map(([size]) => size);
    const rank = new Map(sizeOrder.map((size, index) => [size, index]));
    return {
      ...group,
      lines: [...group.lines].sort((a, b) => {
        const ar = a.size ? rank.get(a.size) ?? 99 : 100;
        const br = b.size ? rank.get(b.size) ?? 99 : 100;
        return ar - br;
      }),
    };
  });
}

type CartPanelProps = {
  variant: 'drawer' | 'page';
  onClose?: () => void;
};

const CartPanel: React.FC<CartPanelProps> = ({ variant, onClose }) => {
  const { cart, removeFromCart, updateQuantity, cartCount } = useCart();
  const { t, isRTL } = useLanguage();
  const { checkout, isSubmitting, cartTotal, canCheckout, defaultDelivery, isSignedIn } = useCheckout({ onClose });
  const isDrawer = variant === 'drawer';
  const productGroups = useMemo(() => groupCartByProduct(cart), [cart]);

  const itemCountLine =
    cartCount === 1
      ? t('cart.itemCountOne')
      : t('cart.itemCount').replace('{n}', String(cartCount));

  const closeDrawer = () => onClose?.();

  if (cart.length === 0) {
    return (
      <motion.div
        className={cn('flex flex-col items-center justify-center px-6 py-12', isDrawer && 'flex-1')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-200">
          <ShoppingBag size={32} />
        </div>
        <h2 className={cn('mt-5 text-xl text-gray-900', isRTL ? 'font-arabic' : 'font-serif')}>
          {t('cart.emptyTitle')}
        </h2>
        <p className={cn('mt-2 max-w-xs text-center text-sm text-gray-500', isRTL && 'font-arabic')}>
          {t('cart.emptyDesc')}
        </p>
        <Link
          to="/catalog"
          onClick={closeDrawer}
          className={cn(
            'mt-6 inline-flex items-center gap-2 rounded-xl bg-catchy px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-catchy/20 transition hover:bg-catchy-dark',
            isRTL && 'font-arabic flex-row-reverse'
          )}
        >
          {t('cart.startShopping')}
          <ArrowRight size={16} className={cn(isRTL && 'rotate-180')} />
        </Link>
      </motion.div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col', isDrawer && 'h-full')}>
      {!isDrawer && (
        <div className="shrink-0 border-b border-gray-100 px-4 py-4 sm:px-5">
          <p className={cn('mb-1 text-[9px] font-black uppercase tracking-[0.35em] text-catchy/60', isRTL && 'font-arabic')}>
            {t('cart.yourSelection')}
          </p>
          <h2 className={cn('text-lg font-medium text-gray-900 md:text-xl', isRTL ? 'font-arabic' : 'font-serif')}>
            {t('cart.title')}
          </h2>
          <p className={cn('mt-1 text-xs text-gray-500', isRTL && 'font-arabic')}>{itemCountLine}</p>
        </div>
      )}

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5',
          isDrawer ? 'py-2 pb-3' : 'py-3 pb-4'
        )}
      >
        <AnimatePresence mode="popLayout">
          {productGroups.map((group) => {
            const groupTotal = group.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
            const showSizeRows = group.lines.length > 1 || Boolean(group.lines[0]?.size);

            return (
              <motion.div
                key={group.productId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  'flex border-b border-gray-100',
                  isDrawer ? 'gap-2.5 py-2.5 last:border-0' : 'mb-4 gap-3 pb-4 last:mb-0'
                )}
              >
                <Link
                  to={`/product/${group.productId}`}
                  onClick={closeDrawer}
                  className={cn(
                    'shrink-0 overflow-hidden bg-gray-50',
                    isDrawer ? 'size-[3.25rem] rounded-md' : 'aspect-[3/4] w-[4.5rem] rounded-lg sm:w-20'
                  )}
                >
                  <img
                    src={group.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400'}
                    alt={group.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Link to={`/product/${group.productId}`} onClick={closeDrawer} className="min-w-0 hover:text-catchy">
                    <h3
                      className={cn(
                        'font-semibold leading-tight text-gray-900',
                        isDrawer ? 'line-clamp-1 text-xs' : 'text-sm leading-snug',
                        isRTL && 'font-arabic'
                      )}
                    >
                      {group.name}
                    </h3>
                    {isDrawer ? (
                      <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">
                        {formatOrderMoney(group.price)}
                      </p>
                    ) : null}
                  </Link>

                  <div className={cn('flex flex-col', isDrawer ? 'gap-1.5' : 'gap-2')}>
                    {group.lines.map((line) => {
                      const qtyControls = (
                        <div className="flex shrink-0 items-center gap-2">
                          <div
                            className={cn(
                              'flex items-center border border-gray-100 bg-white',
                              isDrawer ? 'rounded-md p-px' : 'rounded-lg p-0.5'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => updateQuantity(line.lineKey, line.quantity - 1)}
                              className={cn(
                                'flex items-center justify-center text-gray-500 hover:text-gray-900',
                                isDrawer ? 'h-6 w-6' : 'h-7 w-7'
                              )}
                              aria-label={t('cart.decreaseQty')}
                            >
                              <Minus size={isDrawer ? 12 : 13} />
                            </button>
                            <span
                              className={cn(
                                'text-center font-bold text-gray-900',
                                isDrawer ? 'w-6 text-[11px]' : 'w-7 text-xs'
                              )}
                            >
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(line.lineKey, line.quantity + 1)}
                              className={cn(
                                'flex items-center justify-center text-gray-500 hover:text-gray-900',
                                isDrawer ? 'h-6 w-6' : 'h-7 w-7'
                              )}
                              aria-label={t('cart.increaseQty')}
                            >
                              <Plus size={isDrawer ? 12 : 13} />
                            </button>
                          </div>

                          <p className={cn('min-w-[3.5rem] text-end font-bold tabular-nums text-gray-900', isDrawer ? 'text-xs' : 'text-sm')}>
                            {formatOrderMoney(line.price * line.quantity)}
                          </p>

                          <button
                            type="button"
                            onClick={() => removeFromCart(line.lineKey)}
                            className={cn(
                              'shrink-0 text-gray-300 hover:bg-red-50 hover:text-red-500',
                              isDrawer ? 'rounded-md p-0.5' : 'rounded-lg p-1'
                            )}
                            aria-label={t('cart.removeItem')}
                          >
                            <Trash2 size={isDrawer ? 14 : 15} />
                          </button>
                        </div>
                      );

                      if (!showSizeRows) {
                        return (
                          <div key={line.lineKey} className="flex items-center justify-between gap-2">
                            {qtyControls}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={line.lineKey}
                          className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-2 py-1.5"
                        >
                          <p className="min-w-[3.5rem] text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {line.size ?? t('cart.oneSize')}
                          </p>
                          {qtyControls}
                        </div>
                      );
                    })}
                  </div>

                  {group.lines.length > 1 ? (
                    <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {t('cart.groupTotal')}
                      </span>
                      <span className={cn('font-bold tabular-nums text-gray-900', isDrawer ? 'text-xs' : 'text-sm')}>
                        {formatOrderMoney(groupTotal)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <Link
          to="/catalog"
          onClick={closeDrawer}
          className={cn(
            'mt-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-catchy',
            isRTL && 'font-arabic flex-row-reverse'
          )}
        >
          <ArrowLeft size={14} className={cn(isRTL && 'rotate-180')} />
          {t('cart.continueShopping')}
        </Link>
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-gray-100 bg-white px-4 py-4 sm:px-5',
          isDrawer && 'pb-[max(1rem,env(safe-area-inset-bottom,0px))]'
        )}
      >
        <CartOrderSummary
          subtotal={cartTotal}
          onCheckout={checkout}
          isSubmitting={isSubmitting}
          canCheckout={canCheckout}
          defaultDelivery={defaultDelivery}
          isSignedIn={isSignedIn}
          showEmailField={!isSignedIn}
        />
      </div>
    </div>
  );
};

export default CartPanel;
