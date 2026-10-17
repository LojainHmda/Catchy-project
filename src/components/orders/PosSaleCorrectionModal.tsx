import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, History, Loader2, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import PosCorrectionItemsTable from './PosCorrectionItemsTable';
import { formatOrderMoney, formatOrderDateTime, parseLineItemDisplay } from '../../lib/orders';
import { correctPosSale, PosApiError } from '../../lib/pos/posApi';
import type { OrderLineItem, OrderRecord } from '../../types/order';
import type { PosDiscountInput, PosDiscountMode } from '../../types/pos';
import { useLanguage } from '../../context/LanguageContext';
import { cn, sanitizeDecimalInput } from '../../lib/utils';

type PosSaleCorrectionModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

function itemsSignature(items: OrderLineItem[]): string {
  return JSON.stringify(items.map((i) => [i.productId, i.colorId ?? '', i.size ?? '', i.quantity, i.price, i.name]));
}

const PosSaleCorrectionModal: React.FC<PosSaleCorrectionModalProps> = ({
  open,
  order,
  onClose,
  onOrderPatch,
}) => {
  const { t, language, isRTL } = useLanguage();
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [discountMode, setDiscountMode] = useState<PosDiscountMode>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Minted once per correction *attempt* (not per modal-open) so a retry of the
  // same submit reuses the same key, letting the server recognize and no-op a
  // duplicate instead of applying the correction twice.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && order) {
      setItems(order.items);
      setDiscountMode(order.discount?.mode ?? 'percent');
      setDiscountValue(order.discount ? String(order.discount.value) : '');
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

  const dirty = useMemo(() => {
    if (!order) return false;
    if (itemsSignature(items) !== itemsSignature(order.items)) return true;
    const currentDiscount = order.discount;
    const newValue = Number(discountValue) || 0;
    if (!currentDiscount && newValue <= 0) return false;
    if (!currentDiscount) return true;
    return currentDiscount.mode !== discountMode || currentDiscount.value !== newValue;
  }, [order, items, discountMode, discountValue]);

  const preview = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const value = Number(discountValue) || 0;
    let discountAmount = 0;
    if (value > 0) {
      discountAmount = discountMode === 'percent' ? subtotal * (Math.min(100, value) / 100) : Math.min(value, subtotal);
      discountAmount = Math.round(discountAmount * 100) / 100;
    }
    const total = Math.round((subtotal - discountAmount) * 100) / 100;
    return { subtotal: Math.round(subtotal * 100) / 100, discountAmount, total };
  }, [items, discountMode, discountValue]);

  const originalCollected = useMemo(() => {
    if (!order?.payment) return 0;
    return Math.round(((order.payment.cashAmount || 0) + (order.payment.cardAmount || 0)) * 100) / 100;
  }, [order]);

  const previewBalanceDue = Math.round((preview.total - originalCollected) * 100) / 100;

  const submit = async () => {
    if (!order || submitting || items.length === 0) return;
    setSubmitting(true);
    try {
      const key = idempotencyKey ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      if (!idempotencyKey) setIdempotencyKey(key);

      const discount: PosDiscountInput | null =
        Number(discountValue) > 0 ? { mode: discountMode, value: Number(discountValue) } : null;

      const result = await correctPosSale({
        orderId: order.id,
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          size: i.size ?? null,
          colorId: i.colorId ?? null,
          colorName: i.colorName ?? null,
          image: i.image,
        })),
        discount,
        reason: reason.trim() || null,
        idempotencyKey: key,
      }, t);

      onOrderPatch(order.id, {
        items,
        subtotal: preview.subtotal,
        total: result.total,
        itemCount: result.itemCount,
        balanceDue: result.balanceDue,
        correctionCount: (order.correctionCount ?? 0) + (result.alreadyApplied ? 0 : 1),
      });

      toast.success(result.alreadyApplied ? t('admin.orders.correct.toastAlreadyApplied') : t('admin.orders.correct.toastCorrected'), {
        description:
          result.balanceDue > 0
            ? t('admin.orders.correct.toastAdditionalDue').replace('{amount}', formatOrderMoney(result.balanceDue))
            : result.balanceDue < 0
              ? t('admin.orders.cancel.toastRefundOwed').replace('{amount}', formatOrderMoney(Math.abs(result.balanceDue)))
              : t('admin.orders.correct.toastSettled'),
      });
      onClose();
    } catch (error) {
      const message = error instanceof PosApiError ? error.message : t('admin.orders.correct.genericError');
      console.error('POS sale correction failed:', error);
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
            aria-label={t('admin.orders.correct.closeAria')}
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
              aria-labelledby="pos-correction-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="pos-correction-title" className="flex items-center gap-1.5 text-lg font-semibold text-gray-900">
                    <ShieldAlert size={18} className="text-amber-500" />
                    {t('admin.orders.correct.title')}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t('admin.orders.correct.subtitle')}
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
                    <p>{t('admin.orders.correct.sessionNotice').replace('{id}', order.registerSessionId.slice(0, 8))}</p>
                  </div>
                ) : null}

                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.correct.lineItems')}
                  </h3>
                  <PosCorrectionItemsTable items={items} onItemsChange={setItems} disabled={submitting} />
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.correct.discount')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={discountMode}
                        disabled={submitting}
                        onChange={(e) => setDiscountMode(e.target.value as PosDiscountMode)}
                        className="h-9 appearance-none rounded-md border border-gray-200 bg-white ps-3 pe-8 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                      >
                        <option value="percent">{t('admin.orders.correct.percentOff')}</option>
                        <option value="amount">{t('admin.orders.correct.amountOff')}</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      dir="ltr"
                      value={discountValue}
                      disabled={submitting}
                      onChange={(e) => setDiscountValue(sanitizeDecimalInput(e.target.value))}
                      placeholder="0"
                      className="h-9 w-28 rounded-md border border-gray-200 px-2 text-sm tabular-nums text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                    />
                  </div>
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.correct.reasonLabel')}
                  </h3>
                  <textarea
                    value={reason}
                    disabled={submitting}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder={t('admin.orders.correct.reasonPlaceholder')}
                    className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                  />
                </section>

                <section className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">{t('admin.orders.correct.originalTotal')}</span>
                    <span className="font-medium tabular-nums text-gray-700">{formatOrderMoney(order.total)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-gray-500">{t('admin.orders.correct.correctedTotal')}</span>
                    <span className="font-semibold tabular-nums text-gray-900">{formatOrderMoney(preview.total)}</span>
                  </div>
                  <div className="mt-2 border-t border-gray-200 pt-2 flex items-center justify-between">
                    <span className="text-gray-500">{t('admin.orders.cancel.originallyCollected')}</span>
                    <span className="font-medium tabular-nums text-gray-700">{formatOrderMoney(originalCollected)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-gray-500">
                      {previewBalanceDue > 0 ? t('admin.orders.correct.additionalDue') : previewBalanceDue < 0 ? t('admin.orders.cancel.refundOwed') : t('admin.common.balance')}
                    </span>
                    <span
                      className={cn(
                        'font-bold tabular-nums',
                        previewBalanceDue > 0.004 ? 'text-amber-700' : previewBalanceDue < -0.004 ? 'text-red-600' : 'text-emerald-600'
                      )}
                    >
                      {formatOrderMoney(Math.abs(previewBalanceDue))}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    {t('admin.orders.correct.noAutoPayment')}
                  </p>
                </section>

                {order.corrections && order.corrections.length > 0 ? (
                  <section>
                    <h3 className="mb-1.5 flex items-center gap-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <History size={12} />
                      {t('admin.orders.correct.historyHeading').replace('{n}', String(order.corrections.length))}
                    </h3>
                    <ul className="space-y-2">
                      {[...order.corrections].reverse().map((c, i) => (
                        <li key={i} className="rounded-lg border border-gray-200 px-3 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-medium text-gray-900">
                              {c.correctedByName || c.correctedByUid}
                            </span>
                            <span className="text-gray-400">{formatOrderDateTime(c.correctedAt, language === 'ar' ? 'ar' : 'en-GB')}</span>
                          </div>
                          <p className="mt-1 text-gray-600">
                            {formatOrderMoney(c.before.total ?? 0)} → {formatOrderMoney(c.after.total)}
                          </p>
                          {c.reason ? <p className="mt-1 italic text-gray-500">“{c.reason}”</p> : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:px-6">
                {confirming ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-xs font-medium text-amber-700">
                      {t('admin.orders.correct.confirmQuestion')}
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
                        {t('admin.orders.correct.confirmButton')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      {dirty ? <span className="text-xs text-amber-600">{t('admin.orders.correct.unsavedChanges')}</span> : null}
                    </p>
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
                        disabled={!dirty || items.length === 0}
                        className="inline-flex h-9 items-center rounded-md bg-catchy px-4 text-xs font-semibold text-white transition hover:bg-catchy-dark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t('admin.orders.correct.reviewButton')}
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

export default PosSaleCorrectionModal;
