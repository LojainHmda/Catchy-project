import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Banknote, CreditCard, Layers, Loader2, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderMoney } from '../../lib/orders';
import type { PosPayment, PosPaymentMethod } from '../../types/pos';
import { cn } from '../../lib/utils';

type PosPaymentModalProps = {
  total: number;
  submitting: boolean;
  error: string | null;
  onConfirm: (payment: PosPayment) => void;
  onClose: () => void;
};

type Tone = { border: string; fillFrom: string; fillTo: string; text: string; glow: string; tint: string };

/** Each payment method gets its own accent color so the cashier can recognize the mode at a glance. */
const TONES: Record<PosPaymentMethod, Tone> = {
  cash: {
    border: 'border-catchy/40',
    fillFrom: 'from-catchy',
    fillTo: 'to-catchy-dark',
    text: 'text-catchy',
    glow: 'shadow-catchy/30',
    tint: 'bg-catchy/[0.08]',
  },
  card: {
    border: 'border-sky-500/40',
    fillFrom: 'from-sky-400',
    fillTo: 'to-sky-600',
    text: 'text-sky-400',
    glow: 'shadow-sky-500/30',
    tint: 'bg-sky-500/[0.08]',
  },
  split: {
    border: 'border-violet-500/40',
    fillFrom: 'from-violet-400',
    fillTo: 'to-violet-600',
    text: 'text-violet-400',
    glow: 'shadow-violet-500/30',
    tint: 'bg-violet-500/[0.08]',
  },
};

const ICONS: Record<PosPaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, split: Layers };
const METHOD_IDS: PosPaymentMethod[] = ['cash', 'card', 'split'];

const PosPaymentModal: React.FC<PosPaymentModalProps> = ({ total, submitting, error, onConfirm, onClose }) => {
  const { t, isRTL, language } = useLanguage();
  const [method, setMethod] = useState<PosPaymentMethod>('cash');
  const [cashInput, setCashInput] = useState(total.toFixed(2));
  const [cardInput, setCardInput] = useState('0.00');

  const methodLabels: Record<PosPaymentMethod, string> = {
    cash: t('pos.payment.cash'),
    card: t('pos.payment.card'),
    split: t('pos.payment.split'),
  };

  const activeTone = TONES[method];
  const roundedTotal = Math.round(total * 100) / 100;
  const cashAmount = Math.max(0, parseFloat(cashInput) || 0);
  const cardAmount =
    method === 'card' ? roundedTotal : Math.max(0, Math.min(roundedTotal, parseFloat(cardInput) || 0));
  const cashOwed = method === 'split' ? Math.max(0, Math.round((roundedTotal - cardAmount) * 100) / 100) : roundedTotal;
  const changeGiven = useMemo(() => {
    if (method === 'card') return 0;
    return Math.round((cashAmount - cashOwed) * 100) / 100;
  }, [method, cashAmount, cashOwed]);

  const canConfirm = method === 'card' ? true : cashAmount >= cashOwed - 0.005;

  const confirm = () => {
    if (!canConfirm || submitting) return;
    if (method === 'card') {
      onConfirm({ method, cashAmount: 0, cardAmount: roundedTotal, changeGiven: 0 });
    } else if (method === 'cash') {
      onConfirm({ method, cashAmount, cardAmount: 0, changeGiven: Math.max(0, changeGiven) });
    } else {
      onConfirm({ method, cashAmount, cardAmount, changeGiven: Math.max(0, changeGiven) });
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={cn('fixed inset-0 z-[320]', isRTL && 'font-arabic')}
        role="presentation"
      >
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            role="dialog"
            aria-modal="true"
            className="pointer-events-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-900 shadow-2xl shadow-black/50 sm:rounded-3xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div className="flex items-center justify-between border-b border-white/8 p-4">
              <h2 className="text-base font-bold text-white">{t('pos.payment.title')}</h2>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4">
              <p className="text-center text-3xl font-black tabular-nums text-white" dir="ltr">
                {formatOrderMoney(roundedTotal)}
              </p>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {METHOD_IDS.map((id) => {
                  const active = method === id;
                  const tone = TONES[id];
                  const Icon = ICONS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMethod(id)}
                      className={cn(
                        'flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 py-3 text-xs font-semibold transition-all duration-150 active:scale-95',
                        active
                          ? cn(tone.border, tone.tint, tone.text, 'shadow-sm')
                          : 'border-white/8 text-neutral-400 hover:border-white/20 hover:bg-white/[0.03]'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full transition-all',
                          active
                            ? cn('bg-gradient-to-br text-white shadow-md', tone.fillFrom, tone.fillTo, tone.glow)
                            : 'bg-white/5 text-neutral-400'
                        )}
                      >
                        <Icon size={17} />
                      </span>
                      {methodLabels[id]}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 space-y-3">
                {method !== 'card' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">
                      {method === 'split' ? t('pos.payment.cashAmountLabel') : t('pos.payment.cashTenderedLabel')}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      dir="ltr"
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className={cn(
                        'h-12 w-full rounded-2xl border bg-neutral-800/80 px-4 text-lg font-semibold tabular-nums text-white outline-none transition focus:ring-2',
                        'border-white/10 focus:border-catchy/50 focus:ring-catchy/20'
                      )}
                    />
                  </div>
                ) : null}

                {method === 'split' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-500">
                      {t('pos.payment.cardAmountLabel')}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={cardInput}
                      onChange={(e) => setCardInput(e.target.value)}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-neutral-800/80 px-4 text-lg font-semibold tabular-nums text-white outline-none transition focus:border-violet-400/50 focus:ring-2 focus:ring-violet-500/20"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      {t('pos.payment.cashOwed').replace('{amount}', formatOrderMoney(cashOwed))}
                    </p>
                  </div>
                ) : null}

                {method !== 'card' ? (
                  <div
                    className={cn(
                      'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold',
                      changeGiven >= 0 ? 'bg-catchy/10 text-catchy' : 'bg-rose-500/10 text-rose-400'
                    )}
                  >
                    <span>{changeGiven >= 0 ? t('pos.payment.changeDue') : t('pos.payment.amountShort')}</span>
                    <span className="tabular-nums">{formatOrderMoney(Math.abs(changeGiven))}</span>
                  </div>
                ) : (
                  <p className="rounded-xl border border-sky-500/20 bg-sky-500/[0.08] px-3 py-2 text-xs text-sky-300">
                    {t('pos.payment.cardInstructions').replace('{amount}', formatOrderMoney(roundedTotal))}
                  </p>
                )}

                {error ? <p className="text-sm font-medium text-rose-400">{error}</p> : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/8 p-4">
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm || submitting}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r text-base font-bold uppercase tracking-wide text-white shadow-lg transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-neutral-700 disabled:to-neutral-700 disabled:opacity-60 disabled:shadow-none',
                  activeTone.fillFrom,
                  activeTone.fillTo,
                  activeTone.glow
                )}
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {submitting ? t('pos.payment.processing') : t('pos.payment.complete')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default PosPaymentModal;
