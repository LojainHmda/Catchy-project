import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { type DeliveryFormValues } from '../../lib/orders';
import type { DeliveryDetails } from '../../types/order';
import { cn } from '../../lib/utils';
import CheckoutDeliveryModal from './CheckoutDeliveryModal';
import ExchangePolicyModal from './ExchangePolicyModal';
import ShippingRatesLine from './ShippingRatesLine';

type CartOrderSummaryProps = {
  subtotal: number;
  onCheckout: (delivery: DeliveryDetails) => Promise<{ orderId: string } | null> | { orderId: string } | null;
  isSubmitting: boolean;
  canCheckout: boolean;
  defaultDelivery?: Partial<DeliveryFormValues>;
  showEmailField?: boolean;
  isSignedIn?: boolean;
  /** One-line shipping rates above checkout (cart drawer). */
  showShippingRates?: boolean;
};

const CartOrderSummary: React.FC<CartOrderSummaryProps> = ({
  subtotal,
  onCheckout,
  isSubmitting,
  canCheckout,
  defaultDelivery,
  showEmailField = true,
  isSignedIn = false,
  showShippingRates = false,
}) => {
  const { t, isRTL } = useLanguage();
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryDetails | null>(null);

  const openDeliveryModal = () => {
    if (!canCheckout || isSubmitting) return;
    setDeliveryModalOpen(true);
  };

  const handleDeliveryConfirmed = (delivery: DeliveryDetails) => {
    setPendingDelivery(delivery);
    setDeliveryModalOpen(false);
    setExchangeModalOpen(true);
  };

  const handleExchangeAccepted = async () => {
    if (!pendingDelivery) return;
    const result = await onCheckout(pendingDelivery);
    if (result) {
      setExchangeModalOpen(false);
      setPendingDelivery(null);
    }
  };

  const handleExchangeClose = () => {
    if (isSubmitting) return;
    setExchangeModalOpen(false);
    setDeliveryModalOpen(true);
  };

  return (
    <>
      <div className={cn(showShippingRates && 'space-y-2.5')}>
        {showShippingRates ? <ShippingRatesLine /> : null}
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
      </div>

      <CheckoutDeliveryModal
        open={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        onConfirm={handleDeliveryConfirmed}
        subtotal={subtotal}
        defaultDelivery={{
          ...defaultDelivery,
          ...(pendingDelivery
            ? {
                customerName: pendingDelivery.customerName,
                customerPhone: pendingDelivery.customerPhone,
                deliveryAddress: pendingDelivery.deliveryAddress,
                deliveryZone: pendingDelivery.deliveryZone,
                email: pendingDelivery.email ?? '',
              }
            : {}),
        }}
        showEmailField={showEmailField}
        isSignedIn={isSignedIn}
      />

      <ExchangePolicyModal
        open={exchangeModalOpen}
        onClose={handleExchangeClose}
        onAccept={handleExchangeAccepted}
        isSubmitting={isSubmitting}
      />
    </>
  );
};

export default CartOrderSummary;
