import React, { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatOrderMoney, parseLineItemDisplay } from '../../lib/orders';
import type { OrderLineItem } from '../../types/order';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { orderItemImageSrc, useOrderItemImages } from '../../hooks/useOrderItemImages';
import OrderProductPicker from './OrderProductPicker';

type OrderItemsDraftTableProps = {
  items: OrderLineItem[];
  /** Controlled: every qty change, add, or remove emits the next items array. */
  onItemsChange: (items: OrderLineItem[]) => void;
  disabled?: boolean;
};

/**
 * Presentational line-items editor: the table (image / product / variant / qty
 * steppers / total / remove) plus the Add-product picker. It owns no save logic —
 * the parent holds the draft and decides when to persist.
 */
const OrderItemsDraftTable: React.FC<OrderItemsDraftTableProps> = ({
  items,
  onItemsChange,
  disabled = false,
}) => {
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

  const remove = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="overflow-x-auto" dir="ltr">
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <th className="pb-2 pe-3 text-start font-semibold w-[60px]">Image</th>
              <th className="pb-2 pe-3 text-start font-semibold">Product</th>
              <th className="pb-2 pe-3 text-start font-semibold w-28">Variant</th>
              <th className="pb-2 pe-3 text-center font-semibold w-28">Qty</th>
              <th className="pb-2 pe-3 text-end font-semibold w-24">Total</th>
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
                    <p className="mt-0.5 text-xs tabular-nums text-gray-500">{formatOrderMoney(item.price)}</p>
                  </td>
                  <td className="py-2.5 pe-3 align-middle text-sm text-gray-700">{variantText}</td>
                  <td className="py-2.5 pe-3 align-middle">
                    <div className="mx-auto flex w-fit items-center gap-1 rounded-md border border-gray-200">
                      <button
                        type="button"
                        onClick={() => changeQty(index, item.quantity - 1)}
                        disabled={disabled || item.quantity <= 1}
                        className="inline-flex h-7 w-7 items-center justify-center text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
                        aria-label="Decrease quantity"
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
                        aria-label="Increase quantity"
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
                      aria-label="Remove item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-sm text-gray-500">
                  No items in this order.
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
            Add product
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderItemsDraftTable;
