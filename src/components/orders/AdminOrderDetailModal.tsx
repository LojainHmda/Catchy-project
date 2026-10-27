import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Link2, PackageOpen, Pencil, Phone, ShieldAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import OrderLineItemsList from './OrderLineItemsList';
import OrderStatusBadge from './OrderStatusBadge';
import OrderSourceBadge from './OrderSourceBadge';
import InvoiceDownloadButton from './InvoiceDownloadButton';
import AdminOrderEditModal from './AdminOrderEditModal';
import PosSaleCorrectionModal from './PosSaleCorrectionModal';
import PosSaleCancelModal from './PosSaleCancelModal';
import WebOrderCancelModal from './WebOrderCancelModal';
import ProcessReturnModal from './ProcessReturnModal';
import ReturnStatusBadge from '../returns/ReturnStatusBadge';
import OrderAdminNote from './OrderAdminNote';
import OrderCustomerHistory from './OrderCustomerHistory';
import { formatOrderDateTime, formatOrderMoney, shortOrderId } from '../../lib/orders';
import { canCancelWebOrder, canStartWebReturn, returnableLinesFor } from '../../lib/orders/orderListFilters';
import { orderHasReturns } from '../../lib/orders/orderUtils';
import { fetchReturnsForOrder } from '../../lib/returns/returnsApi';
import { SHIPPING_ZONES } from '../../lib/shippingZones';
import type { ReturnRecord } from '../../types/returns';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import type { CancellationLine, OrderRecord, OrderStatus } from '../../types/order';

/** Statuses where the admin may still edit the order (items, customer, status). */
const ORDER_EDITABLE_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped'];

type AdminOrderDetailModalProps = {
  open: boolean;
  order: OrderRecord | null;
  /** Every loaded order — used for the customer-history panel. */
  allOrders?: OrderRecord[];
  /** Switch the modal to another order (from the customer-history list). */
  onSelectOrder?: (orderId: string) => void;
  onClose: () => void;
  /** Merge persisted changes back into the parent's order state. */
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

const SKIP_REASON_KEYS: Record<NonNullable<CancellationLine['reason']>, string> = {
  coordinate_set: 'admin.orders.detail.skipCoordinate',
  product_missing: 'admin.orders.detail.skipMissing',
  variant_missing: 'admin.orders.detail.skipVariantMissing',
  size_missing: 'admin.orders.detail.skipSizeMissing',
  not_restocked: 'admin.orders.detail.skipNotRestocked',
};

function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-gray-500">{label}:</span>
      <span className="min-w-0 truncate font-medium text-gray-900">{value?.trim() || '—'}</span>
    </div>
  );
}

const AdminOrderDetailModal: React.FC<AdminOrderDetailModalProps> = ({
  open,
  order,
  allOrders = [],
  onSelectOrder,
  onClose,
  onOrderPatch,
}) => {
  const { role } = useAuth();
  const { t, language, isRTL } = useLanguage();
  const locale = language === 'ar' ? 'ar' : 'en-GB';
  const [editing, setEditing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellingWeb, setCancellingWeb] = useState(false);
  const [returning, setReturning] = useState(false);
  const [orderReturns, setOrderReturns] = useState<ReturnRecord[] | null>(null);

  // Close the editor whenever the detail modal closes or a different order loads.
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setCorrecting(false);
      setCancelling(false);
      setCancellingWeb(false);
      setReturning(false);
    }
  }, [open]);
  useEffect(() => {
    setEditing(false);
    setCorrecting(false);
    setCancelling(false);
    setCancellingWeb(false);
    setReturning(false);
  }, [order?.id]);

  // This order's returns (owner-readable). Loaded only when the order has any.
  const returnCount = order?.returnSummary?.returnCount ?? 0;
  useEffect(() => {
    setOrderReturns(null);
    if (!open || !order?.id || role !== 'admin' || returnCount === 0) return;
    let cancelled = false;
    fetchReturnsForOrder(order.id)
      .then((list) => {
        if (!cancelled) setOrderReturns(list);
      })
      .catch((error) => {
        console.warn('Returns for this order could not be loaded:', error);
        if (!cancelled) setOrderReturns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, order?.id, role, returnCount]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // While a sub-editor is open it owns Escape — don't close the detail behind it.
      if (e.key === 'Escape' && !editing && !correcting && !cancelling && !cancellingWeb && !returning) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, editing, correcting, cancelling, cancellingWeb, returning, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  const canEdit = !!order && ORDER_EDITABLE_STATUSES.includes(order.status);
  // Correcting or cancelling a completed POS sale is deliberately not gated by
  // the pending/processing/shipped statuses above — that's the whole point: it
  // must work *after* checkout is finished. Admin-only given the stakes
  // (retroactive stock + totals); the server independently re-checks both.
  // Once cancelled, a sale is terminal — neither action is offered again (the
  // server independently refuses a correction on a cancelled sale too).
  const canCorrect = !!order && order.source === 'pos' && role === 'admin' && order.status !== 'cancelled';
  const canCancel = !!order && order.source === 'pos' && role === 'admin' && order.status !== 'cancelled';
  // Web orders: cancelled through the owner-only server endpoint so stock is restored atomically.
  const canCancelWeb = !!order && role === 'admin' && canCancelWebOrder(order);
  const webCancellation = order?.status === 'cancelled' && order.source !== 'pos' ? order.cancellation : null;
  // Returns shelf: shipped/delivered web orders with at least one unit not yet returned.
  const canReturn =
    !!order && role === 'admin' && canStartWebReturn(order) && returnableLinesFor(order).lines.some((l) => l.remaining > 0);
  const hasReturns = orderHasReturns(order);
  const zoneLabelKey = SHIPPING_ZONES.find((z) => z.id === order?.deliveryZone)?.labelKey ?? null;

  const copyOrderLink = async () => {
    if (!order) return;
    const url = `${window.location.origin}/admin/orders?order=${encodeURIComponent(order.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('admin.orders.detail.linkCopied'));
    } catch {
      toast.error(t('admin.orders.detail.linkCopyFailed'));
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && order ? (
        <div className="fixed inset-0 z-[260]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('admin.orders.detail.closeAria')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-order-detail-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto flex max-h-[min(92vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="admin-order-detail-title" className="font-mono text-lg font-semibold text-gray-900">
                    {shortOrderId(order.id)}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">{formatOrderDateTime(order.createdAt, language === 'ar' ? 'ar' : 'en-GB')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-lg font-bold tabular-nums text-gray-900">{formatOrderMoney(order.total)}</p>
                  <button
                    type="button"
                    onClick={copyOrderLink}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label={t('admin.orders.detail.copyLink')}
                    title={t('admin.orders.detail.copyLink')}
                  >
                    <Link2 size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label={t('admin.orders.detail.closeAria')}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.orders.detail.customer')}
                  </h3>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <ReadonlyField label={t('admin.orders.detail.name')} value={order.customerName} />
                        {order.isGuest ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            {t('admin.orders.detail.guest')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <ReadonlyField label={t('admin.orders.detail.phone')} value={order.customerPhone} />
                        {order.customerPhone?.trim() ? (
                          <a
                            href={`tel:${order.customerPhone.replace(/[^\d+]/g, '')}`}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-catchy hover:bg-catchy/10"
                            aria-label={t('admin.orders.detail.callCustomer')}
                            title={t('admin.orders.detail.callCustomer')}
                          >
                            <Phone size={13} />
                          </a>
                        ) : null}
                      </div>
                      <div className="min-w-[12rem] flex-[1.5]">
                        <ReadonlyField label={t('admin.orders.detail.email')} value={order.customerEmail} />
                      </div>
                    </div>
                    <div className="mt-2 border-t border-gray-200/80 pt-2">
                      <ReadonlyField label={t('admin.orders.detail.address')} value={order.deliveryAddress} />
                    </div>
                    {order.source !== 'pos' ? (
                      <div className="mt-2 border-t border-gray-200/80 pt-2">
                        <ReadonlyField
                          label={t('admin.orders.detail.zone')}
                          value={zoneLabelKey ? t(zoneLabelKey) : order.deliveryZone}
                        />
                      </div>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-gray-200 px-3 py-2 text-xs sm:grid-cols-4">
                    <div>
                      <dt className="text-gray-500">{t('admin.orders.detail.subtotal')}</dt>
                      <dd className="font-medium tabular-nums text-gray-900">{formatOrderMoney(order.subtotal)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('admin.orders.detail.shipping')}</dt>
                      <dd className="font-medium tabular-nums text-gray-900">{formatOrderMoney(order.shippingCost)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('admin.orders.detail.discount')}</dt>
                      <dd className="font-medium tabular-nums text-gray-900">
                        {order.discount?.amount ? `−${formatOrderMoney(order.discount.amount)}` : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('admin.common.total')}</dt>
                      <dd className="font-semibold tabular-nums text-gray-900">{formatOrderMoney(order.total)}</dd>
                    </div>
                    {order.payment ? (
                      <div className="col-span-2 sm:col-span-4">
                        <dt className="sr-only">{t('admin.orders.detail.payment')}</dt>
                        <dd className="text-gray-600">
                          {t('admin.orders.detail.payment')}: {t(`admin.orders.detail.paymentMethod.${order.payment.method}`)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="mb-4">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('admin.orders.detail.orderStatus')}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <OrderSourceBadge source={order.source} className="px-2.5 py-0.5 text-[10px]" />
                      <OrderStatusBadge
                        status={order.status}
                        needsReview={order.statusNeedsReview}
                        rawStatus={order.rawStatus}
                        variant="admin"
                      />
                    </div>
                  </div>
                  {order.statusNeedsReview ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      {t('orders.status.needsReviewHint').replace('{raw}', order.rawStatus?.trim() ? order.rawStatus : '—')}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
                      {t(`orders.status.${order.status}`)}
                    </div>
                  )}
                  {order.status === 'cancelled' && order.cancellation ? (
                    <div className="mt-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      <p className="font-semibold text-gray-900">
                        {t('admin.orders.detail.cancelledBy').replace(
                          '{name}',
                          order.cancellation.cancelledByName || order.cancellation.cancelledByUid
                        )}
                        {order.cancellation.cancelledAt
                          ? t('admin.orders.detail.cancelledOnDate').replace('{date}', formatOrderDateTime(order.cancellation.cancelledAt, language === 'ar' ? 'ar' : 'en-GB'))
                          : ''}
                      </p>
                      {order.cancellation.reason ? (
                        <p className="mt-1 italic text-gray-600">&ldquo;{order.cancellation.reason}&rdquo;</p>
                      ) : null}
                      {webCancellation ? (
                        <div className="mt-2 border-t border-gray-200 pt-2">
                          <p
                            className={
                              webCancellation.restockApplied && webCancellation.restoredLines?.length
                                ? 'text-emerald-700'
                                : 'text-gray-700'
                            }
                          >
                            {!webCancellation.restockApplied
                              ? t('admin.orders.detail.noRestock')
                              : webCancellation.restoredLines?.length
                                ? t('admin.orders.detail.restockSummary').replace(
                                    '{n}',
                                    String(webCancellation.restoredLines.length)
                                  )
                                : t('admin.orders.detail.restockNone')}
                          </p>
                          {webCancellation.skippedLines?.length ? (
                            <div className="mt-1 text-amber-800">
                              <p className="font-semibold">{t('admin.orders.detail.skippedTitle')}</p>
                              <ul className="ms-4 list-disc">
                                {webCancellation.skippedLines.map((line, i) => (
                                  <li key={`${line.productId}-${i}`}>
                                    {line.name || line.productId} × {line.quantity}
                                    {line.reason ? ` — ${t(SKIP_REASON_KEYS[line.reason])}` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {/* POS sale cancelled after its product/colour/size was removed: those lines were not restocked. */}
                      {!webCancellation && order.cancellation.skippedLines?.length ? (
                        <div className="mt-2 border-t border-gray-200 pt-2 text-amber-800">
                          <p className="font-semibold">{t('admin.orders.detail.skippedTitle')}</p>
                          <ul className="ms-4 list-disc">
                            {order.cancellation.skippedLines.map((line, i) => (
                              <li key={`${line.productId}-${i}`}>
                                {line.name || line.productId} × {line.quantity}
                                {line.reason ? ` — ${t(SKIP_REASON_KEYS[line.reason])}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {order.statusUpdatedByName && !(order.status === 'cancelled' && order.cancellation) ? (
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      {t('admin.orders.detail.statusChangedBy')
                        .replace('{name}', order.statusUpdatedByName)
                        .replace('{date}', formatOrderDateTime(order.statusUpdatedAt ?? null, locale))}
                    </p>
                  ) : null}
                  {order.balanceDue ? (
                    <div
                      className={cn(
                        'mt-2 rounded-lg border px-3 py-2 text-xs font-semibold',
                        order.balanceDue > 0
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-red-200 bg-red-50 text-red-700'
                      )}
                    >
                      {order.balanceDue > 0
                        ? t('admin.orders.detail.balanceAdditionalDue').replace('{amount}', formatOrderMoney(order.balanceDue))
                        : order.status === 'cancelled'
                          ? t('admin.orders.detail.balanceRefundCancellation').replace('{amount}', formatOrderMoney(Math.abs(order.balanceDue)))
                          : t('admin.orders.detail.balanceRefund').replace('{amount}', formatOrderMoney(Math.abs(order.balanceDue)))}
                      {order.status !== 'cancelled' && order.correctionCount ? (
                        <span className="ms-1 font-normal text-gray-500">
                          {t('admin.orders.detail.afterCorrections')
                            .replace('{n}', String(order.correctionCount))
                            .replace('{plural}', order.correctionCount === 1 ? '' : 's')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {t('admin.orders.detail.lineItems').replace('{n}', String(order.itemCount))}
                    </h3>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 transition hover:border-catchy hover:text-catchy"
                        >
                          <Pencil size={12} />
                          {t('admin.common.edit')}
                        </button>
                      ) : null}
                      {canCorrect ? (
                        <button
                          type="button"
                          onClick={() => setCorrecting(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 transition hover:border-amber-400 hover:bg-amber-50"
                        >
                          <ShieldAlert size={12} />
                          {t('admin.orders.detail.correctSale')}
                        </button>
                      ) : null}
                      {canCancel ? (
                        <button
                          type="button"
                          onClick={() => setCancelling(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-700 transition hover:border-red-400 hover:bg-red-50"
                        >
                          <Ban size={12} />
                          {t('admin.orders.detail.cancelSale')}
                        </button>
                      ) : null}
                      {canCancelWeb ? (
                        <button
                          type="button"
                          onClick={() => setCancellingWeb(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-700 transition hover:border-red-400 hover:bg-red-50"
                        >
                          <Ban size={12} />
                          {t('admin.orders.detail.cancelOrder')}
                        </button>
                      ) : null}
                      {canReturn ? (
                        <button
                          type="button"
                          onClick={() => setReturning(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 transition hover:border-amber-400 hover:bg-amber-50"
                        >
                          <PackageOpen size={12} />
                          {t('admin.returns.processReturn')}
                        </button>
                      ) : null}
                      <InvoiceDownloadButton order={order} />
                    </div>
                  </div>
                  <OrderLineItemsList items={order.items} variant="table" linkProducts onItemClick={onClose} />
                </section>

                {role === 'admin' && hasReturns ? (
                  <section className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        {t('admin.returns.orderSection').replace('{n}', String(order.returnSummary?.returnCount ?? 0))}
                      </h3>
                      <Link to="/admin/returns" onClick={onClose} className="text-[11px] font-medium text-catchy hover:underline">
                        {t('admin.returns.openShelf')}
                      </Link>
                    </div>
                    <p className="mb-2 text-[11px] text-gray-500">{t('admin.returns.lockedNotice')}</p>
                    {orderReturns === null ? (
                      <p className="text-xs text-gray-400">{t('admin.common.loading')}</p>
                    ) : orderReturns.length === 0 ? (
                      <p className="text-xs text-gray-400">—</p>
                    ) : (
                      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {orderReturns.map((r) => (
                          <li key={r.id}>
                            <Link
                              to={`/admin/returns?return=${encodeURIComponent(r.id)}`}
                              onClick={onClose}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-gray-50"
                            >
                              <span className="min-w-0 truncate text-gray-900">
                                {r.productName} × {r.quantity}
                              </span>
                              <ReturnStatusBadge status={r.status} disposition={r.disposition} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}

                {role === 'admin' ? (
                  <div className="mt-4">
                    <OrderAdminNote order={order} onOrderPatch={onOrderPatch} />
                    <OrderCustomerHistory order={order} allOrders={allOrders} onSelectOrder={onSelectOrder} />
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>

          <AdminOrderEditModal
            open={editing}
            order={order}
            onClose={() => setEditing(false)}
            onOrderPatch={onOrderPatch}
          />
          <PosSaleCorrectionModal
            open={correcting}
            order={order}
            onClose={() => setCorrecting(false)}
            onOrderPatch={onOrderPatch}
          />
          <PosSaleCancelModal
            open={cancelling}
            order={order}
            onClose={() => setCancelling(false)}
            onOrderPatch={onOrderPatch}
          />
          <WebOrderCancelModal
            open={cancellingWeb}
            order={order}
            onClose={() => setCancellingWeb(false)}
            onOrderPatch={onOrderPatch}
          />
          <ProcessReturnModal
            open={returning}
            order={order}
            onClose={() => setReturning(false)}
            onOrderPatch={onOrderPatch}
            onReturnsCreated={(created) => setOrderReturns((prev) => [...created, ...(prev ?? [])])}
          />
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default AdminOrderDetailModal;
