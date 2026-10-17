import QRCode from 'qrcode';
import { renderTextToTsplBitmap } from './tsplBitmap';

/**
 * Builds a TSPL print job (binary — not plain text, since it embeds a raster
 * bitmap) for a single 57mm x 38mm label containing a product's QR code,
 * name, and price, with the QR code as the dominant element.
 *
 * The QR code and price are drawn natively by the printer's own firmware
 * (QRCODE/TEXT commands) — that's dot-exact and needs no browser rendering.
 * The product name is rendered into a bitmap by the browser and embedded via
 * TSPL's BITMAP command instead, because the printer's built-in TEXT fonts
 * are Latin-only and cannot render Arabic script (confirmed by a physical
 * test: Arabic names printed as literal "?" characters).
 *
 * Coordinates are in dots. The XP-DT426B is 203 DPI = 8 dots/mm, so
 * 57mm x 38mm = 456 x 304 dots exactly.
 */

const LABEL_WIDTH_MM = 57;
const LABEL_HEIGHT_MM = 38;
const DOTS_PER_MM = 8; // 203 DPI

export interface TsplQrLabelInput {
  url: string;
  name: string;
  price: string;
  /** Number of identical copies the printer itself should produce. Defaults to 1. */
  quantity?: number;
}

/** Escapes characters that would break out of a TSPL "..." string literal. */
function escapeTsplString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function buildTsplQrLabel({ url, name, price, quantity = 1 }: TsplQrLabelInput): Promise<Uint8Array> {
  const copies = Math.max(1, Math.floor(quantity));
  // Layout (456 x 304 dots total), redesigned from scratch for 57x38mm with the
  // QR as the dominant element (a physical test of the previous label showed
  // the QR far too small). The QR is square, so the label's 38mm height is the
  // hard ceiling on how large it can get (57mm width alone can't help a square
  // grow past the shorter dimension) — this sizes it to that ceiling, using
  // nearly the full height, then gives the leftover width strip to the name/
  // price instead of leaving it empty.
  const margin = 16; // 2mm safe margin on every edge
  const labelWidthDots = LABEL_WIDTH_MM * DOTS_PER_MM;
  const labelHeightDots = LABEL_HEIGHT_MM * DOTS_PER_MM;

  // The QR is square, so the label's height (minus margins) is the hard ceiling on
  // how large it can get — 57mm of width alone can't grow a square past the 38mm
  // dimension. Rather than guessing a cell width and hoping the resulting QR
  // version fits, ask the same QR encoder used elsewhere in this app for the
  // exact module count this URL needs, then pick the largest integer dots/module
  // that still fits the height budget. This maximizes the QR with zero guesswork
  // and zero wasted margin, and self-adjusts if the product id length ever changes.
  const qrHeightBudget = labelHeightDots - 2 * margin;
  const qrModules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size;
  const qrCellWidth = Math.max(1, Math.floor(qrHeightBudget / qrModules));
  const qrSizeDots = qrModules * qrCellWidth;
  // Right-anchored against the margin and vertically centered in the height budget
  // — this is what actually "eliminates unnecessary empty space" around the QR.
  const qrOriginX = labelWidthDots - margin - qrSizeDots;
  const qrOriginY = margin + Math.floor((qrHeightBudget - qrSizeDots) / 2);

  // Text strip: everything left of the QR, minus a small gap so text can't touch it.
  const nameImgX = margin;
  const nameImgWidthDots = Math.floor((qrOriginX - 10 - margin) / 8) * 8; // must be a multiple of 8
  const nameImgHeightDots = 84;
  const nameImgY = 90;

  const priceX = margin;
  const priceY = 188;

  // DIRECTION 1 was confirmed correct by a physical test (fixed an upside-down print).
  const direction = 1;

  const safePrice = escapeTsplString(price);
  const safeUrl = escapeTsplString(url);

  const header = [
    `SIZE ${LABEL_WIDTH_MM} mm,${LABEL_HEIGHT_MM} mm`,
    'GAP 2 mm,0 mm',
    `DIRECTION ${direction}`,
    'REFERENCE 0,0',
    'CLS',
    `QRCODE ${qrOriginX},${qrOriginY},M,${qrCellWidth},A,0,"${safeUrl}"`,
    '',
  ].join('\r\n');

  const nameBitmap = await renderTextToTsplBitmap(name, {
    widthDots: nameImgWidthDots,
    heightDots: nameImgHeightDots,
  });
  const bitmapCommandHeader = `BITMAP ${nameImgX},${nameImgY},${nameBitmap.widthBytes},${nameBitmap.heightDots},0,`;

  const footer = ['', `TEXT ${priceX},${priceY},"2",0,1,1,"${safePrice}"`, `PRINT 1,${copies}`, ''].join('\r\n');

  return concatBytes([textToBytes(header), textToBytes(bitmapCommandHeader), nameBitmap.bytes, textToBytes(footer)]);
}

export { DOTS_PER_MM };
