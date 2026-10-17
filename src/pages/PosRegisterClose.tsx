import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { usePosSession } from '../hooks/usePosSession';
import { formatOrderMoney } from '../lib/orders';
import type { RegisterSession } from '../types/pos';
import { cn } from '../lib/utils';

const Row: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <div className={cn('flex items-center justify-between py-1.5 text-sm', bold && 'font-bold text-white')}>
    <span className={bold ? undefined : 'text-neutral-500'}>{label}</span>
    <span className={cn('tabular-nums', !bold && 'text-neutral-300')} dir="ltr">
      {value}
    </span>
  </div>
);

const CARD =
  'w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur';

const PosRegisterClose: React.FC = () => {
  const navigate = useNavigate();
  const { t, isRTL, language } = useLanguage();
  const { session, loading, close } = usePosSession();
  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedSession, setClosedSession] = useState<RegisterSession | null>(null);

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const rootProps = {
    dir: isRTL ? ('rtl' as const) : ('ltr' as const),
    lang: language,
    className: `flex min-h-screen items-center justify-center bg-neutral-950 p-6 ${isRTL ? 'font-arabic' : ''}`,
  };

  if (loading) {
    return (
      <div dir="ltr" className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-7 w-7 animate-spin text-neutral-600" />
      </div>
    );
  }

  if (closedSession) {
    const variance = closedSession.cashVarianceAtClose ?? 0;
    return (
      <div {...rootProps}>
        <div className={CARD}>
          <h1 className="mb-4 text-center text-lg font-bold text-white">{t('pos.close.doneTitle')}</h1>
          <div className="divide-y divide-white/8">
            <Row label={t('pos.close.sales')} value={String(closedSession.salesCount)} />
            <Row label={t('pos.close.expectedCashShort')} value={formatOrderMoney(closedSession.expectedCashAtClose ?? 0)} />
            <Row label={t('pos.close.countedCash')} value={formatOrderMoney(closedSession.countedCashAtClose ?? 0)} />
            <Row
              label={t('pos.close.varianceLabel')}
              value={`${variance >= 0 ? '+' : ''}${formatOrderMoney(variance)}`}
              bold
            />
          </div>
          <p
            className={cn(
              'mt-3 rounded-xl px-3 py-2 text-center text-xs font-medium',
              variance === 0
                ? 'bg-catchy/10 text-catchy'
                : variance > 0
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-rose-500/10 text-rose-400'
            )}
          >
            {variance === 0 ? t('pos.close.balanced') : variance > 0 ? t('pos.close.over') : t('pos.close.short')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
          >
            {t('pos.close.done')}
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div {...rootProps}>
        <div className={cn(CARD, 'text-center')}>
          <p className="text-sm text-neutral-400">{t('pos.close.noSession')}</p>
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
          >
            {t('pos.close.backToTerminal')}
          </button>
        </div>
      </div>
    );
  }

  const expected = session.openingCashFloat + session.cashTotal;
  const counted = parseFloat(countedInput);
  const variancePreview = Number.isFinite(counted) ? counted - expected : null;

  const handleClose = async () => {
    if (!Number.isFinite(counted) || counted < 0) {
      setError(t('pos.close.countedRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await close(counted, notes);
      setClosedSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pos.sale.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div {...rootProps}>
      <div className={CARD}>
        <button
          type="button"
          onClick={() => navigate('/pos')}
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 transition hover:text-catchy"
        >
          <BackIcon size={14} /> {t('pos.close.backToTerminal')}
        </button>
        <h1 className="mb-4 text-lg font-bold text-white">{t('pos.close.title')}</h1>

        <div className="mb-4 divide-y divide-white/8 rounded-xl border border-white/8 bg-neutral-800/40 px-3">
          <Row label={t('pos.close.sales')} value={String(session.salesCount)} />
          <Row label={t('pos.close.openingFloat')} value={formatOrderMoney(session.openingCashFloat)} />
          <Row label={t('pos.close.cashSales')} value={formatOrderMoney(session.cashTotal)} />
          <Row label={t('pos.close.cardSales')} value={formatOrderMoney(session.cardTotal)} />
          <Row label={t('pos.close.discountsGiven')} value={formatOrderMoney(session.discountTotal)} />
          <Row label={t('pos.close.expectedCash')} value={formatOrderMoney(expected)} bold />
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">{t('pos.close.countedCash')}</label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          dir="ltr"
          value={countedInput}
          onChange={(e) => setCountedInput(e.target.value)}
          className="mb-2 h-12 w-full rounded-2xl border border-white/10 bg-neutral-800/80 px-4 text-lg font-semibold text-white outline-none transition focus:border-catchy/50 focus:ring-2 focus:ring-catchy/20"
        />
        {variancePreview !== null ? (
          <p
            className={cn(
              'mb-3 text-xs font-medium',
              variancePreview === 0
                ? 'text-neutral-500'
                : variancePreview > 0
                  ? 'text-amber-400'
                  : 'text-rose-400'
            )}
          >
            {t('pos.close.variancePreview').replace(
              '{amount}',
              `${variancePreview >= 0 ? '+' : ''}${formatOrderMoney(variancePreview)}`
            )}
          </p>
        ) : (
          <div className="mb-3" />
        )}

        <label className="mb-1 block text-xs font-medium text-neutral-500">{t('pos.close.notesLabel')}</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mb-4 w-full resize-none rounded-2xl border border-white/10 bg-neutral-800/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-catchy/50 focus:ring-2 focus:ring-catchy/20"
          placeholder={t('pos.close.notesPlaceholder')}
        />

        {error ? <p className="mb-3 text-sm font-medium text-rose-400">{error}</p> : null}

        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('pos.closeRegisterButton')}
        </button>
      </div>
    </div>
  );
};

export default PosRegisterClose;
