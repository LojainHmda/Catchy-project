import React, { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatOrderMoney, parseLineItemDisplay } from '../../lib/orders';
import { sanitizeDecimalInput } from '../../lib/utils';
import type { OrderLineItem } from '../../types/order';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { orderItemImageSrc, useOrderItemImages } from '../../hooks/useOrderItemImages';
import { useLanguage } from '../../context/LanguageContext';
import OrderProductPicker from './OrderProductPicker';

type PosCorrectionItemsTableProps = {
  items: OrderLineItem[];
  onItemsChange: (items: OrderLineItem[]) => void;
  disabled?: boolean;
};

/**
 * Same shape as OrderItemsDraftTable, but with an editable unit price — a
 * completed-sale correction specifically needs to fix a cashier's wrong price
 * (the admin's corrected figure is trusted here deliberately; it's what the
 * customer should actually have been charged, which the *current* live
 * product price has no bearing on). Kept as its own component rather than
 * extending OrderItemsDraftTable so the pending-order editor's behavior is
 * completely unaffected by this higher-trust, higher-stakes editing context.
 */
const PosCorrectionItemsTable: React.FC<PosCorrectionItemsTableProps> = ({
  items,
  onItemsChange,
  disabled = false,
}) => {
  const { t, isRTL } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolvedImages = useOrderItemImages(items);

  const addItem = (item: OrderLineItem) => {
    onItemsChange([...items, item]);
    setPickerOpen(false);
  };

  const changeQty = (index: number, nextQty: number) => {
    if (nextQty < 1) return;
    onItemsChange(items.map((it, i) => (i === index ? { ...it, quantity: nextQty } : it)));
  };

  const changePrice = (index: number, nextPrice: number) => {
    if (!Number.isFinite(nextPrice) || nextPrice < 0) return;
    onItemsChange(items.map((it, i) => (i === index ? { ...it, price: nextPrice } : it)));
  };

  const remove = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
        <table className="w-full min-w-[620px] text-start text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="pb-2 pe-3 text-start font-semibold w-[60px]">{t('admin.orders.table.image')}</th>
              <th className="pb-2 pe-3 text-start font-semibold">{t('admin.orders.table.product')}</th>
              <th className="pb-2 pe-3 text-start font-semibold w-24">{t('admin.orders.table.variant')}</th>
              <th className="pb-2 pe-3 text-center font-semibold w-28">{t('admin.orders.table.unitPrice')}</th>
              <th className="pb-2 pe-3 text-center font-semibold w-28">{t('admin.common.qty')}</th>
              <th className="pb-2 pe-3 text-end font-semibold w-24">{t('admin.common.total')}</th>
              <th className="pb-2 text-end font-semibold w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item, index) => {
              const { productName, color, size } = parseLineItemDisplay(item);
              const variantText = [color, size].filter(Boolean).join(' · ') || '—';
              return (
                <tr key={`${item.productId}-${index}`}>
                  <td className="py-2.5 pe-3 align-middle">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-black/5">
                      <img
                        src={orderItemImageSrc(item, resolvedImages) || PRODUCT_IMAGE_PLACEHOLDER}
                        alt={productName}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (el.src.includes('product-placeholder.svg')) return;
                          el.onerror = null;
                          el.src = PRODUCT_IMAGE_PLACEHOLDER;
                        }}
                      />
                    </div>
                  </td>
                  <td className="max-w-[12rem] py-2.5 pe-3 align-middle">
                    <p className="font-medium leading-snug text-gray-900">{productName}</p>
                  </td>
                  <td className="py-2.5 pe-3 align-middle text-sm text-gray-700">{variantText}</td>
                  <td className="py-2.5 pe-3 align-middle">
                    <input
                      type="text"
                      inputMode="decimal"
                      lang="en"
                      dir="ltr"
                      value={item.price}
                      disabled={disabled}
                      onChange={(e) => changePrice(index, Number(sanitizeDecimalInput(e.target.value)))}
                      className="h-8 w-full rounded-md border border-gray-200 px-2 text-end text-sm tabular-nums text-gray-900 outline-none transition focus:border-catchy focus:ring-1 focus:ring-catchy/20 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={t('admin.orders.table.unitPriceFor').replace('{name}', productName)}
                    />
                  </td>
                  <td className="py-2.5 pe-3 align-middle">
                    <div className="mx-auto flex w-fit items-center gap-1 rounded-md border border-gray-200">
                      <button
                        type="button"
                        onClick={() => changeQty(index, item.quantity - 1)}
                        disabled={disabled || item.quantity <= 1}
                        className="inline-flex h-7 w-7 items-center justify-center text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                        aria-label={t('admin.orders.table.decreaseQty')}
                      >
                        <Minus size={13} />
                      </button>
                      <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQty(index, item.quantity + 1)}
                        disabled={disabled}
                        className="inline-flex h-7 w-7 items-center justify-center text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                        aria-label={t('admin.orders.table.increaseQty')}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 pe-3 text-end align-middle font-semibold tabular-nums text-gray-900">
                    {formatOrderMoney(item.price * item.quantity)}
                  </td>
                  <td className="py-2.5 text-end align-middle">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={disabled}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      aria-label={t('admin.orders.table.removeItem')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-sm text-gray-500">
                  {t('admin.orders.table.emptyItems')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        {pickerOpen ? (
          <OrderProductPicker onAdd={addItem} onClose={() => setPickerOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 text-xs font-semibold text-gray-700 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
          >
            <Plus size={14} />
            {t('admin.orders.table.addProduct')}
          </button>
        )}
      </div>
    </div>
  );
};

export default PosCorrectionItemsTable;
