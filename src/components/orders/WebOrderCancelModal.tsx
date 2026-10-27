import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Ban, Loader2, PackageCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import OrderLineItemsList from './OrderLineItemsList';
import { AdminOrderApiError, cancelWebOrderRequest, formatOrderMoney, shortOrderId } from '../../lib/orders';
import { isCoordinateCartId } from '../../lib/coordinateCart';
import { useLanguage } from '../../context/LanguageContext';
import type { OrderRecord } from '../../types/order';
import { cn } from '../../lib/utils';

type WebOrderCancelModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

/**
 * Owner-only cancellation of a web order. The server cancels and restores
 * stock in one transaction; repeated submits (retry / double click) are safe —
 * an already-cancelled order is a no-op and stock is never restored twice.
 */
const WebOrderCancelModal: React.FC<WebOrderCancelModalProps> = ({ open, order, onClose, onOrderPatch }) => {
  const { t, isRTL } = useLanguage();
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // One key per cancellation attempt, reused on retry (recorded in the audit entry).
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && order) {
      setReason('');
      setRestock(null);
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

  if (typeof document === 'undefined') return null;

  const isShipped = order?.status === 'shipped';
  const hasCoordinateLines = !!order?.items.some((item) => isCoordinateCartId(item.productId));
  const reasonValid = reason.trim().length > 0;
  const restockChosen = !isShipped || restock !== null;
  const canReview = reasonValid && restockChosen;

  const submit = async () => {
    if (!order || submitting || !canReview) return;
    setSubmitting(true);
    try {
      const key = idempotencyKey ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      if (!idempotencyKey) setIdempotencyKey(key);

      const result = await cancelWebOrderRequest(
        { orderId: order.id, reason: reason.trim(), restock: isShipped ? restock === true : true, idempotencyKey: key },
        t
      );

      onOrderPatch(order.id, {
        status: 'cancelled',
        cancellation: result.cancellation ?? order.cancellation ?? null,
        ...(!result.cancellation
          ? {}
          : {
              statusUpdatedAt: result.cancellation.cancelledAt,
              statusUpdatedByUid: result.cancellation.cancelledByUid,
              statusUpdatedByName: result.cancellation.cancelledByName,
            }),
      });

      if (result.alreadyCancelled) {
        toast.info(t('admin.orders.webCancel.alreadyCancelled'));
      } else {
        // Also covers `replayed`: this same attempt had already succeeded (e.g. the first response was lost).
        const restored = result.cancellation?.restoredLines?.length ?? 0;
        const skipped = result.cancellation?.skippedLines?.length ?? 0;
        toast.success(t('admin.orders.webCancel.success'), {
          description: !result.cancellation?.restockApplied
            ? t('admin.orders.webCancel.successNoRestock')
            : restored === 0 && skipped > 0
              ? t('admin.orders.webCancel.successNothingRestored')
              : skipped
                ? t('admin.orders.webCancel.successPartial').replace('{n}', String(skipped))
                : t('admin.orders.webCancel.successRestocked'),
        });
      }
      onClose();
    } catch (error) {
      const message = error instanceof AdminOrderApiError ? error.message : t('admin.orders.webCancel.failed');
      console.error('Web order cancellation failed:', error);
      toast.error(message);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && order ? (
        <div className="fixed inset-0 z-[280]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('admin.common.close')}
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
              aria-labelledby="web-cancel-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="web-cancel-title" className="flex items-center gap-1.5 text-lg font-semibold text-gray-900">
                    <Ban size={18} className="text-red-500" />
                    {t('admin.orders.webCancel.title').replace('{id}', shortOrderId(order.id))}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">{t('admin.orders.webCancel.intro')}</p>
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
                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.cancel.itemsHeading').replace('{n}', String(order.itemCount))}
                  </h3>
                  <OrderLineItemsList items={order.items} variant="table" />
                  <p className="mt-2 text-end text-sm text-gray-600">
                    {t('admin.common.total')}: <span className="font-semibold tabular-nums">{formatOrderMoney(order.total)}</span>
                  </p>
                </section>

                {isShipped ? (
                  <fieldset className="mb-4">
                    <legend className="mb-1.5 text-sm font-medium text-gray-900">
                      {t('admin.orders.webCancel.shippedQuestion')} <span className="text-red-500">*</span>
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { value: true, label: t('admin.orders.webCancel.shippedYes') },
                        { value: false, label: t('admin.orders.webCancel.shippedNo') },
                      ].map((option) => (
                        <label
                          key={String(option.value)}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm',
                            restock === option.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                          )}
                        >
                          <input
                            type="radio"
                            name="web-cancel-restock"
                            checked={restock === option.value}
                            onChange={() => setRestock(option.value)}
                            disabled={submitting}
                            className="mt-0.5"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                    <PackageCheck size={14} className="mt-0.5 shrink-0" />
                    {t('admin.orders.webCancel.restockInfo')}
                  </p>
                )}

                {hasCoordinateLines ? (
                  <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {t('admin.orders.webCancel.coordinateWarning')}
                  </p>
                ) : null}

                <section>
                  <label htmlFor="web-cancel-reason" className="mb-1.5 block text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.cancel.reasonLabel')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="web-cancel-reason"
                    value={reason}
                    disabled={submitting}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder={t('admin.orders.webCancel.reasonPlaceholder')}
                    className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                  />
                  {!reasonValid ? <p className="mt-1 text-[11px] text-gray-400">{t('admin.orders.cancel.reasonRequired')}</p> : null}
                </section>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:px-6">
                {confirming ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-xs font-medium text-red-700">{t('admin.orders.webCancel.confirmQuestion')}</p>
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
                        {submitting ? t('admin.orders.webCancel.working') : t('admin.orders.webCancel.confirmButton')}
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
                        {t('admin.orders.webCancel.keep')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={!canReview}
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

export default WebOrderCancelModal;
