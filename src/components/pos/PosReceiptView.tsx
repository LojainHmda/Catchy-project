import React, { useState } from 'react';
import { Download, Plus, Printer } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatOrderDateTime, formatOrderMoney, parseLineItemDisplay, shortOrderId } from '../../lib/orders';
import { downloadPosReceiptImage } from '../../lib/pos/posReceipt';
import type { OrderRecord } from '../../types/order';

type PosReceiptViewProps = {
  order: OrderRecord;
  onNewSale: () => void;
};

const PosReceiptView: React.FC<PosReceiptViewProps> = ({ order, onNewSale }) => {
  const { t, isRTL, language } = useLanguage();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPosReceiptImage(order, {
        isRTL,
        labels: {
          subtitle: t('pos.receipt.subtitle'),
          subtotal: t('pos.cart.subtotal'),
          discount: t('pos.discount.title'),
          total: t('pos.cart.total'),
          payment: t('pos.receipt.payment'),
          cashTendered: t('pos.payment.cashTenderedLabel'),
          cardCharged: t('pos.receipt.cardCharged'),
          changeGiven: t('pos.receipt.changeGiven'),
          servedBy: t('pos.receipt.servedBy'),
          thanks: t('pos.receipt.thanks'),
          methodLabels: { cash: t('pos.payment.cash'), card: t('pos.payment.card'), split: t('pos.payment.split') },
        },
      });
    } finally {
      setDownloading(false);
    }
  };

  const methodLabel: Record<string, string> = {
    cash: t('pos.payment.cash'),
    card: t('pos.payment.card'),
    split: t('pos.payment.split'),
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto bg-neutral-950 p-4 sm:p-8">
      {/* The receipt itself stays paper-white regardless of the app's dark theme — it represents a physical printout. */}
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        lang={language}
        className={`w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl shadow-black/40 print:border-0 print:shadow-none ${isRTL ? 'font-arabic' : ''}`}
      >
        <div className="mb-4 text-center">
          <p className="text-xl font-black tracking-widest text-gray-900">CATCHY</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-400">{t('pos.receipt.subtitle')}</p>
        </div>
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-mono font-semibold text-gray-900" dir="ltr">
            {shortOrderId(order.id)}
          </span>
          <span className="text-gray-500">{formatOrderDateTime(order.createdAt)}</span>
        </div>
        <div className="border-t border-dashed border-gray-200 py-3">
          {order.items.map((item, idx) => {
            const { productName, color, size } = parseLineItemDisplay(item);
            const variantText = [color, size].filter(Boolean).join(' / ');
            return (
              <div key={`${item.productId}-${idx}`} className="mb-2 flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{productName}</p>
                  {variantText ? <p className="text-xs text-gray-500">{variantText}</p> : null}
                  <p className="text-xs text-gray-500" dir="ltr">
                    {item.quantity} × {formatOrderMoney(item.price)}
                  </p>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-gray-900" dir="ltr">
                  {formatOrderMoney(item.lineTotal)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="space-y-1 border-t border-dashed border-gray-200 pt-3 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>{t('pos.cart.subtotal')}</span>
            <span className="tabular-nums" dir="ltr">
              {formatOrderMoney(order.subtotal)}
            </span>
          </div>
          {order.discount ? (
            <div className="flex justify-between text-catchy-dark">
              <span>{t('pos.discount.title')}</span>
              <span className="tabular-nums" dir="ltr">
                -{formatOrderMoney(order.discount.amount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1 text-base font-bold text-gray-900">
            <span>{t('pos.cart.total')}</span>
            <span className="tabular-nums" dir="ltr">
              {formatOrderMoney(order.total)}
            </span>
          </div>
        </div>
        {order.payment ? (
          <div className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-3 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>{t('pos.receipt.payment')}</span>
              <span className="font-medium uppercase text-gray-900">{methodLabel[order.payment.method]}</span>
            </div>
            {order.payment.method !== 'card' ? (
              <div className="flex justify-between">
                <span>{t('pos.payment.cashTenderedLabel')}</span>
                <span className="tabular-nums" dir="ltr">
                  {formatOrderMoney(order.payment.cashAmount)}
                </span>
              </div>
            ) : null}
            {order.payment.method === 'split' ? (
              <div className="flex justify-between">
                <span>{t('pos.receipt.cardCharged')}</span>
                <span className="tabular-nums" dir="ltr">
                  {formatOrderMoney(order.payment.cardAmount)}
                </span>
              </div>
            ) : null}
            {order.payment.changeGiven > 0 ? (
              <div className="flex justify-between font-medium text-gray-900">
                <span>{t('pos.receipt.changeGiven')}</span>
                <span className="tabular-nums" dir="ltr">
                  {formatOrderMoney(order.payment.changeGiven)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        {order.cashierName ? (
          <p className="mt-4 text-center text-xs text-gray-400">
            {t('pos.receipt.servedBy').replace('{name}', order.cashierName)}
          </p>
        ) : null}
        <p className="mt-2 text-center text-sm font-semibold text-gray-700">{t('pos.receipt.thanks')}</p>
      </div>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-2 print:hidden">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-neutral-900 text-sm font-semibold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy active:scale-[0.98]"
          >
            <Printer size={16} /> {t('pos.receipt.print')}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-neutral-900 text-sm font-semibold text-neutral-300 transition hover:border-catchy/40 hover:text-catchy active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={16} /> {downloading ? t('pos.receipt.saving') : t('pos.receipt.savePng')}
          </button>
        </div>
        <button
          type="button"
          onClick={onNewSale}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-catchy to-catchy-dark text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-catchy/25 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
        >
          <Plus size={18} /> {t('pos.receipt.newSale')}
        </button>
      </div>
    </div>
  );
};

export default PosReceiptView;
