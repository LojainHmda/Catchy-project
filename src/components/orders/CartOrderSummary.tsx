import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney, type DeliveryFormValues } from '../../lib/orders';
import type { DeliveryDetails } from '../../types/order';
import { cn } from '../../lib/utils';
import CheckoutDeliveryModal from './CheckoutDeliveryModal';

type CartOrderSummaryProps = {
  subtotal: number;
  onCheckout: (delivery: DeliveryDetails) => Promise<{ orderId: string } | null> | { orderId: string } | null;
  isSubmitting: boolean;
  canCheckout: boolean;
  defaultDelivery?: Partial<DeliveryFormValues>;
  showEmailField?: boolean;
  isSignedIn?: boolean;
};

const CartOrderSummary: React.FC<CartOrderSummaryProps> = ({
  subtotal,
  onCheckout,
  isSubmitting,
  canCheckout,
  defaultDelivery,
  showEmailField = true,
  isSignedIn = false,
}) => {
  const { t, isRTL } = useLanguage();
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  const openDeliveryModal = () => {
    if (!canCheckout || isSubmitting) return;
    setDeliveryModalOpen(true);
  };

  const handleDeliverySubmit = async (delivery: DeliveryDetails) => {
    const result = await onCheckout(delivery);
    if (result) setDeliveryModalOpen(false);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-2">
          <div className={cn('flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500', isRTL && 'font-arabic')}>
            <span>{t('cart.subtotal')}</span>
            <span className="tabular-nums text-gray-900">{formatOrderMoney(subtotal)}</span>
          </div>
          <div className={cn('flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500', isRTL && 'font-arabic')}>
            <span>{t('cart.shipping')}</span>
            <span className="text-emerald-600">{t('cart.shippingFree')}</span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-2">
            <span className={cn('text-sm font-medium text-gray-900', isRTL ? 'font-arabic' : 'font-serif')}>
              {t('cart.total')}
            </span>
            <span className="text-lg font-black tabular-nums text-gray-900">{formatOrderMoney(subtotal)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={openDeliveryModal}
          disabled={!canCheckout || isSubmitting}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl bg-catchy py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
            isRTL && 'font-arabic'
          )}
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {isSubmitting ? t('cart.placingOrder') : t('cart.checkout')}
        </button>

        <p className={cn('text-center text-[9px] font-bold uppercase tracking-widest text-gray-400', isRTL && 'font-arabic')}>
          {t('cart.securePayments')}
        </p>
      </div>

      <CheckoutDeliveryModal
        open={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        onSubmit={handleDeliverySubmit}
        isSubmitting={isSubmitting}
        defaultDelivery={defaultDelivery}
        showEmailField={showEmailField}
        isSignedIn={isSignedIn}
      />
    </>
  );
};

export default CartOrderSummary;
