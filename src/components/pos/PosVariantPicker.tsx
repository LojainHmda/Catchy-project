import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Barcode, Minus, Plus, QrCode, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import { cloudinaryTransform } from '../../lib/cloudinaryTransform';
import { hasSizedInventory, sortedSizeStockEntries, totalFromSizeStock } from '../../lib/productInventory';
import { posVariantScope, type PosProduct } from '../../lib/pos/posProduct';
import type { PosCartItem } from '../../types/pos';
import { cn } from '../../lib/utils';
import PosProductQrModal from './PosProductQrModal';
import PosProductBarcodeModal from './PosProductBarcodeModal';

type PosVariantPickerProps = {
  product: PosProduct;
  initialColorId?: string | null;
  onAdd: (item: Omit<PosCartItem, 'lineKey'>) => void;
  onClose: () => void;
};

const PosVariantPicker: React.FC<PosVariantPickerProps> = ({ product, initialColorId = null, onAdd, onClose }) => {
  const { t, isRTL, language } = useLanguage();
  const [colorId, setColorId] = useState<string | null>(initialColorId);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [qrOpen, setQrOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);

  useEffect(() => {
    const scope = posVariantScope(product, initialColorId);
    setColorId(scope.colorId);
    const firstSize = hasSizedInventory(scope.sizeStock)
      ? sortedSizeStockEntries(scope.sizeStock, { includeZero: false })[0]?.[0] ?? null
      : null;
    setSize(firstSize);
    setQuantity(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const scope = posVariantScope(product, colorId);
  const sizeEntries = sortedSizeStockEntries(scope.sizeStock, { includeZero: false });
  const sized = hasSizedInventory(scope.sizeStock);
  const available = sized ? Math.max(0, scope.sizeStock[size ?? ''] ?? 0) : scope.stock;
  const canAdd = (!sized || !!size) && available >= quantity && quantity >= 1;

  const pickColor = (id: string) => {
    setColorId(id);
    const next = posVariantScope(product, id);
    const firstSize = hasSizedInventory(next.sizeStock)
      ? sortedSizeStockEntries(next.sizeStock, { includeZero: false })[0]?.[0] ?? null
      : null;
    setSize(firstSize);
    setQuantity(1);
  };

  const confirm = () => {
    if (!canAdd) return;
    onAdd({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      image: scope.image ?? '',
      size,
      colorId: scope.colorId,
      colorName: scope.colorName,
      availableStock: available,
    });
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={cn('fixed inset-0 z-[300]', isRTL && 'font-arabic')}
        role="presentation"
      >
        <motion.button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-900 shadow-2xl shadow-black/50 sm:rounded-3xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/8 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-800 sm:h-40 sm:w-40">
                  <img
                    src={cloudinaryTransform(scope.image || PRODUCT_IMAGE_PLACEHOLDER, { width: 160, height: 160 })}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{product.name}</p>
                  <p className="text-sm font-medium tabular-nums text-catchy" dir="ltr">
                    {formatOrderMoney(product.price)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQrOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white"
                  aria-label={t('pos.qr.modalTitle')}
                  title={t('pos.qr.modalTitle')}
                >
                  <QrCode size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white"
                  aria-label={t('pos.barcode.modalTitle')}
                  title={t('pos.barcode.modalTitle')}
                >
                  <Barcode size={18} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {product.colorVariants.length > 0 ? (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {t('pos.variant.color')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.colorVariants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => pickColor(v.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-95',
                          colorId === v.id
                            ? 'border-catchy/50 bg-catchy/10 text-catchy'
                            : 'border-white/10 text-neutral-300 hover:border-white/20'
                        )}
                      >
                        <span
                          className="inline-block h-4 w-4 rounded-full ring-1 ring-white/20"
                          style={{ backgroundColor: v.hex || '#d1d5db' }}
                        />
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {sized ? (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {t('pos.variant.size')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sizeEntries.map(([s, qty]) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSize(s);
                          setQuantity(1);
                        }}
                        className={cn(
                          'inline-flex min-w-[3rem] flex-col items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-95',
                          size === s
                            ? 'border-catchy/50 bg-catchy/10 text-catchy'
                            : 'border-white/10 text-neutral-300 hover:border-white/20'
                        )}
                      >
                        {s}
                        <span className="text-[10px] font-normal text-neutral-500">
                          {t('pos.variant.left').replace('{n}', String(qty))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mb-4 text-xs text-neutral-500">
                  {t('pos.stock.inStock').replace('{n}', String(available))}
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {t('pos.variant.quantity')}
                </p>
                <div className="flex w-fit items-center gap-1 rounded-xl border border-white/10 bg-neutral-800/60">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="inline-flex h-11 w-11 items-center justify-center text-neutral-300 transition active:scale-90 disabled:opacity-30"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="min-w-[2.5rem] text-center text-base font-semibold tabular-nums text-white">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(available, q + 1))}
                    disabled={quantity >= available}
                    className="inline-flex h-11 w-11 items-center justify-center text-neutral-300 transition active:scale-90 disabled:opacity-30"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-white/8 p-4">
              <button
                type="button"
                onClick={confirm}
                disabled={!canAdd}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-neutral-700 disabled:to-neutral-700 disabled:opacity-50 disabled:shadow-none"
              >
                {t('pos.variant.addToCart').replace('{amount}', formatOrderMoney(product.price * quantity))}
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {qrOpen ? (
        <PosProductQrModal
          product={{ id: product.id, name: product.name, price: product.price }}
          onClose={() => setQrOpen(false)}
        />
      ) : null}

      {barcodeOpen ? (
        <PosProductBarcodeModal
          product={{ id: product.id, name: product.name, price: product.price, barcode: product.barcode }}
          onClose={() => setBarcodeOpen(false)}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default PosVariantPicker;
