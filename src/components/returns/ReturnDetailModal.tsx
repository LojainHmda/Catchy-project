import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, PackageCheck, Trash2, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import ReturnStatusBadge from './ReturnStatusBadge';
import { formatOrderDateTime, shortOrderId } from '../../lib/orders';
import {
  newIdempotencyKey,
  resolveReturnRequest,
  ReturnsApiError,
  updateReturnRequest,
} from '../../lib/returns/returnsApi';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import type { ReturnDisposition, ReturnRecord } from '../../types/returns';

type ReturnDetailModalProps = {
  open: boolean;
  record: ReturnRecord | null;
  onClose: () => void;
  /** The return as the server now stores it, after an inspection or a resolution. */
  onChanged: (record: ReturnRecord) => void;
};

const DISPOSITION_ICON: Record<ReturnDisposition, React.ReactNode> = {
  restocked: <PackageCheck size={14} />,
  damaged: <Trash2 size={14} />,
  manual_review: <AlertTriangle size={14} />,
};

/**
 * Owner-only inspection and final disposition of one returned line.
 * Only "Sellable — restock" changes stock (server transaction, exact
 * product/colour/size, never re-creates a missing one). Resolutions are final.
 */
const ReturnDetailModal: React.FC<ReturnDetailModalProps> = ({ open, record, onClose, onChanged }) => {
  const { t, language, isRTL } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const [notes, setNotes] = useState('');
  const [savingInspection, setSavingInspection] = useState(false);
  const [pending, setPending] = useState<ReturnDisposition | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [restockBlocked, setRestockBlocked] = useState<string | null>(null);
  const [resolveKey, setResolveKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && record) {
      setNotes(record.inspectionNotes ?? '');
      setPending(null);
      setResolutionNote('');
      setRestockBlocked(null);
      setResolveKey(null);
    }
    // Reset only when the dialog opens or another return loads.
  }, [open, record?.id]);

  const busy = savingInspection || resolving;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (typeof document === 'undefined') return null;

  const onShelf = !!record && record.status !== 'resolved';
  const notesDirty = !!record && notes.trim() !== (record.inspectionNotes ?? '').trim();

  const saveInspection = async (status?: 'quarantine' | 'needs_repair') => {
    if (!record || busy) return;
    setSavingInspection(true);
    try {
      const updated = await updateReturnRequest(
        { returnId: record.id, ...(status ? { status } : {}), ...(notesDirty ? { inspectionNotes: notes.trim() || null } : {}) },
        t
      );
      if (updated) onChanged(updated);
      toast.success(t('admin.returns.detail.inspectionSaved'));
    } catch (error) {
      toast.error(error instanceof ReturnsApiError ? error.message : t('admin.returns.detail.failed'));
    } finally {
      setSavingInspection(false);
    }
  };

  const chooseDisposition = (disposition: ReturnDisposition) => {
    setPending(disposition);
    setResolveKey(null);
  };

  const resolve = async () => {
    if (!record || !pending || busy) return;
    if (pending === 'manual_review' && !resolutionNote.trim()) return;
    setResolving(true);
    try {
      const key = resolveKey ?? newIdempotencyKey();
      if (!resolveKey) setResolveKey(key);
      const result = await resolveReturnRequest(
        { returnId: record.id, disposition: pending, note: resolutionNote.trim(), idempotencyKey: key },
        t
      );
      if (result.record) onChanged(result.record);
      toast.success(t(`admin.returns.detail.resolved.${pending}`));
      onClose();
    } catch (error) {
      if (error instanceof ReturnsApiError && error.code === 'RESTOCK_NOT_POSSIBLE') {
        setRestockBlocked(error.skipReason ? t(`admin.returns.skip.${error.skipReason}`) : error.message);
        setPending(null);
      } else {
        toast.error(error instanceof ReturnsApiError ? error.message : t('admin.returns.detail.failed'));
      }
    } finally {
      setResolving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && record ? (
        <div className="fixed inset-0 z-[270]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('admin.common.close')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              if (!busy) onClose();
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="return-detail-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="return-detail-title" className="truncate text-lg font-semibold text-gray-900">
                    {record.productName} × {record.quantity}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <ReturnStatusBadge status={record.status} disposition={record.disposition} />
                    <Link to={`/admin/orders?order=${record.orderId}`} className="font-mono text-catchy hover:underline" onClick={onClose}>
                      {shortOrderId(record.orderId)}
                    </Link>
                    <span>{formatOrderDateTime(record.createdAt, locale)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!busy) onClose();
                  }}
                  disabled={busy}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label={t('admin.common.close')}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                {onShelf ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {t('admin.returns.detail.notSellable')}
                  </p>
                ) : null}

                <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">{t('admin.returns.col.customer')}:</dt>
                    <dd className="truncate font-medium text-gray-900">{record.customerName || '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">{t('admin.orders.detail.phone')}:</dt>
                    <dd className="truncate font-medium text-gray-900">{record.customerPhone || '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">{t('admin.returns.variant')}:</dt>
                    <dd className="truncate font-medium text-gray-900">
                      {[record.colorName, record.size].filter(Boolean).join(' / ') || '—'}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">{t('admin.returns.reasonLabel')}:</dt>
                    <dd className="truncate font-medium text-gray-900">
                      {record.reason ? t(`admin.returns.reason.${record.reason}`) : '—'}
                    </dd>
                  </div>
                  {record.note ? (
                    <div className="sm:col-span-2">
                      <dt className="sr-only">{t('admin.returns.noteLabel')}</dt>
                      <dd className="italic text-gray-600">&ldquo;{record.note}&rdquo;</dd>
                    </div>
                  ) : null}
                </dl>

                <section>
                  <label htmlFor="return-inspection" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.returns.detail.inspectionNotes')}
                  </label>
                  {onShelf ? (
                    <>
                      <textarea
                        id="return-inspection"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={busy}
                        rows={3}
                        maxLength={2000}
                        placeholder={t('admin.returns.detail.inspectionPlaceholder')}
                        className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy focus:ring-1 focus:ring-catchy/20"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveInspection()}
                          disabled={busy || !notesDirty}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {savingInspection ? <Loader2 size={12} className="animate-spin" /> : null}
                          {t('admin.returns.detail.saveNotes')}
                        </button>
                        {record.status === 'quarantine' ? (
                          <button
                            type="button"
                            onClick={() => saveInspection('needs_repair')}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-orange-200 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50"
                          >
                            <Wrench size={12} />
                            {t('admin.returns.detail.markNeedsRepair')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => saveInspection('quarantine')}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                          >
                            {t('admin.returns.detail.backToQuarantine')}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-700">{record.inspectionNotes || '—'}</p>
                  )}
                </section>

                {onShelf ? (
                  <section>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('admin.returns.detail.finalDisposition')}
                    </h3>
                    {restockBlocked ? (
                      <p className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>
                          {t('admin.returns.detail.restockBlocked').replace('{reason}', restockBlocked)}
                        </span>
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(['restocked', 'damaged', 'manual_review'] as ReturnDisposition[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => chooseDisposition(d)}
                          disabled={busy || (d === 'restocked' && !!restockBlocked)}
                          aria-pressed={pending === d}
                          className={cn(
                            'inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                            pending === d ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          {DISPOSITION_ICON[d]}
                          {t(`admin.returns.detail.choose.${d}`)}
                        </button>
                      ))}
                    </div>
                    {pending ? (
                      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                        <p className="text-xs text-gray-700">{t(`admin.returns.detail.explain.${pending}`)}</p>
                        <label htmlFor="return-resolution-note" className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {t('admin.returns.detail.resolutionNote')}
                          {pending === 'manual_review' ? <span className="text-red-500"> *</span> : null}
                        </label>
                        <textarea
                          id="return-resolution-note"
                          value={resolutionNote}
                          onChange={(e) => {
                            setResolveKey(null);
                            setResolutionNote(e.target.value);
                          }}
                          disabled={busy}
                          rows={2}
                          maxLength={1000}
                          className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPending(null)}
                            disabled={busy}
                            className="inline-flex h-8 items-center rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-50"
                          >
                            {t('admin.common.back')}
                          </button>
                          <button
                            type="button"
                            onClick={resolve}
                            disabled={busy || (pending === 'manual_review' && !resolutionNote.trim())}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {resolving ? <Loader2 size={12} className="animate-spin" /> : null}
                            {t('admin.returns.detail.confirmResolve')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                    <p className="font-medium text-gray-900">
                      {t('admin.returns.detail.resolvedBy')
                        .replace('{name}', record.resolvedByName || '—')
                        .replace('{date}', formatOrderDateTime(record.resolvedAt, locale))}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {record.restockApplied
                        ? t('admin.returns.detail.stockRestored').replace('{n}', String(record.quantity))
                        : t('admin.returns.detail.stockUnchanged')}
                    </p>
                    {record.restockSkipReason ? (
                      <p className="mt-1 text-xs text-amber-800">{t(`admin.returns.skip.${record.restockSkipReason}`)}</p>
                    ) : null}
                    {record.resolutionNote ? (
                      <p className="mt-1 text-xs italic text-gray-600">&ldquo;{record.resolutionNote}&rdquo;</p>
                    ) : null}
                  </section>
                )}

                {record.history.length ? (
                  <section>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('admin.returns.detail.history')}
                    </h3>
                    <ol className="space-y-1 text-xs text-gray-600">
                      {record.history.map((h, i) => (
                        <li key={i} className="flex flex-wrap gap-x-2">
                          <span className="tabular-nums text-gray-400">{formatOrderDateTime(h.at, locale)}</span>
                          <span className="font-medium text-gray-800">{t(`admin.returns.history.${h.action}`)}</span>
                          {h.status ? <span>→ {t(`admin.returns.status.${h.status}`)}</span> : null}
                          {h.disposition ? <span>→ {t(`admin.returns.disposition.${h.disposition}`)}</span> : null}
                          {h.byName ? <span className="text-gray-400">· {h.byName}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default ReturnDetailModal;
