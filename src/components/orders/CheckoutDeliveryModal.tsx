import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  emptyDeliveryForm,
  validateDeliveryDetails,
  type DeliveryFormValues,
} from '../../lib/orders';
import { deliveryLocationPrice, type DeliveryLocation } from '../../lib/delivery/deliveryAreas';
import { useDeliveryLocationIndex, useDeliveryPrices } from '../../hooks/useDeliveryData';
import type { DeliveryDetails } from '../../types/order';
import { cn } from '../../lib/utils';
import CheckoutDeliveryForm from './CheckoutDeliveryForm';
import OrderTotalsBreakdown from './OrderTotalsBreakdown';

type CheckoutDeliveryModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (delivery: DeliveryDetails) => void;
  subtotal: number;
  defaultDelivery?: Partial<DeliveryFormValues>;
  showEmailField?: boolean;
  isSignedIn?: boolean;
};

const CheckoutDeliveryModal: React.FC<CheckoutDeliveryModalProps> = ({
  open,
  onClose,
  onConfirm,
  subtotal,
  defaultDelivery,
  showEmailField = true,
  isSignedIn = false,
}) => {
  const { t, isRTL } = useLanguage();
  const [deliveryValues, setDeliveryValues] = useState<DeliveryFormValues>(() =>
    emptyDeliveryForm(defaultDelivery?.email ?? '')
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Place list (loaded on first open) and live prices (re-sent when an admin changes them).
  const locations = useDeliveryLocationIndex(open);
  const prices = useDeliveryPrices(open);

  useEffect(() => {
    if (!open) return;
    setDeliveryValues({
      customerName: defaultDelivery?.customerName ?? '',
      customerPhone: defaultDelivery?.customerPhone ?? '',
      deliveryLocationId: defaultDelivery?.deliveryLocationId ?? '',
      deliveryAddress: defaultDelivery?.deliveryAddress ?? '',
      email: defaultDelivery?.email ?? '',
    });
    setSubmitAttempted(false);
  }, [
    open,
    defaultDelivery?.customerName,
    defaultDelivery?.customerPhone,
    defaultDelivery?.deliveryLocationId,
    defaultDelivery?.deliveryAddress,
    defaultDelivery?.email,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const locationIndex = locations.index;
  const validationOptions = useMemo(
    () => ({ isKnownLocation: (id: string) => Boolean(locationIndex?.byId.has(id)) }),
    [locationIndex]
  );
  const validation = useMemo(
    () => validateDeliveryDetails(deliveryValues, validationOptions),
    [deliveryValues, validationOptions]
  );

  const fieldErrors = useMemo(() => {
    if (!submitAttempted || validation.ok) return {};
    return { [validation.field]: t(validation.messageKey) };
  }, [submitAttempted, t, validation]);

  const priceSettings = prices.settings;
  const priceForLocation = useCallback(
    (location: DeliveryLocation) => (priceSettings ? deliveryLocationPrice(location, priceSettings)?.price ?? null : null),
    [priceSettings]
  );
  const selectedLocation = locationIndex?.byId.get(deliveryValues.deliveryLocationId) ?? null;
  // null until a place is chosen and its current price is known (shown as "—").
  const shippingCost = selectedLocation ? priceForLocation(selectedLocation) : null;
  const total = subtotal + (shippingCost ?? 0);
  const waitingForPrice = validation.ok && shippingCost === null;

  const handleSubmit = () => {
    setSubmitAttempted(true);
    const result = validateDeliveryDetails(deliveryValues, validationOptions);
    if (!result.ok || shippingCost === null) return;
    // The price shown here travels with the order: if it changed meanwhile, nothing is placed.
    onConfirm({ ...result.details, expectedShippingCost: shippingCost });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[250]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('cart.deliveryModalCancel')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkout-delivery-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className={cn(
                'pointer-events-auto flex max-h-[min(90vh,680px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
                isRTL && 'font-arabic'
              )}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-4 py-2.5 sm:px-5">
                <div className="min-w-0">
                  <p
                    id="checkout-delivery-title"
                    className={cn('text-sm font-semibold text-catchy', isRTL ? 'font-arabic' : 'font-serif')}
                  >
                    {t('cart.deliveryTitle')}
                  </p>
                  <p className={cn('mt-0.5 text-[10px] leading-snug text-gray-500', isRTL && 'font-arabic')}>
                    {isSignedIn ? t('cart.deliverySubtitleSignedIn') : t('cart.deliverySubtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label={t('cart.deliveryModalCancel')}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-5">
                <CheckoutDeliveryForm
                  values={deliveryValues}
                  onChange={setDeliveryValues}
                  showEmail={showEmailField}
                  isSignedIn={isSignedIn}
                  showAllErrors={submitAttempted}
                  fieldErrors={fieldErrors}
                  embedded
                  locationIndex={locationIndex}
                  locationsLoadFailed={locations.error}
                  onRetryLocations={locations.retry}
                  priceForLocation={priceForLocation}
                />
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-2.5 sm:px-5">
                <div className="mb-2 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2">
                  <OrderTotalsBreakdown subtotal={subtotal} shippingCost={shippingCost} total={total} compact />
                </div>

                {waitingForPrice && prices.error ? (
                  <p className={cn('mb-2 text-[10px] text-red-600', isRTL && 'font-arabic')} data-testid="checkout-prices-unavailable">
                    {t('cart.deliveryPricesUnavailable')}
                  </p>
                ) : null}

                <div className="flex flex-row-reverse gap-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={waitingForPrice}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-xl bg-catchy py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark active:scale-[0.98] disabled:cursor-wait disabled:opacity-60',
                      isRTL && 'font-arabic'
                    )}
                    data-testid="checkout-delivery-continue"
                  >
                    {waitingForPrice && !prices.error ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                    {t('cart.deliveryModalContinue')}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-600 transition hover:border-gray-300 hover:text-gray-900',
                      isRTL && 'font-arabic'
                    )}
                  >
                    {t('cart.deliveryModalCancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default CheckoutDeliveryModal;
