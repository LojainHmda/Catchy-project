import type { OrderRecord } from '../../types/order';
import { formatOrderDateTime, formatOrderMoney, parseLineItemDisplay, shortOrderId } from './orderUtils';

/** Localized text the generated invoice image needs (built from the i18n `t()` by the caller). */
export type InvoiceLabels = {
  brand: string;
  invoiceTitle: string;
  orderNo: string;
  orderDate: string;
  generatedAt: string;
  billTo: string;
  phone: string;
  address: string;
  nameCol: string;
  colorCol: string;
  sizeCol: string;
  qtyCol: string;
  priceCol: string;
  totalCol: string;
  subtotal: string;
  shipping: string;
  total: string;
  thanks: string;
};

export type InvoiceImageOptions = {
  isRTL: boolean;
  locale: string;
  /** Localized delivery-area name (e.g. "Jerusalem" / "القدس"). */
  shippingZoneLabel?: string | null;
  /** Resolved product photo URL per line item, aligned to `order.items` by index. */
  itemImageSrcs?: (string | null | undefined)[];
};

const GREEN = '#42aa77';
const GREEN_DARK = '#2a6b4f';
const INK = '#1f3a2e';
const MUTED = '#7b8a82';
const HAIRLINE = '#eceeed';
const SOFT = '#f5faf7';
const TINT = 'rgba(66,170,119,0.12)';
const TINT_LINE = 'rgba(66,170,119,0.22)';
const STRIPE = '#f8fbf9';
const WHITE = '#ffffff';

const SCALE = 2;
const W = 864;
const M = 48;
const CONTENT_W = W - M * 2;
const CONTENT_RIGHT = W - M;
const HEADER_H = 122;
const FONT_STACK = 'Arial, "Segoe UI", Tahoma, sans-serif';
const PAD = 8;

function font(size: number, weight = 400): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function truncate(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (!value) return '';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let str = value;
  while (str.length > 1 && ctx.measureText(`${str}…`).width > maxWidth) {
    str = str.slice(0, -1);
  }
  return `${str.trim()}…`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Columns in reading order (start → end). Name flexes to fill.
const COL_FIXED = { num: 36, img: 52, color: 96, size: 62, qty: 50, price: 100, total: 110 };
const NAME_W =
  CONTENT_W -
  (COL_FIXED.num + COL_FIXED.img + COL_FIXED.color + COL_FIXED.size + COL_FIXED.qty + COL_FIXED.price + COL_FIXED.total);

type Col = { o: number; w: number };
const COLS = (() => {
  let o = 0;
  const make = (w: number): Col => {
    const col = { o, w };
    o += w;
    return col;
  };
  return {
    num: make(COL_FIXED.num),
    img: make(COL_FIXED.img),
    name: make(NAME_W),
    color: make(COL_FIXED.color),
    size: make(COL_FIXED.size),
    qty: make(COL_FIXED.qty),
    price: make(COL_FIXED.price),
    total: make(COL_FIXED.total),
  };
})();

const ROW_H = 48;
const THUMB = 36;

function paintInvoice(
  ctx: CanvasRenderingContext2D,
  order: OrderRecord,
  labels: InvoiceLabels,
  opts: InvoiceImageOptions,
  draw: boolean,
  thumbs: (HTMLImageElement | null)[] = []
): number {
  const { isRTL } = opts;
  const moneyLocale = 'en-GB';
  const startAlign: CanvasTextAlign = isRTL ? 'right' : 'left';
  const endAlign: CanvasTextAlign = isRTL ? 'left' : 'right';
  const mapX = (lx: number) => (isRTL ? CONTENT_RIGHT - lx : M + lx);

  if (draw) ctx.direction = isRTL ? 'rtl' : 'ltr';

  const text = (
    value: string,
    x: number,
    y: number,
    o: { size: number; weight?: number; color?: string; align?: CanvasTextAlign; spacing?: number }
  ) => {
    if (!draw) return;
    ctx.font = font(o.size, o.weight ?? 400);
    ctx.fillStyle = o.color ?? INK;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = 'middle';
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`;
    } catch {
      /* letterSpacing unsupported */
    }
    ctx.fillText(value, x, y);
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    } catch {
      /* noop */
    }
  };

  const colStart = (col: Col, value: string, y: number, o: { size: number; weight?: number; color?: string }) =>
    text(value, mapX(col.o + PAD), y, { ...o, align: startAlign });
  const colEnd = (col: Col, value: string, y: number, o: { size: number; weight?: number; color?: string }) =>
    text(value, mapX(col.o + col.w - PAD), y, { ...o, align: endAlign });
  const colCenter = (col: Col, value: string, y: number, o: { size: number; weight?: number; color?: string }) =>
    text(value, mapX(col.o + col.w / 2), y, { ...o, align: 'center' });

  let y = 0;

  // ── Branded header band ──
  if (draw) {
    const grad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
    grad.addColorStop(0, GREEN);
    grad.addColorStop(1, GREEN_DARK);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEADER_H);
  }
  text(labels.brand, W / 2, 58, { size: 34, weight: 800, color: WHITE, align: 'center', spacing: 4 });
  text(labels.invoiceTitle.toUpperCase(), W / 2, 92, {
    size: 13,
    weight: 600,
    color: 'rgba(255,255,255,0.88)',
    align: 'center',
    spacing: 5,
  });
  y = HEADER_H + 28;

  // ── Meta card (order info + customer info, one line each) ──
  const customerParts: string[] = [];
  if (order.customerName) customerParts.push(order.customerName);
  if (order.customerPhone) customerParts.push(`${labels.phone}: ${order.customerPhone}`);
  if (order.deliveryAddress) customerParts.push(`${labels.address}: ${order.deliveryAddress}`);
  const hasCustomer = customerParts.length > 0;

  const innerPad = 18;
  const innerW = CONTENT_W - innerPad * 2;
  const cardH = hasCustomer ? 84 : 52;
  if (draw) {
    ctx.fillStyle = SOFT;
    roundedRect(ctx, M, y, CONTENT_W, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 1;
    roundedRect(ctx, M, y, CONTENT_W, cardH, 14);
    ctx.stroke();
  }
  const orderInfo = [
    `${labels.orderNo}: ${shortOrderId(order.id)}`,
    `${labels.orderDate}: ${formatOrderDateTime(order.createdAt, opts.locale)}`,
    `${labels.generatedAt}: ${formatOrderDateTime(new Date(), opts.locale)}`,
  ].join('    ·    ');
  const orderY = hasCustomer ? y + 28 : y + cardH / 2;
  text(draw ? truncate(ctx, orderInfo, innerW) : orderInfo, mapX(innerPad), orderY, {
    size: 12.5,
    weight: 700,
    color: INK,
    align: startAlign,
  });
  if (hasCustomer) {
    if (draw) {
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M + innerPad, y + 46);
      ctx.lineTo(CONTENT_RIGHT - innerPad, y + 46);
      ctx.stroke();
    }
    const line = `${labels.billTo}: ${customerParts.join('    ·    ')}`;
    text(draw ? truncate(ctx, line, innerW) : line, mapX(innerPad), y + 64, {
      size: 12,
      weight: 500,
      color: MUTED,
      align: startAlign,
    });
  }
  y += cardH + 30;

  // ── Table header ──
  const headerH = 32;
  if (draw) {
    ctx.fillStyle = TINT;
    roundedRect(ctx, M, y, CONTENT_W, headerH, 9);
    ctx.fill();
  }
  const hy = y + headerH / 2;
  const headOpts = { size: 11.5, weight: 800, color: GREEN_DARK };
  colCenter(COLS.num, '#', hy, headOpts);
  colStart(COLS.name, labels.nameCol, hy, headOpts);
  colStart(COLS.color, labels.colorCol, hy, headOpts);
  colCenter(COLS.size, labels.sizeCol, hy, headOpts);
  colCenter(COLS.qty, labels.qtyCol, hy, headOpts);
  colEnd(COLS.price, labels.priceCol, hy, headOpts);
  colEnd(COLS.total, labels.totalCol, hy, headOpts);
  y += headerH + 4;

  // ── Item rows ──
  order.items.forEach((item, index) => {
    const top = y;
    const cy = top + ROW_H / 2;
    const { productName, color, size } = parseLineItemDisplay(item);

    if (draw && index % 2 === 1) {
      ctx.fillStyle = STRIPE;
      roundedRect(ctx, M, top, CONTENT_W, ROW_H, 7);
      ctx.fill();
    }

    // Numbered badge
    if (draw) {
      const bx = mapX(COLS.num.o + COLS.num.w / 2);
      ctx.fillStyle = TINT;
      ctx.beginPath();
      ctx.arc(bx, cy, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    colCenter(COLS.num, String(index + 1), cy, { size: 11, weight: 800, color: GREEN_DARK });

    // Product thumbnail (falls back to a soft tinted tile when no photo resolved)
    if (draw) {
      const ix = mapX(COLS.img.o + COLS.img.w / 2) - THUMB / 2;
      const iy = cy - THUMB / 2;
      const img = thumbs[index];
      ctx.save();
      roundedRect(ctx, ix, iy, THUMB, THUMB, 8);
      ctx.clip();
      if (img) {
        // cover-fit the source into the square thumb
        const ar = img.width / img.height;
        let dw = THUMB;
        let dh = THUMB;
        if (ar > 1) dw = THUMB * ar;
        else dh = THUMB / ar;
        ctx.drawImage(img, ix + (THUMB - dw) / 2, iy + (THUMB - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = SOFT;
        ctx.fillRect(ix, iy, THUMB, THUMB);
      }
      ctx.restore();
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      roundedRect(ctx, ix, iy, THUMB, THUMB, 8);
      ctx.stroke();
    }

    colStart(COLS.name, draw ? truncate(ctx, productName, COLS.name.w - PAD * 2) : productName, cy, {
      size: 12.5,
      weight: 700,
      color: INK,
    });
    colStart(COLS.color, draw ? truncate(ctx, color || '—', COLS.color.w - PAD * 2) : color || '—', cy, {
      size: 11.5,
      weight: 400,
      color: color ? INK : MUTED,
    });
    colCenter(COLS.size, size || '—', cy, { size: 11.5, weight: 600, color: size ? INK : MUTED });
    colCenter(COLS.qty, `×${item.quantity}`, cy, { size: 11.5, weight: 700, color: INK });
    colEnd(COLS.price, formatOrderMoney(item.price, moneyLocale), cy, { size: 11.5, weight: 400, color: MUTED });
    colEnd(COLS.total, formatOrderMoney(item.lineTotal, moneyLocale), cy, { size: 12.5, weight: 800, color: INK });

    y += ROW_H;
    if (draw) {
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(M, y);
      ctx.lineTo(CONTENT_RIGHT, y);
      ctx.stroke();
    }
  });

  y += 22;

  // ── Totals (right-aligned block; grand total highlighted) ──
  const labelX = mapX(COLS.price.o + COLS.price.w - PAD);
  const valueX = mapX(CONTENT_W - PAD);
  const subRow = (label: string, value: string) => {
    text(label, labelX, y, { size: 12, weight: 600, color: MUTED, align: endAlign });
    text(value, valueX, y, { size: 12.5, weight: 700, color: INK, align: endAlign });
    y += 26;
  };
  subRow(labels.subtotal, formatOrderMoney(order.subtotal, moneyLocale));
  const shippingLabel = opts.shippingZoneLabel ? `${labels.shipping} (${opts.shippingZoneLabel})` : labels.shipping;
  subRow(shippingLabel, formatOrderMoney(order.shippingCost, moneyLocale));

  y += 6;
  const boxX1 = mapX(COLS.price.o);
  const boxX2 = mapX(CONTENT_W);
  const boxLeft = Math.min(boxX1, boxX2);
  const boxW = Math.abs(boxX2 - boxX1);
  const boxH = 40;
  if (draw) {
    ctx.fillStyle = TINT;
    roundedRect(ctx, boxLeft, y, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = TINT_LINE;
    ctx.lineWidth = 1;
    roundedRect(ctx, boxLeft, y, boxW, boxH, 10);
    ctx.stroke();
  }
  const boxMid = y + boxH / 2;
  text(labels.total, labelX, boxMid, { size: 14, weight: 800, color: GREEN_DARK, align: endAlign });
  text(formatOrderMoney(order.total, moneyLocale), valueX, boxMid, {
    size: 17,
    weight: 800,
    color: GREEN_DARK,
    align: endAlign,
  });
  y += boxH + 30;

  // ── Footer ──
  const footH = 52;
  if (draw) {
    ctx.fillStyle = SOFT;
    roundedRect(ctx, M, y, CONTENT_W, footH, 14);
    ctx.fill();
  }
  text(labels.thanks, W / 2, y + footH / 2, { size: 13.5, weight: 700, color: GREEN_DARK, align: 'center' });
  y += footH + 28;

  return y;
}

/**
 * Remote photos (Firebase Storage etc.) are served through our same-origin
 * `/api/image-proxy` so the canvas can read them: a cross-origin `<img>` without
 * CORS headers either fails to load or taints the canvas, breaking `toDataURL`.
 * Local paths and `data:` URLs are already safe and pass through unchanged.
 */
function canvasSafeSrc(src: string): string {
  if (/^https?:\/\//i.test(src.trim())) {
    return `/api/image-proxy?url=${encodeURIComponent(src.trim())}`;
  }
  return src;
}

/** Load one image; resolves to null on error/timeout so a missing photo never blocks the invoice. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    let settled = false;
    const done = (val: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    img.onload = () => done(img);
    img.onerror = () => done(null);
    // Don't let a slow/blocked CDN hang the download.
    setTimeout(() => done(null), 6000);
    img.src = canvasSafeSrc(src);
  });
}

/** Build a PNG data URL of the order invoice (includes the generation date/time). */
export async function renderInvoiceImageDataUrl(
  order: OrderRecord,
  labels: InvoiceLabels,
  opts: InvoiceImageOptions
): Promise<string> {
  const thumbs = await Promise.all(
    order.items.map((_, index) => loadImage(opts.itemImageSrcs?.[index] ?? ''))
  );

  const canvas = document.createElement('canvas');
  const measureCtx = canvas.getContext('2d');
  if (!measureCtx) throw new Error('Canvas not supported');

  const height = Math.ceil(paintInvoice(measureCtx, order, labels, opts, false));

  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, height);

  paintInvoice(ctx, order, labels, opts, true, thumbs);

  return canvas.toDataURL('image/png');
}

/** Generate and download the invoice as a PNG image. */
export async function downloadInvoiceImage(
  order: OrderRecord,
  labels: InvoiceLabels,
  opts: InvoiceImageOptions
): Promise<void> {
  const dataUrl = await renderInvoiceImageDataUrl(order, labels, opts);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `catchy-invoice-${order.id.slice(0, 8).toUpperCase()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
