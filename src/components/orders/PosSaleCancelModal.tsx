import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Ban, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import OrderLineItemsList from './OrderLineItemsList';
import { formatOrderMoney } from '../../lib/orders';
import { cancelPosSale, PosApiError } from '../../lib/pos/posApi';
import { useLanguage } from '../../context/LanguageContext';
import type { OrderRecord } from '../../types/order';

type PosSaleCancelModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

const PosSaleCancelModal: React.FC<PosSaleCancelModalProps> = ({ open, order, onClose, onOrderPatch }) => {
  const { t, isRTL } = useLanguage();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Minted once per cancellation *attempt* (not per modal-open) so a retry of the
  // same submit reuses the same key — see cancelPosSale's idempotency note.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && order) {
      setReason('');
      setConfirming(false);
      setSubmitting(false);
      setIdempotencyKey(null);
    }
  }, [open, order?.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  const originalCollected = useMemo(() => {
    if (!order?.payment) return 0;
    return Math.round(((order.payment.cashAmount || 0) + (order.payment.cardAmount || 0)) * 100) / 100;
  }, [order]);

  const reasonValid = reason.trim().length > 0;

  const submit = async () => {
    if (!order || submitting || !reasonValid) return;
    setSubmitting(true);
    try {
      const key = idempotencyKey ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      if (!idempotencyKey) setIdempotencyKey(key);

      const result = await cancelPosSale({ orderId: order.id, reason: reason.trim(), idempotencyKey: key }, t);

      onOrderPatch(order.id, {
        status: 'cancelled',
        balanceDue: result.refundDue,
        cancellation: result.alreadyCancelled
          ? order.cancellation
          : {
              cancelledAt: result.cancelledAt,
              cancelledByUid: result.cancelledByUid ?? '',
              cancelledByName: result.cancelledByName,
              reason: result.reason,
              registerSessionStatusAtCancellation: result.registerSessionStatusAtCancellation,
            },
      });

      toast.success(result.alreadyCancelled ? t('admin.orders.cancel.toastAlreadyCancelled') : t('admin.orders.cancel.toastCancelled'), {
        description:
          result.refundDue < 0
            ? t('admin.orders.cancel.toastRefundOwed').replace('{amount}', formatOrderMoney(Math.abs(result.refundDue)))
            : result.refundDue > 0
              ? t('admin.orders.cancel.toastAdditionalDue').replace('{amount}', formatOrderMoney(result.refundDue))
              : t('admin.orders.cancel.toastSettled'),
      });
      onClose();
    } catch (error) {
      const message = error instanceof PosApiError ? error.message : t('admin.orders.cancel.genericError');
      console.error('POS sale cancellation failed:', error);
      toast.error(message);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && order ? (
        <div className="fixed inset-0 z-[280]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('admin.orders.cancel.closeAria')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              if (!submitting) onClose();
            }}
          />

          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-cancel-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="pos-cancel-title" className="flex items-center gap-1.5 text-lg font-semibold text-gray-900">
                    <Ban size={18} className="text-red-500" />
                    {t('admin.orders.cancel.title')}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t('admin.orders.cancel.subtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!submitting) onClose();
                  }}
                  disabled={submitting}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label={t('admin.common.close')}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                {order.registerSessionId ? (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <p>{t('admin.orders.cancel.sessionNotice').replace('{id}', order.registerSessionId.slice(0, 8))}</p>
                  </div>
                ) : null}

                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.cancel.itemsHeading').replace('{n}', String(order.itemCount))}
                  </h3>
                  <OrderLineItemsList items={order.items} variant="table" />
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.cancel.reasonLabel')} <span className="text-red-500">*</span>
                  </h3>
                  <textarea
                    value={reason}
                    disabled={submitting}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder={t('admin.orders.cancel.reasonPlaceholder')}
                    className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                  />
                  {!reasonValid ? <p className="mt-1 text-[11px] text-gray-400">{t('admin.orders.cancel.reasonRequired')}</p> : null}
                </section>

                <section className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('admin.orders.cancel.saleTotal')}</span>
                    <span className="font-medium tabular-nums text-gray-700">{formatOrderMoney(order.total)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-gray-500">{t('admin.orders.cancel.originallyCollected')}</span>
                    <span className="font-medium tabular-nums text-gray-700">{formatOrderMoney(originalCollected)}</span>
                  </div>
                  <div className="mt-2 border-t border-gray-200 pt-2 flex items-center justify-between">
                    <span className="text-gray-500">{originalCollected > 0 ? t('admin.orders.cancel.refundOwed') : t('admin.common.balance')}</span>
                    <span className={cnRefund(originalCollected)}>{formatOrderMoney(originalCollected)}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    {t('admin.orders.cancel.noAutoRefund')}
                  </p>
                </section>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:px-6">
                {confirming ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-xs font-medium text-red-700">
                      {t('admin.orders.cancel.confirmQuestion')}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        disabled={submitting}
                        className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        {t('admin.common.back')}
                      </button>
                      <button
                        type="button"
                        onClick={submit}
                        disabled={submitting}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                        {t('admin.orders.cancel.confirmButton')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        {t('admin.common.close')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={!reasonValid}
                        className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('admin.orders.cancel.reviewButton')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

function cnRefund(originalCollected: number): string {
  if (originalCollected > 0.004) return 'font-bold tabular-nums text-red-600';
  return 'font-bold tabular-nums text-emerald-600';
}

export default PosSaleCancelModal;
