import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Percent, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { resolveDiscountAmount, type PosDiscountDraft } from '../../lib/pos/posPricing';
import type { PosCartItem } from '../../types/pos';
import { cn } from '../../lib/utils';

type PosCartPanelProps = {
  items: PosCartItem[];
  subtotal: number;
  discount: PosDiscountDraft;
  onDiscountChange: (draft: PosDiscountDraft) => void;
  onChangeQty: (lineKey: string, nextQty: number) => void;
  onRemoveItem: (lineKey: string) => void;
  onClear: () => void;
  onCharge: () => void;
  /** Present only on the mobile/tablet-portrait full-screen cart sheet — renders a close (X) button. */
  onCloseMobile?: () => void;
};

const PosCartPanel: React.FC<PosCartPanelProps> = ({
  items,
  subtotal,
  discount,
  onDiscountChange,
  onChangeQty,
  onRemoveItem,
  onClear,
  onCharge,
  onCloseMobile,
}) => {
  const { t, isRTL } = useLanguage();
  const [discountOpen, setDiscountOpen] = useState(false);
  const discountAmount = resolveDiscountAmount(discount, subtotal);
  const total = Math.max(0, subtotal - discountAmount);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="flex h-full min-h-0 flex-col border-r border-white/8 bg-neutral-900">
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} className="text-neutral-400" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-200">
            {t('pos.cart.title')} <span className="text-catchy">· {itemCount}</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-neutral-500 transition hover:text-rose-400"
            >
              {t('pos.cart.clear')}
            </button>
          ) : null}
          {onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-700">
            <ShoppingBag className="h-10 w-10" />
            <p className="text-sm text-neutral-600">{t('pos.cart.empty')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.li
                  key={item.lineKey}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-neutral-800/50 p-2"
                >
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                    <img
                      src={item.image || PRODUCT_IMAGE_PLACEHOLDER}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-100">{item.name}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {[item.colorName, item.size].filter(Boolean).join(' · ') || formatOrderMoney(item.price)}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.lineKey, item.quantity - 1)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition active:scale-90 active:bg-neutral-700 lg:h-7 lg:w-7"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums text-neutral-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onChangeQty(item.lineKey, item.quantity + 1)}
                        disabled={item.quantity >= item.availableStock}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition active:scale-90 active:bg-neutral-700 disabled:opacity-30 lg:h-7 lg:w-7"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-sm font-semibold tabular-nums text-neutral-100">
                      {formatOrderMoney(item.price * item.quantity)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.lineKey)}
                      className="text-neutral-600 transition hover:text-rose-400"
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-white/8 p-4">
        <div className="mb-3">
          {discountOpen ? (
            <div className="rounded-xl border border-white/10 bg-neutral-800/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {t('pos.discount.title')}
                </p>
                <button
                  type="button"
                  onClick={() => onDiscountChange({ ...discount, enabled: false })}
                  className="text-xs font-medium text-neutral-500 transition hover:text-rose-400"
                >
                  {t('pos.discount.remove')}
                </button>
              </div>
              <div className="mb-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => onDiscountChange({ ...discount, enabled: true, mode: 'percent' })}
                  className={cn(
                    'inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-medium transition',
                    discount.mode === 'percent'
                      ? 'bg-catchy/15 text-catchy ring-1 ring-catchy/30'
                      : 'text-neutral-500 hover:text-neutral-300'
                  )}
                >
                  <Percent size={12} /> {t('pos.discount.percentMode')}
                </button>
                <button
                  type="button"
                  onClick={() => onDiscountChange({ ...discount, enabled: true, mode: 'amount' })}
                  className={cn(
                    'inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-medium transition',
                    discount.mode === 'amount'
                      ? 'bg-catchy/15 text-catchy ring-1 ring-catchy/30'
                      : 'text-neutral-500 hover:text-neutral-300'
                  )}
                >
                  {t('pos.discount.amountMode')}
                </button>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={discount.value}
                onChange={(e) => onDiscountChange({ ...discount, enabled: true, value: e.target.value })}
                placeholder={
                  discount.mode === 'percent' ? t('pos.discount.percentPlaceholder') : t('pos.discount.amountPlaceholder')
                }
                className="mb-2 h-10 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-catchy/50 focus:ring-1 focus:ring-catchy/20"
              />
              <input
                type="text"
                value={discount.reason}
                onChange={(e) => onDiscountChange({ ...discount, reason: e.target.value })}
                placeholder={t('pos.discount.reasonPlaceholder')}
                className="h-10 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-catchy/50 focus:ring-1 focus:ring-catchy/20"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDiscountOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 text-xs font-semibold text-neutral-400 transition hover:border-catchy/50 hover:text-catchy"
            >
              <Tag size={14} /> {discount.enabled ? t('pos.discount.edit') : t('pos.discount.add')}
            </button>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between text-neutral-400">
            <span>{t('pos.cart.subtotal')}</span>
            <span className="tabular-nums">{formatOrderMoney(subtotal)}</span>
          </div>
          {discountAmount > 0 ? (
            <div className="flex items-center justify-between text-catchy">
              <span>{t('pos.discount.title')}</span>
              <span className="tabular-nums">-{formatOrderMoney(discountAmount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between pt-1 text-lg font-bold text-white">
            <span>{t('pos.cart.total')}</span>
            <span className="tabular-nums">{formatOrderMoney(total)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onCharge}
          disabled={items.length === 0}
          className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-neutral-700 disabled:to-neutral-700 disabled:opacity-50 disabled:shadow-none"
        >
          {t('pos.cart.charge').replace('{amount}', formatOrderMoney(total))}
        </button>
      </div>
    </div>
  );
};

export default PosCartPanel;
