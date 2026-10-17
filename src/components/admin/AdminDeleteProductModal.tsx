import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export type AdminDeleteProductModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  productName: string;
};

/**
 * Second-confirmation dialog for permanently deleting a product. Deliberately
 * separate from the browser's native window.confirm() (still used by the
 * Admin Products dashboard's own delete button) so the exact wording and a
 * clearly-labeled destructive action are consistent everywhere this is
 * reachable from a customer-facing page (Catalog, Product Detail).
 */
const AdminDeleteProductModal: React.FC<AdminDeleteProductModalProps> = ({
  open,
  onClose,
  onConfirm,
  productName,
}) => {
  const { t, isRTL } = useLanguage();
  const [deleting, setDeleting] = useState(false);

  if (typeof document === 'undefined') return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[400]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('admin.common.close')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !deleting && onClose()}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-product-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <h2 id="delete-product-title" className="text-sm font-semibold text-gray-900">
                  {t('admin.products.deleteModal.title')}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={deleting}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle size={22} />
                </div>
                <p className="text-sm text-gray-700">
                  {t('admin.products.deleteModal.confirm')}
                </p>
                <p className="max-w-full truncate text-sm font-semibold text-gray-900" dir="auto" title={productName}>
                  {productName}
                </p>
                <p className="text-xs text-gray-400">{t('admin.products.deleteModal.cannotUndo')}</p>
              </div>

              <div className="flex gap-2 border-t border-gray-100 p-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={deleting}
                  className="flex h-10 flex-1 items-center justify-center rounded-md border border-gray-200 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('admin.common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={deleting}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  {t('admin.products.deleteModal.confirmButton')}
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

export default AdminDeleteProductModal;
