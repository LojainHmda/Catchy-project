import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { useBarcodeImage } from '../../hooks/useBarcodeImage';
import { productBarcodeValue } from '../../lib/barcode/productBarcode';
import { useLanguage } from '../../context/LanguageContext';

export type AdminProductBarcodeModalProps = {
  open: boolean;
  onClose: () => void;
  product: { id: string; name: string; price?: number; barcode?: string | null } | null;
};

const AdminProductBarcodeModal: React.FC<AdminProductBarcodeModalProps> = ({ open, onClose, product }) => {
  const { t } = useLanguage();
  const value = product ? productBarcodeValue(product) : null;
  const barcode = useBarcodeImage(value);

  if (typeof document === 'undefined') return null;

  const handleDownload = () => {
    if (!barcode || !product) return;
    const link = document.createElement('a');
    link.href = barcode;
    link.download = `barcode-${product.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return createPortal(
    <AnimatePresence>
      {open && product ? (
        <div className="fixed inset-0 z-[400]" role="presentation">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #admin-barcode-print-area, #admin-barcode-print-area * { visibility: visible; }
              #admin-barcode-print-area { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
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
                <h2 className="text-sm font-semibold text-gray-900">{t('admin.products.barcode.title')}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-3 p-6 text-center" id="admin-barcode-print-area">
                <div className="flex h-28 w-full items-center justify-center rounded-xl border border-gray-100 bg-white px-3">
                  {barcode ? (
                    <img src={barcode} alt={t('admin.products.barcode.altText').replace('{name}', product.name)} className="h-full" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{product.name}</p>
                  {product.price != null ? (
                    <p className="text-sm text-gray-500">
                      ILS {Number(product.price).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-2 border-t border-gray-100 p-4 print:hidden">
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
                  disabled={!barcode}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
                >
                  <Download size={14} /> {t('admin.products.qr.downloadPng')}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default AdminProductBarcodeModal;
