import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  emptyDeliveryForm,
  validateDeliveryDetails,
  type DeliveryFormValues,
} from '../../lib/orders';
import { computeOrderTotals } from '../../lib/shippingZones';
import type { DeliveryDetails } from '../../types/order';
import type { ShippingZoneId } from '../../lib/shippingZones';
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

  useEffect(() => {
    if (!open) return;
    setDeliveryValues({
      customerName: defaultDelivery?.customerName ?? '',
      customerPhone: defaultDelivery?.customerPhone ?? '',
      deliveryAddress: defaultDelivery?.deliveryAddress ?? '',
      deliveryZone: defaultDelivery?.deliveryZone ?? '',
      email: defaultDelivery?.email ?? '',
    });
    setSubmitAttempted(false);
  }, [
    open,
    defaultDelivery?.customerName,
    defaultDelivery?.customerPhone,
    defaultDelivery?.deliveryAddress,
    defaultDelivery?.deliveryZone,
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

  const validation = useMemo(() => validateDeliveryDetails(deliveryValues), [deliveryValues]);

  const fieldErrors = useMemo(() => {
    if (!submitAttempted || validation.ok) return {};
    return { [validation.field]: t(validation.messageKey) };
  }, [submitAttempted, t, validation]);

  const totals = useMemo(
    () => computeOrderTotals(subtotal, deliveryValues.deliveryZone as ShippingZoneId),
    [deliveryValues.deliveryZone, subtotal]
  );

  const handleSubmit = () => {
    setSubmitAttempted(true);
    const result = validateDeliveryDetails(deliveryValues);
    if (!result.ok) return;
    onConfirm(result.details);
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
                />
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-2.5 sm:px-5">
                <div className="mb-2 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2">
                  <OrderTotalsBreakdown
                    subtotal={totals.subtotal}
                    shippingCost={totals.shippingCost}
                    total={totals.total}
                    compact
                  />
                </div>

                <div className="flex flex-row-reverse gap-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-xl bg-catchy py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark active:scale-[0.98]',
                      isRTL && 'font-arabic'
                    )}
                  >
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
