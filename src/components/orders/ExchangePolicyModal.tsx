import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';

type ExchangePolicyModalProps = {
  open: boolean;
  onClose: () => void;
  onAccept: () => void | Promise<void>;
  isSubmitting: boolean;
};

const ExchangePolicyModal: React.FC<ExchangePolicyModalProps> = ({
  open,
  onClose,
  onAccept,
  isSubmitting,
}) => {
  const { t, isRTL } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isSubmitting, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[260]" role="presentation">
          <motion.button
            type="button"
            aria-label={t('cart.exchangePolicyCancel')}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            disabled={isSubmitting}
            onClick={() => {
              if (!isSubmitting) onClose();
            }}
          />

          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 sm:items-center">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="exchange-policy-title"
              dir={isRTL ? 'rtl' : 'ltr'}
              className={cn(
                'pointer-events-auto flex max-h-[min(90vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl',
                isRTL && 'font-arabic'
              )}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p
                    id="exchange-policy-title"
                    className={cn('text-base font-semibold text-catchy', isRTL ? 'font-arabic' : 'font-serif')}
                  >
                    {t('cart.exchangePolicyTitle')}
                  </p>
                  <p className={cn('mt-1 text-xs leading-relaxed text-gray-500', isRTL && 'font-arabic')}>
                    {t('cart.exchangePolicySubtitle')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                  aria-label={t('cart.exchangePolicyCancel')}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                <ul className={cn('space-y-3 text-sm leading-relaxed text-gray-600', isRTL && 'font-arabic')}>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden />
                    <span>{t('cart.exchangePolicyPoint1')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden />
                    <span>{t('cart.exchangePolicyPoint2')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden />
                    <span>{t('cart.exchangePolicyPoint3')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-catchy" aria-hidden />
                    <span>{t('cart.exchangePolicyPoint4')}</span>
                  </li>
                </ul>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={onAccept}
                    disabled={isSubmitting}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-2 rounded-xl bg-catchy py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-md shadow-catchy/20 transition hover:bg-catchy-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
                      isRTL && 'font-arabic'
                    )}
                  >
                    {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                    {isSubmitting ? t('cart.placingOrder') : t('cart.exchangePolicyAccept')}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-600 transition hover:border-gray-300 hover:text-gray-900 disabled:opacity-50',
                      isRTL && 'font-arabic'
                    )}
                  >
                    {t('cart.exchangePolicyCancel')}
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

export default ExchangePolicyModal;
