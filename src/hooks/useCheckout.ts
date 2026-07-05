import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import {
  checkoutErrorCode,
  checkoutProductName,
  placeGuestOrderFromCart,
  placeOrderFromCart,
} from '../lib/orders';
import type { DeliveryDetails, PlaceOrderResult } from '../types/order';

type CheckoutOptions = {
  onClose?: () => void;
};

export function useCheckout(options: CheckoutOptions = {}) {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { cart, cartTotal, cartCount, clearCart, closeCart, refreshCartStock } = useCart();
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultDelivery = useMemo(
    () => ({
      customerName: user?.displayName ?? '',
      email: user?.email ?? '',
    }),
    [user?.displayName, user?.email]
  );

  const closeUi = useCallback(() => {
    options.onClose?.();
    closeCart();
  }, [closeCart, options]);

  const checkout = useCallback(
    async (delivery: DeliveryDetails): Promise<PlaceOrderResult | null> => {
      if (!cart.length) {
        toast.error(t('cart.emptyTitle'));
        return null;
      }

      setIsSubmitting(true);
      try {
        const syncedCart = await refreshCartStock();
        if (!syncedCart.length) {
          toast.error(t('cart.emptyTitle'));
          return null;
        }

        const result = user
          ? await placeOrderFromCart(syncedCart, {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              delivery,
            })
          : await placeGuestOrderFromCart(syncedCart, delivery);

        clearCart();
        closeUi();

        toast.success(t('cart.orderPlaced'));

        if (role === 'admin') {
          navigate(`/admin/orders?order=${result.orderId}`);
        } else {
          navigate(`/orders/confirmation/${result.orderId}`);
        }

        return result;
      } catch (error) {
        const code = checkoutErrorCode(error);
        const productName = checkoutProductName(error);
        // Log the technical detail for debugging; the customer only ever sees a friendly reason.
        console.error('Checkout failed:', error);

        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const isNetwork =
          offline ||
          (error instanceof Error && /network|failed to fetch|fetch failed|timeout|unavailable/i.test(error.message));

        if (code === 'OUT_OF_STOCK') {
          toast.error(t('cart.outOfStock').replace('{name}', productName ?? ''));
        } else if (code === 'PRODUCT_MISSING') {
          toast.error(t('cart.productUnavailable'));
        } else if (code === 'DELIVERY_INVALID') {
          toast.error(t('cart.deliveryInvalid'));
        } else if (code === 'NOT_SIGNED_IN') {
          toast.error(t('cart.signInToCheckout'));
        } else if (code === 'EMPTY_CART') {
          toast.error(t('cart.emptyTitle'));
        } else if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
          toast.error(t('cart.permissionDenied'));
        } else if (
          error instanceof Error &&
          error.message.includes('exceeds the maximum allowed size')
        ) {
          toast.error(t('cart.orderTooLarge'));
        } else if (isNetwork) {
          toast.error(t('cart.networkError'));
        } else {
          toast.error(t('cart.orderFailed'));
        }
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [cart.length, clearCart, closeUi, navigate, refreshCartStock, role, t, user]
  );

  return {
    checkout,
    isSubmitting,
    cartTotal,
    cartCount,
    canCheckout: cart.length > 0 && !isSubmitting,
    defaultDelivery,
    isSignedIn: Boolean(user),
  };
}
