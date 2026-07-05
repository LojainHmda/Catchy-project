import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import OrderItemsDraftTable from './OrderItemsDraftTable';
import {
  formatOrderMoney,
  isOrderError,
  saveOrderItems,
  shortOrderId,
  updateOrderCustomerDetails,
  updateOrderStatus,
} from '../../lib/orders';
import { ORDER_STATUSES, type OrderLineItem, type OrderRecord, type OrderStatus } from '../../types/order';
import { cn } from '../../lib/utils';

type AdminOrderEditModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  /** Merge persisted changes back into the parent's order state. */
  onOrderPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
};

type EditDraft = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  status: OrderStatus;
  items: OrderLineItem[];
};

const INPUT_CLASS =
  'h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none transition focus:border-catchy focus:ring-1 focus:ring-catchy/20 disabled:cursor-not-allowed disabled:opacity-60';

function draftFromOrder(order: OrderRecord): EditDraft {
  return {
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    customerEmail: order.customerEmail ?? '',
    deliveryAddress: order.deliveryAddress ?? '',
    status: order.status,
    items: order.items,
  };
}

/** Compare only the fields that affect a save, so order matters and qty changes register. */
function itemsSignature(items: OrderLineItem[]): string {
  return JSON.stringify(
    items.map((i) => [i.productId, i.colorId ?? '', i.size ?? '', i.quantity, i.price, i.name])
  );
}

const AdminOrderEditModal: React.FC<AdminOrderEditModalProps> = ({ open, order, onClose, onOrderPatch }) => {
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the draft only when the modal opens or a different order is loaded — not on
  // every order-field change, so the incremental patches we apply mid-save don't wipe
  // the user's still-unsaved edits.
  useEffect(() => {
    if (open && order) {
      setDraft(draftFromOrder(order));
      setSaving(false);
    }
  }, [open, order?.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const customerDirty = useMemo(() => {
    if (!order || !draft) return false;
    return (
      draft.customerName.trim() !== (order.customerName ?? '').trim() ||
      draft.customerPhone.trim() !== (order.customerPhone ?? '').trim() ||
      draft.customerEmail.trim() !== (order.customerEmail ?? '').trim() ||
      draft.deliveryAddress.trim() !== (order.deliveryAddress ?? '').trim()
    );
  }, [order, draft]);

  const statusDirty = !!order && !!draft && draft.status !== order.status;
  const itemsDirty = useMemo(
    () => !!order && !!draft && itemsSignature(draft.items) !== itemsSignature(order.items),
    [order, draft]
  );
  const dirty = customerDirty || statusDirty || itemsDirty;

  const draftTotal = useMemo(() => {
    if (!order || !draft) return 0;
    const subtotal = draft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return subtotal + order.shippingCost;
  }, [order, draft]);

  const setField = <K extends keyof EditDraft>(field: K, value: EditDraft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const save = async () => {
    if (saving || !order || !draft || !dirty) return;
    setSaving(true);
    try {
      // Items first: saveOrderItems validates stock and may throw before any write.
      if (itemsDirty) {
        const result = await saveOrderItems(order, draft.items);
        onOrderPatch(order.id, {
          items: result.items,
          subtotal: result.subtotal,
          total: result.total,
          itemCount: result.itemCount,
        });
      }
      if (customerDirty) {
        const details = {
          customerName: draft.customerName.trim() || null,
          customerPhone: draft.customerPhone.trim() || null,
          customerEmail: draft.customerEmail.trim() || null,
          deliveryAddress: draft.deliveryAddress.trim() || null,
        };
        await updateOrderCustomerDetails(order.id, details);
        onOrderPatch(order.id, details);
      }
      if (statusDirty) {
        await updateOrderStatus(order.id, draft.status);
        onOrderPatch(order.id, { status: draft.status });
      }
      toast.success('Order updated');
      onClose();
    } catch (error) {
      const msg = isOrderError(error) ? error.message : 'Could not save the order.';
      console.error('Order save failed:', error);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && order && draft ? (
        <div className="fixed inset-0 z-[270]" role="presentation">
          <motion.button
            type="button"
            aria-label="Close editor"
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
          />

          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-order-edit-title"
              dir="ltr"
              className="pointer-events-auto flex max-h-[min(92vh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-start shadow-2xl"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p id="admin-order-edit-title" className="text-lg font-semibold text-gray-900">
                    Edit order
                  </p>
                  <p className="mt-0.5 font-mono text-sm text-gray-500">{shortOrderId(order.id)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!saving) onClose();
                  }}
                  disabled={saving}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label="Close editor"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
                <section className="mb-4">
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </h3>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <label htmlFor="edit-customer-name" className="shrink-0 text-gray-500">
                          Name:
                        </label>
                        <input
                          id="edit-customer-name"
                          type="text"
                          value={draft.customerName}
                          disabled={saving}
                          onChange={(e) => setField('customerName', e.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <label htmlFor="edit-customer-phone" className="shrink-0 text-gray-500">
                          Phone:
                        </label>
                        <input
                          id="edit-customer-phone"
                          type="tel"
                          value={draft.customerPhone}
                          disabled={saving}
                          onChange={(e) => setField('customerPhone', e.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="flex min-w-[12rem] flex-[1.5] items-center gap-1.5">
                        <label htmlFor="edit-customer-email" className="shrink-0 text-gray-500">
                          Email:
                        </label>
                        <input
                          id="edit-customer-email"
                          type="email"
                          value={draft.customerEmail}
                          disabled={saving}
                          onChange={(e) => setField('customerEmail', e.target.value)}
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 border-t border-gray-200/80 pt-2">
                      <label htmlFor="edit-customer-address" className="shrink-0 text-gray-500">
                        Address:
                      </label>
                      <input
                        id="edit-customer-address"
                        type="text"
                        value={draft.deliveryAddress}
                        disabled={saving}
                        onChange={(e) => setField('deliveryAddress', e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>
                </section>

                <section className="mb-4">
                  <h3 className="mb-1.5 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Order status
                  </h3>
                  <div className="relative">
                    <select
                      id="edit-order-status"
                      value={draft.status}
                      disabled={saving}
                      onChange={(e) => setField('status', e.target.value as OrderStatus)}
                      className={cn(
                        'h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pe-10 text-sm font-medium text-gray-900 outline-none transition focus:border-catchy focus:ring-2 focus:ring-catchy/20',
                        saving && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={18}
                      className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-start text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Line items ({draft.items.length})
                  </h3>
                  <OrderItemsDraftTable
                    items={draft.items}
                    onItemsChange={(items) => setField('items', items)}
                    disabled={saving}
                  />
                </section>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 sm:px-6">
                <p className="text-sm text-gray-600">
                  Total:{' '}
                  <span className="font-semibold tabular-nums text-gray-900">{formatOrderMoney(draftTotal)}</span>
                  {dirty ? <span className="ml-1 text-xs text-gray-400">(unsaved)</span> : null}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!saving) onClose();
                    }}
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-4 text-xs font-semibold text-white transition hover:bg-catchy-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                    Save changes
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

export default AdminOrderEditModal;
