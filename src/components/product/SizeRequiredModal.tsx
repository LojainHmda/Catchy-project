import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Ruler, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';

type SizeRequiredModalProps = {
  open: boolean;
  onClose: () => void;
};

const SizeRequiredModal: React.FC<SizeRequiredModalProps> = ({ open, onClose }) => {
  const { t, isRTL } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[240]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('product.sizeRequiredOk')}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="size-required-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className={cn(
                'pointer-events-auto w-full max-w-xs overflow-hidden rounded-2xl bg-white p-5 shadow-2xl',
                isRTL && 'font-arabic'
              )}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-catchy/10 text-catchy">
                  <Ruler size={20} />
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label={t('product.sizeRequiredOk')}
                >
                  <X size={18} />
                </button>
              </div>

              <h2 id="size-required-title" className={cn('text-base font-bold text-gray-900', isRTL ? 'font-arabic' : 'font-serif')}>
                {t('product.sizeRequiredTitle')}
              </h2>
              <p className={cn('mt-2 text-sm leading-relaxed text-gray-500', isRTL && 'font-arabic')}>
                {t('product.sizeRequiredDesc')}
              </p>

              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'mt-5 flex w-full items-center justify-center rounded-xl bg-catchy py-3 text-sm font-bold text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark',
                  isRTL && 'font-arabic'
                )}
              >
                {t('product.sizeRequiredOk')}
              </button>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default SizeRequiredModal;
