import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, X } from 'lucide-react';
import OrderLineItemsList from './OrderLineItemsList';
import OrderStatusBadge from './OrderStatusBadge';
import InvoiceDownloadButton from './InvoiceDownloadButton';
import AdminOrderEditModal from './AdminOrderEditModal';
import { formatOrderDateTime, formatOrderMoney, shortOrderId } from '../../lib/orders';
import type { OrderRecord, OrderStatus } from '../../types/order';

/** Statuses where the admin may still edit the order (items, customer, status). */
const ORDER_EDITABLE_STATUSES: OrderStatus[] = ['pending', 'processing', 'shipped'];

type AdminOrderDetailModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  /** Merge persisted changes back into the parent's order state. */
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
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
  onClose,
  onOrderPatch,
}) => {
  const [editing, setEditing] = useState(false);

  // Close the editor whenever the detail modal closes or a different order loads.
  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);
  useEffect(() => {
    setEditing(false);
  }, [order?.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // While the editor is open it owns Escape — don't close the detail behind it.
      if (e.key === 'Escape' && !editing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, editing, onClose]);

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

  return createPortal(
    <AnimatePresence>
      {open && order ? (
        <div className="fixed inset-0 z-[260]" role="presentation">
          <motion.button
            type="button"
            aria-label="Close order details"
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
              dir="ltr"
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
                  <p className="mt-0.5 text-sm text-gray-500">{formatOrderDateTime(order.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-lg font-bold tabular-nums text-gray-900">{formatOrderMoney(order.total)}</p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close order details"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </h3>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <ReadonlyField label="Name" value={order.customerName} />
                        {order.isGuest ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            Guest
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-[10rem] flex-1">
                        <ReadonlyField label="Phone" value={order.customerPhone} />
                      </div>
                      <div className="min-w-[12rem] flex-[1.5]">
                        <ReadonlyField label="Email" value={order.customerEmail} />
                      </div>
                    </div>
                    <div className="mt-2 border-t border-gray-200/80 pt-2">
                      <ReadonlyField label="Address" value={order.deliveryAddress} />
                    </div>
                  </div>
                </section>

                <section className="mb-4">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Order status
                    </h3>
                    <OrderStatusBadge status={order.status} className="px-2.5 py-0.5 text-[10px]" />
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium capitalize text-gray-900">
                    {order.status}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Line items ({order.itemCount})
                    </h3>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-700 transition hover:border-catchy hover:text-catchy"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                      ) : null}
                      <InvoiceDownloadButton order={order} />
                    </div>
                  </div>
                  <OrderLineItemsList items={order.items} variant="table" linkProducts onItemClick={onClose} />
                </section>
              </div>
            </motion.div>
          </div>

          <AdminOrderEditModal
            open={editing}
            order={order}
            onClose={() => setEditing(false)}
            onOrderPatch={onOrderPatch}
          />
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default AdminOrderDetailModal;
