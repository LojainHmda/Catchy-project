import type { OrderRecord } from '../../types/order';
import { formatOrderMoney, parseLineItemDisplay, shortOrderId } from '../orders/orderUtils';

const SCALE = 2;
const W = 384; // ~80mm thermal-printer proportions
const M = 20;
const CONTENT_W = W - M * 2;
const FONT_STACK_LTR = '"Courier New", Courier, monospace';
const FONT_STACK_RTL = '"Cairo", "Inter", ui-sans-serif, sans-serif';
const INK = '#1a1a1a';
const MUTED = '#666666';

export type PosReceiptLabels = {
  subtitle: string;
  subtotal: string;
  discount: string;
  total: string;
  payment: string;
  cashTendered: string;
  cardCharged: string;
  changeGiven: string;
  /** Contains a literal `{name}` placeholder. */
  servedBy: string;
  thanks: string;
  methodLabels: { cash: string; card: string; split: string };
};

export type PosReceiptOptions = {
  isRTL: boolean;
  labels: PosReceiptLabels;
};

function font(isRTL: boolean, size: number, weight: 400 | 700 = 400): string {
  return `${weight} ${size}px ${isRTL ? FONT_STACK_RTL : FONT_STACK_LTR}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Renders a printable 80mm-style receipt for a completed POS sale onto a canvas. */
function renderReceiptCanvas(order: OrderRecord, { isRTL, labels }: PosReceiptOptions): HTMLCanvasElement {
  const dateLocale = isRTL ? 'ar-u-nu-latn' : 'en-GB';
  const dateStr = order.createdAt
    ? order.createdAt.toLocaleString(dateLocale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  // Physical left/right anchors, swapped for RTL so labels sit on the "start" side
  // (right, for Arabic) and values on the "end" side — mirrors the on-screen cart/receipt.
  const startX = isRTL ? W - M : M;
  const endX = isRTL ? M : W - M;
  const startAlign: CanvasTextAlign = isRTL ? 'right' : 'left';
  const endAlign: CanvasTextAlign = isRTL ? 'left' : 'right';

  // First pass: measure required height.
  const measure = document.createElement('canvas').getContext('2d')!;
  let y = 0;
  y += 30 + 18 + 16 + 4 + 4; // brand, subtitle, order id, date, dashed rule
  measure.font = font(isRTL, 11);
  order.items.forEach((item) => {
    const { productName, color, size } = parseLineItemDisplay(item);
    const variantText = [color, size].filter(Boolean).join(' / ');
    const nameLines = wrapText(measure, productName, CONTENT_W);
    y += nameLines.length * 14;
    if (variantText) y += 13;
    y += 16; // qty x price line + spacing
  });
  y += 10; // dashed rule
  y += 16; // subtotal
  if (order.discount) y += 16;
  y += 20; // total
  y += 10; // dashed rule
  y += 16; // payment method
  if (order.payment?.method !== 'card') y += 16; // cash tendered
  if (order.payment?.method === 'split') y += 16; // card portion
  if ((order.payment?.changeGiven ?? 0) > 0) y += 16;
  y += 10; // dashed rule
  y += order.cashierName ? 16 : 0;
  y += 30; // thank you
  y += 20; // bottom margin

  const height = Math.ceil(y);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'top';
  ctx.fillStyle = INK;

  let cy = 16;
  ctx.font = font(isRTL, 20, 700);
  ctx.textAlign = 'center';
  ctx.fillText('CATCHY', W / 2, cy);
  cy += 26;
  ctx.font = font(isRTL, 11);
  ctx.fillStyle = MUTED;
  ctx.fillText(labels.subtitle.toUpperCase(), W / 2, cy);
  cy += 20;

  ctx.textAlign = startAlign;
  ctx.fillStyle = INK;
  ctx.font = font(isRTL, 11, 700);
  ctx.fillText(shortOrderId(order.id), startX, cy);
  ctx.textAlign = endAlign;
  ctx.font = font(isRTL, 10);
  ctx.fillStyle = MUTED;
  ctx.fillText(dateStr, endX, cy + 1);
  cy += 18;

  const dashedRule = () => {
    ctx.strokeStyle = '#c9c9c9';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(M, cy);
    ctx.lineTo(W - M, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    cy += 12;
  };
  dashedRule();

  order.items.forEach((item) => {
    const { productName, color, size } = parseLineItemDisplay(item);
    const variantText = [color, size].filter(Boolean).join(' / ');
    ctx.font = font(isRTL, 11, 700);
    ctx.fillStyle = INK;
    ctx.textAlign = startAlign;
    const nameLines = wrapText(ctx, productName, CONTENT_W);
    nameLines.forEach((line) => {
      ctx.fillText(line, startX, cy);
      cy += 14;
    });
    if (variantText) {
      ctx.font = font(isRTL, 9.5);
      ctx.fillStyle = MUTED;
      ctx.fillText(variantText, startX, cy);
      cy += 13;
    }
    ctx.font = font(isRTL, 10.5);
    ctx.fillStyle = INK;
    ctx.textAlign = startAlign;
    ctx.fillText(`${item.quantity} × ${formatOrderMoney(item.price)}`, startX, cy);
    ctx.textAlign = endAlign;
    ctx.fillText(formatOrderMoney(item.lineTotal), endX, cy);
    cy += 16;
  });

  dashedRule();

  const kv = (label: string, value: string, bold = false) => {
    ctx.font = font(isRTL, 11, bold ? 700 : 400);
    ctx.fillStyle = INK;
    ctx.textAlign = startAlign;
    ctx.fillText(label, startX, cy);
    ctx.textAlign = endAlign;
    ctx.fillText(value, endX, cy);
    cy += 16;
  };

  kv(labels.subtotal, formatOrderMoney(order.subtotal));
  if (order.discount) {
    const label =
      order.discount.mode === 'percent' ? `${labels.discount} (${order.discount.value}%)` : labels.discount;
    kv(label, `-${formatOrderMoney(order.discount.amount)}`);
  }
  ctx.font = font(isRTL, 13, 700);
  ctx.fillStyle = INK;
  ctx.textAlign = startAlign;
  ctx.fillText(labels.total.toUpperCase(), startX, cy);
  ctx.textAlign = endAlign;
  ctx.fillText(formatOrderMoney(order.total), endX, cy);
  cy += 20;

  dashedRule();

  const payment = order.payment;
  if (payment) {
    kv(labels.payment, labels.methodLabels[payment.method]);
    if (payment.method !== 'card') kv(labels.cashTendered, formatOrderMoney(payment.cashAmount));
    if (payment.method === 'split') kv(labels.cardCharged, formatOrderMoney(payment.cardAmount));
    if (payment.changeGiven > 0) kv(labels.changeGiven, formatOrderMoney(payment.changeGiven));
  }

  dashedRule();

  if (order.cashierName) {
    ctx.font = font(isRTL, 10);
    ctx.fillStyle = MUTED;
    ctx.textAlign = startAlign;
    ctx.fillText(labels.servedBy.replace('{name}', order.cashierName), startX, cy);
    cy += 16;
  }

  ctx.font = font(isRTL, 12, 700);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(labels.thanks, W / 2, cy + 6);

  return canvas;
}

export async function downloadPosReceiptImage(order: OrderRecord, options: PosReceiptOptions): Promise<void> {
  if (typeof document.fonts?.ready !== 'undefined') {
    await document.fonts.ready.catch(() => {});
  }
  const canvas = renderReceiptCanvas(order, options);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not generate receipt image.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `receipt-${shortOrderId(order.id).replace('#', '')}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
