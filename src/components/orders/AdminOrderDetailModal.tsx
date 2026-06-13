import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import OrderLineItemsList from './OrderLineItemsList';
import OrderStatusBadge from './OrderStatusBadge';
import {
  formatOrderDateTime,
  formatOrderMoney,
  shortOrderId,
  updateOrderCustomerDetails,
} from '../../lib/orders';
import { ORDER_STATUSES, type OrderRecord, type OrderStatus } from '../../types/order';
import { cn } from '../../lib/utils';

type AdminOrderDetailModalProps = {
  open: boolean;
  order: OrderRecord | null;
  onClose: () => void;
  onStatusChange: (orderId: string, status: OrderStatus) => void;
  onCustomerPatch: (orderId: string, patch: Partial<OrderRecord>) => void;
  savingStatus: boolean;
};

type CustomerDraft = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
};

type CustomerField = keyof CustomerDraft;

const INPUT_CLASS =
  'h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none transition focus:border-catchy focus:ring-1 focus:ring-catchy/20 disabled:cursor-not-allowed disabled:opacity-60';

function draftFromOrder(order: OrderRecord): CustomerDraft {
  return {
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    customerEmail: order.customerEmail ?? '',
    deliveryAddress: order.deliveryAddress ?? '',
  };
}

function orderValueForField(order: OrderRecord, field: CustomerField): string {
  return draftFromOrder(order)[field];
}

const AdminOrderDetailModal: React.FC<AdminOrderDetailModalProps> = ({
  open,
  order,
  onClose,
  onStatusChange,
  onCustomerPatch,
  savingStatus,
}) => {
  const [draft, setDraft] = useState<CustomerDraft>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    deliveryAddress: '',
  });
  const [savingField, setSavingField] = useState<CustomerField | null>(null);

  useEffect(() => {
    if (order) setDraft(draftFromOrder(order));
  }, [order?.id, order?.customerName, order?.customerPhone, order?.customerEmail, order?.deliveryAddress]);

  const isSaving = savingStatus || savingField !== null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSaving, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const saveCustomerField = async (field: CustomerField) => {
    if (!order || savingField) return;

    const nextValue = draft[field].trim();
    const prevValue = orderValueForField(order, field).trim();
    if (nextValue === prevValue) return;

    const patch: Partial<OrderRecord> = { [field]: nextValue || null };
    const previous = order[field];

    onCustomerPatch(order.id, patch);
    setSavingField(field);

    try {
      await updateOrderCustomerDetails(order.id, { [field]: nextValue || null });
      toast.success('Customer details updated');
    } catch (error) {
      onCustomerPatch(order.id, { [field]: previous });
      setDraft((prev) => ({ ...prev, [field]: orderValueForField(order, field) }));
      console.error('Failed to update customer details:', error);
      toast.error('Could not save customer details');
    } finally {
      setSavingField(null);
    }
  };

  const setField = (field: CustomerField, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const fieldSaving = (field: CustomerField) => savingField === field;

  if (typeof document === 'undefined') return null;

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
            disabled={isSaving}
            onClick={() => {
              if (!isSaving) onClose();
            }}
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
                    disabled={isSaving}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
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
                        <label htmlFor="order-customer-name" className="shrink-0 text-gray-500">
                          Name:
                        </label>
                        <div className="relative flex min-w-0 flex-1 items-center">
                          <input
                            id="order-customer-name"
                            type="text"
                            value={draft.customerName}
                            disabled={fieldSaving('customerName')}
                            onChange={(e) => setField('customerName', e.target.value)}
                            onBlur={() => saveCustomerField('customerName')}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className={INPUT_CLASS}
                          />
                          {fieldSaving('customerName') ? (
                            <Loader2 size={14} className="absolute end-2 animate-spin text-gray-400" />
                          ) : null}
                        </div>
                        {order.isGuest ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            Guest
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
                        <label htmlFor="order-customer-phone" className="shrink-0 text-gray-500">
                          Phone:
                        </label>
                        <div className="relative flex min-w-0 flex-1 items-center">
                          <input
                            id="order-customer-phone"
                            type="tel"
                            value={draft.customerPhone}
                            disabled={fieldSaving('customerPhone')}
                            onChange={(e) => setField('customerPhone', e.target.value)}
                            onBlur={() => saveCustomerField('customerPhone')}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className={INPUT_CLASS}
                          />
                          {fieldSaving('customerPhone') ? (
                            <Loader2 size={14} className="absolute end-2 animate-spin text-gray-400" />
                          ) : null}
                        </div>
                      </div>
                      <div className="flex min-w-[12rem] flex-[1.5] items-center gap-1.5">
                        <label htmlFor="order-customer-email" className="shrink-0 text-gray-500">
                          Email:
                        </label>
                        <div className="relative flex min-w-0 flex-1 items-center">
                          <input
                            id="order-customer-email"
                            type="email"
                            value={draft.customerEmail}
                            disabled={fieldSaving('customerEmail')}
                            onChange={(e) => setField('customerEmail', e.target.value)}
                            onBlur={() => saveCustomerField('customerEmail')}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className={INPUT_CLASS}
                          />
                          {fieldSaving('customerEmail') ? (
                            <Loader2 size={14} className="absolute end-2 animate-spin text-gray-400" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 border-t border-gray-200/80 pt-2">
                      <label htmlFor="order-customer-address" className="shrink-0 text-gray-500">
                        Address:
                      </label>
                      <div className="relative flex min-w-0 flex-1 items-center">
                        <input
                          id="order-customer-address"
                          type="text"
                          value={draft.deliveryAddress}
                          disabled={fieldSaving('deliveryAddress')}
                          onChange={(e) => setField('deliveryAddress', e.target.value)}
                          onBlur={() => saveCustomerField('deliveryAddress')}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className={INPUT_CLASS}
                        />
                        {fieldSaving('deliveryAddress') ? (
                          <Loader2 size={14} className="absolute end-2 animate-spin text-gray-400" />
                        ) : null}
                      </div>
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
                  <div className="relative">
                    <select
                      id="order-status-modal"
                      value={order.status}
                      disabled={isSaving}
                      onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
                      className={cn(
                        'h-10 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pe-10 text-sm font-medium text-gray-900 outline-none transition focus:border-catchy focus:ring-2 focus:ring-catchy/20',
                        isSaving && 'cursor-not-allowed opacity-60'
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
                    Line items ({order.itemCount})
                  </h3>
                  <OrderLineItemsList
                    items={order.items}
                    variant="table"
                    linkProducts
                    onItemClick={onClose}
                  />
                </section>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default AdminOrderDetailModal;
