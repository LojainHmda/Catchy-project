import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import { downloadInvoiceImage, type InvoiceLabels } from '../../lib/orders/invoiceImage';
import { SHIPPING_ZONES } from '../../lib/shippingZones';
import { orderItemImageSrc, resolveOrderItemImages } from '../../hooks/useOrderItemImages';
import type { OrderRecord } from '../../types/order';

type InvoiceDownloadButtonProps = {
  order: OrderRecord;
  className?: string;
  /** `solid` for a prominent CTA, `outline` (default) for a secondary action. */
  variant?: 'outline' | 'solid';
};

const InvoiceDownloadButton: React.FC<InvoiceDownloadButtonProps> = ({
  order,
  className,
  variant = 'outline',
}) => {
  const { t, isRTL, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const locale = language === 'ar' ? 'ar' : 'en-GB';

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const labels: InvoiceLabels = {
        brand: 'CATCHY',
        invoiceTitle: t('invoice.title'),
        orderNo: t('orders.orderNumber'),
        orderDate: t('invoice.orderDate'),
        generatedAt: t('invoice.generatedAt'),
        billTo: t('invoice.billTo'),
        phone: t('cart.deliveryPhone'),
        address: t('cart.deliveryAddress'),
        nameCol: t('invoice.item'),
        colorCol: t('invoice.color'),
        sizeCol: t('invoice.size'),
        qtyCol: t('invoice.qty'),
        priceCol: t('invoice.price'),
        totalCol: t('invoice.total'),
        subtotal: t('cart.subtotal'),
        shipping: t('cart.shipping'),
        total: t('cart.total'),
        thanks: t('invoice.thanks'),
      };
      const zone = SHIPPING_ZONES.find((z) => z.id === order.deliveryZone);
      const resolvedImages = await resolveOrderItemImages(order.items);
      const itemImageSrcs = order.items.map((item) => orderItemImageSrc(item, resolvedImages));
      await downloadInvoiceImage(order, labels, {
        isRTL,
        locale,
        shippingZoneLabel: zone ? t(zone.labelKey) : null,
        itemImageSrcs,
      });
      toast.success(t('invoice.downloaded'));
    } catch (error) {
      console.error('Invoice image generation failed:', error);
      toast.error(t('invoice.error'));
    } finally {
      setBusy(false);
    }
  };

  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-60';
  const tone =
    variant === 'solid'
      ? 'bg-catchy px-6 py-3 tracking-widest text-white shadow-md shadow-catchy/20 hover:bg-catchy-dark'
      : 'border border-gray-200 px-3 py-2 text-gray-700 hover:border-catchy hover:text-catchy';

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={busy}
      className={cn(base, tone, isRTL && 'font-arabic flex-row-reverse', className)}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      {busy ? t('invoice.downloading') : t('invoice.download')}
    </button>
  );
};

export default InvoiceDownloadButton;
