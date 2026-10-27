import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, PackageOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import { shortOrderId } from '../../lib/orders';
import { returnableLinesFor } from '../../lib/orders/orderListFilters';
import { createReturnRequest, newIdempotencyKey, ReturnsApiError } from '../../lib/returns/returnsApi';
import { useLanguage } from '../../context/LanguageContext';
import type { OrderRecord } from '../../types/order';
import { RETURN_REASONS, type ReturnReason, type ReturnRecord } from '../../types/returns';
import { cn } from '../../lib/utils';

type ProcessReturnModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
  /** Called with the newly logged returns (not called for a replayed request). */
  onReturnsCreated?: (returns: ReturnRecord[]) => void;
};

/**
 * Owner-only intake onto the returns shelf for a shipped/delivered WEB order.
 * Logged units go to quarantine — stock is NOT changed here; it is only put back
 * when the owner later resolves a return as sellable. Retrying is safe: the same
 * idempotency key is reused until the dialog is closed.
 */
const ProcessReturnModal: React.FC<ProcessReturnModalProps> = ({ open, order, onClose, onOrderPatch, onReturnsCreated }) => {
  const { t, isRTL } = useLanguage();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // Reset only when the dialog opens or another order loads — not on every order
  // patch, so a refreshed order object never wipes what the admin is typing.
  useEffect(() => {
    if (open && order) {
      setQuantities({});
      setReason('');
      setNote('');
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

  const { lines, excludedCoordinateLines } = useMemo(
    () => (order ? returnableLinesFor(order) : { lines: [], excludedCoordinateLines: [] }),
    [order]
  );

  if (typeof document === 'undefined') return null;

  const chosen = lines
    .map((line) => ({ line, quantity: Math.min(quantities[line.key] ?? 0, line.remaining) }))
    .filter((entry) => entry.quantity > 0);
  const totalUnits = chosen.reduce((sum, entry) => sum + entry.quantity, 0);
  const canReview = chosen.length > 0 && !!reason;

  const setQuantity = (key: string, value: number) => {
    // Any change to what is being returned is a new request (new key).
    setIdempotencyKey(null);
    setQuantities((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    if (!order || submitting || !canReview || !reason) return;
    setSubmitting(true);
    try {
      const key = idempotencyKey ?? newIdempotencyKey();
      if (!idempotencyKey) setIdempotencyKey(key);
      const result = await createReturnRequest(
        {
          orderId: order.id,
          lines: chosen.map(({ line, quantity }) => ({
            productId: line.productId,
            colorId: line.colorId,
            size: line.size,
            quantity,
          })),
          reason,
          note: note.trim(),
          idempotencyKey: key,
        },
        t
      );

      if (!result.replayed) {
        const prev = order.returnSummary;
        const byKey = { ...(prev?.returnedQtyByKey ?? {}) };
        for (const { line, quantity } of chosen) byKey[line.key] = (byKey[line.key] ?? 0) + quantity;
        onOrderPatch(order.id, {
          returnSummary: {
            returnCount: (prev?.returnCount ?? 0) + result.returns.length,
            openCount: (prev?.openCount ?? 0) + result.returns.length,
            returnedQtyByKey: byKey,
            lastReturnAt: new Date(),
          },
        });
        onReturnsCreated?.(result.returns);
      }
      toast.success(t('admin.returns.intake.success').replace('{n}', String(totalUnits)), {
        description: t('admin.returns.intake.successHint'),
      });
      onClose();
    } catch (error) {
      const message = error instanceof ReturnsApiError ? error.message : t('admin.returns.intake.failed');
      console.error('Return intake failed:', error);
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
              aria-labelledby="process-return-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="process-return-title" className="flex items-center gap-1.5 text-lg font-semibold text-gray-900">
                    <PackageOpen size={18} className="text-amber-600" />
                    {t('admin.returns.intake.title').replace('{id}', shortOrderId(order.id))}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">{t('admin.returns.intake.intro')}</p>
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
                    {t('admin.returns.intake.itemsHeading')}
                  </h3>
                  {lines.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('admin.returns.intake.nothingReturnable')}</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {lines.map((line) => (
                        <li key={line.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{line.name}</p>
                            <p className="text-[11px] text-gray-500">
                              {t('admin.returns.intake.orderedReturned')
                                .replace('{ordered}', String(line.ordered))
                                .replace('{returned}', String(line.alreadyReturned))}
                            </p>
                          </div>
                          <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
                            <span className="sr-only">{t('admin.returns.intake.qtyLabel').replace('{name}', line.name)}</span>
                            <select
                              value={Math.min(quantities[line.key] ?? 0, line.remaining)}
                              onChange={(e) => setQuantity(line.key, Number(e.target.value))}
                              disabled={submitting || line.remaining === 0}
                              aria-label={t('admin.returns.intake.qtyLabel').replace('{name}', line.name)}
                              className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm tabular-nums disabled:opacity-50"
                            >
                              {Array.from({ length: line.remaining + 1 }, (_, n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {excludedCoordinateLines.length ? (
                  <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {t('admin.returns.intake.coordinateExcluded').replace('{n}', String(excludedCoordinateLines.length))}
                  </p>
                ) : null}

                <section className="mb-4">
                  <label htmlFor="return-reason" className="mb-1.5 block text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.returns.reasonLabel')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="return-reason"
                    value={reason}
                    onChange={(e) => {
                      setIdempotencyKey(null);
                      setReason(e.target.value as ReturnReason | '');
                    }}
                    disabled={submitting}
                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                  >
                    <option value="">{t('admin.returns.reasonPlaceholder')}</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`admin.returns.reason.${r}`)}
                      </option>
                    ))}
                  </select>
                </section>

                <section>
                  <label htmlFor="return-note" className="mb-1.5 block text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.returns.noteLabel')}
                  </label>
                  <textarea
                    id="return-note"
                    value={note}
                    disabled={submitting}
                    onChange={(e) => {
                      setIdempotencyKey(null);
                      setNote(e.target.value);
                    }}
                    rows={2}
                    maxLength={500}
                    placeholder={t('admin.returns.notePlaceholder')}
                    className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                  />
                </section>

                <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  {t('admin.returns.intake.noMoneyNote')}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:px-6">
                {confirming ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-xs font-medium text-amber-800">
                      {t('admin.returns.intake.confirmQuestion').replace('{n}', String(totalUnits))}
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
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-amber-600 px-4 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                        {t('admin.returns.intake.confirmButton')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">
                      {t('admin.returns.intake.selectedUnits').replace('{n}', String(totalUnits))}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        {t('admin.common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        disabled={!canReview}
                        className={cn(
                          'inline-flex h-9 items-center rounded-md bg-amber-600 px-4 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60'
                        )}
                      >
                        {t('admin.returns.intake.reviewButton')}
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

export default ProcessReturnModal;
