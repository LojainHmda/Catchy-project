import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import {
  checkoutErrorCode,
  checkoutProductName,
  isOrderError,
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
        console.error('Checkout failed:', error);

        if (code === 'OUT_OF_STOCK') {
          toast.error(t('cart.outOfStock').replace('{name}', productName ?? ''));
        } else if (code === 'PRODUCT_MISSING') {
          toast.error(t('cart.productUnavailable'));
        } else if (code === 'DELIVERY_INVALID') {
          toast.error(t('cart.deliveryInvalid'));
        } else if (isOrderError(error)) {
          toast.error(error.message);
        } else if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
          toast.error(t('cart.permissionDenied'));
        } else if (
          error instanceof Error &&
          error.message.includes('exceeds the maximum allowed size')
        ) {
          toast.error(t('cart.orderTooLarge'));
        } else if (error instanceof Error && error.message) {
          console.error('Checkout detail:', error.message);
          toast.error(t('cart.orderFailed'));
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
