import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useBarcodeImage } from '../../hooks/useBarcodeImage';
import { formatOrderMoney } from '../../lib/orders';
import { productBarcodeValue } from '../../lib/barcode/productBarcode';

export type PosProductBarcodeModalProps = {
  onClose: () => void;
  product: { id: string; name: string; price: number; barcode?: string | null };
};

const PosProductBarcodeModal: React.FC<PosProductBarcodeModalProps> = ({ onClose, product }) => {
  const { t, isRTL, language } = useLanguage();
  const value = productBarcodeValue(product);
  const barcode = useBarcodeImage(value);

  if (typeof document === 'undefined') return null;

  const handleDownload = () => {
    if (!barcode) return;
    const link = document.createElement('a');
    link.href = barcode;
    link.download = `barcode-${product.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return createPortal(
    <AnimatePresence>
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={`fixed inset-0 z-[340] ${isRTL ? 'font-arabic' : ''}`}
        role="presentation"
      >
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #pos-barcode-print-area, #pos-barcode-print-area * { visibility: visible; }
            #pos-barcode-print-area { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; }
          }
        `}</style>
        <motion.button
          type="button"
          aria-label="Close"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm print:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 print:relative print:block print:p-0">
          <motion.div
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-neutral-900 shadow-2xl shadow-black/50 print:border-0 print:bg-white print:shadow-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div className="flex items-center justify-between border-b border-white/8 p-4 print:hidden">
              <h2 className="text-sm font-bold text-white">{t('pos.barcode.modalTitle')}</h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 p-6 text-center" id="pos-barcode-print-area">
              <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-white p-3">
                {barcode ? (
                  <img src={barcode} alt={product.name} className="h-full" />
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                )}
              </div>
              <div>
                <p className="font-semibold text-white print:text-black">{product.name}</p>
                <p className="text-sm text-catchy print:text-black" dir="ltr">
                  {formatOrderMoney(product.price)}
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-t border-white/8 p-4 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 text-xs font-semibold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy"
              >
                <Printer size={14} /> {t('pos.receipt.print')}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!barcode}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 text-xs font-semibold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy disabled:opacity-50"
              >
                <Download size={14} /> {t('pos.receipt.savePng')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default PosProductBarcodeModal;
