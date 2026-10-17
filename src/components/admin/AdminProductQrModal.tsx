import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Download, Loader2, Minus, Plus, Printer, Usb, X } from 'lucide-react';
import { useQrCodeImage } from '../../hooks/useQrCodeImage';
import { productQrUrl } from '../../lib/qr/productQr';
import { buildTsplQrLabel } from '../../lib/qr/tsplLabel';
import { printTsplLabel } from '../../lib/qz/qzPrint';
import { useLanguage } from '../../context/LanguageContext';

export type AdminProductQrModalProps = {
  open: boolean;
  onClose: () => void;
  product: { id: string; name: string; price?: number } | null;
};

const AdminProductQrModal: React.FC<AdminProductQrModalProps> = ({ open, onClose, product }) => {
  const { t, isRTL } = useLanguage();
  const url = product ? productQrUrl(product.id) : null;
  const qr = useQrCodeImage(url, 360);
  const [printingToXprinter, setPrintingToXprinter] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Reset to 1 whenever a (possibly different) product's modal is opened, so a
  // quantity set for one product can't accidentally carry over to another.
  useEffect(() => {
    if (open) setQuantity(1);
  }, [open, product?.id]);

  if (typeof document === 'undefined') return null;

  const MAX_QUANTITY = 100;
  const clampQuantity = (n: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.floor(n) || 1));

  const handleDownload = () => {
    if (!qr || !product) return;
    const link = document.createElement('a');
    link.href = qr;
    link.download = `qr-${product.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrintToXprinter = async () => {
    if (!product || !url) return;
    setPrintingToXprinter(true);
    try {
      const tspl = await buildTsplQrLabel({
        url,
        name: product.name,
        price:
          product.price != null
            ? `ILS ${Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
            : '',
        quantity,
      });
      await printTsplLabel(tspl, t);
      toast.success(quantity > 1 ? t('admin.products.qr.labelsSent').replace('{n}', String(quantity)) : t('admin.products.qr.labelSent'));
    } catch (err: any) {
      toast.error(err?.message || t('admin.products.qr.printFailed'));
    } finally {
      setPrintingToXprinter(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && product ? (
        <div className="fixed inset-0 z-[400]" role="presentation">
          <style>{`
            /* Physical label size — must be in real units (mm), not px, so the
               browser's print pipeline emits an actual 40mm x 20mm page instead
               of scaling into whatever the default paper size happens to be. */
            @page {
              size: 40mm 20mm;
              margin: 0;
            }
            @media print {
              body * { visibility: hidden; }
              #admin-qr-print-area, #admin-qr-print-area * { visibility: visible; }
              #admin-qr-print-area {
                position: fixed;
                left: 0;
                top: 0;
                width: 40mm;
                height: 20mm;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.5mm;
                background: #fff;
                border: 0;
                border-radius: 0;
                box-shadow: none;
              }
              #admin-qr-print-area .admin-qr-print-img {
                width: 12mm;
                height: 12mm;
              }
              #admin-qr-print-area .admin-qr-print-name {
                font-size: 6.5pt;
                font-weight: 700;
                line-height: 1.1;
                margin: 0;
                color: #000;
                max-width: 38mm;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
              }
              #admin-qr-print-area .admin-qr-print-price {
                font-size: 5.5pt;
                line-height: 1.1;
                margin: 0;
                color: #444;
              }
            }
          `}</style>
          <motion.button
            type="button"
            aria-label={t('admin.common.close')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px] print:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 print:relative print:block print:p-0">
            <motion.div
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl print:w-auto print:max-w-none print:border-0 print:shadow-none"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 print:hidden">
                <h2 className="text-sm font-semibold text-gray-900">{t('admin.products.qr.title')}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-3 p-6 text-center" id="admin-qr-print-area">
                <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-gray-100 bg-white">
                  {qr ? (
                    <img
                      src={qr}
                      alt={t('admin.products.qr.altText').replace('{name}', product.name)}
                      className="admin-qr-print-img h-full w-full"
                    />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                  )}
                </div>
                <div>
                  <p className="admin-qr-print-name font-semibold text-gray-900">{product.name}</p>
                  {product.price != null ? (
                    <p className="admin-qr-print-price text-sm text-gray-500">
                      ILS {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </p>
                  ) : null}
                  <p className="mt-1 font-mono text-[10px] text-gray-400 print:hidden">{product.id}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-gray-100 p-4 print:hidden">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 transition hover:border-catchy hover:text-catchy"
                  >
                    <Printer size={14} /> {t('admin.products.qr.print')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!qr}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
                  >
                    <Download size={14} /> {t('admin.products.qr.downloadPng')}
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex h-9 shrink-0 items-center rounded-md border border-dashed border-gray-300">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                      disabled={printingToXprinter || quantity <= 1}
                      aria-label={t('admin.orders.table.decreaseQty')}
                      className="flex h-full w-7 items-center justify-center text-gray-500 transition hover:text-catchy disabled:opacity-30"
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(clampQuantity(Number(e.target.value.replace(/\D/g, ''))))}
                      disabled={printingToXprinter}
                      aria-label={t('admin.common.qty')}
                      className="h-full w-9 shrink-0 border-x border-gray-200 text-center text-xs font-semibold text-gray-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => clampQuantity(q + 1))}
                      disabled={printingToXprinter || quantity >= MAX_QUANTITY}
                      aria-label={t('admin.orders.table.increaseQty')}
                      className="flex h-full w-7 items-center justify-center text-gray-500 transition hover:text-catchy disabled:opacity-30"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handlePrintToXprinter}
                    disabled={printingToXprinter}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 text-xs font-semibold text-gray-600 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
                    title={t('admin.products.qr.printToXprinterTitle')}
                  >
                    {printingToXprinter ? <Loader2 size={14} className="animate-spin" /> : <Usb size={14} />}
                    {t('admin.products.qr.printToXprinter')}
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

export default AdminProductQrModal;
