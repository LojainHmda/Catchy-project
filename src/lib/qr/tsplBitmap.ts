/**
 * Rasterizes text to a 1-bit monochrome bitmap in the exact byte layout TSPL's
 * BITMAP command expects (MSB-first, 1 bit/pixel, row-padded to whole bytes).
 *
 * This exists because the Xprinter's built-in TEXT command only has Latin
 * bitmap fonts — it cannot render Arabic script at all (prints literal "?"
 * characters). Rendering into a <canvas> instead uses the browser's real text
 * shaping engine, which handles Arabic letter-joining and RTL layout
 * correctly, and is embedded into the TSPL job as an image instead of text.
 */

const MIN_FONT_PX = 16;
const FONT_FAMILY = '"Cairo", "Segoe UI", Tahoma, Arial, sans-serif';

export interface TsplBitmap {
  /** BITMAP command's "width" parameter — width in BYTES, not pixels. */
  widthBytes: number;
  widthDots: number;
  heightDots: number;
  /** widthBytes * heightDots raw bytes, ready to embed verbatim after the BITMAP command header. */
  bytes: Uint8Array;
}

/**
 * Renders `text` (right-aligned, RTL-shaped) into a widthDots x heightDots
 * canvas, shrinking the font to fit, and falls back to dropping trailing
 * words (never mid-word/mid-glyph slicing, which would corrupt Arabic
 * letter-joining) if it still doesn't fit at the minimum readable size.
 */
export async function renderTextToTsplBitmap(
  text: string,
  options: { widthDots: number; heightDots: number; fontPx?: number }
): Promise<TsplBitmap> {
  const { widthDots, heightDots, fontPx = 44 } = options;
  if (widthDots % 8 !== 0) {
    throw new Error('widthDots must be a multiple of 8 (TSPL packs bitmap rows into whole bytes).');
  }

  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = widthDots;
  canvas.height = heightDots;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, widthDots, heightDots);

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';

  const maxTextWidth = widthDots - 8; // small side margin
  const trimmed = text.trim();
  let size = fontPx;
  const setFont = () => {
    ctx.font = `700 ${size}px ${FONT_FAMILY}`;
  };
  setFont();
  while (ctx.measureText(trimmed).width > maxTextWidth && size > MIN_FONT_PX) {
    size -= 2;
    setFont();
  }

  let displayText = trimmed;
  if (ctx.measureText(displayText).width > maxTextWidth) {
    // Still too wide at the minimum font size — drop trailing words rather than
    // slicing characters, so we never cut an Arabic glyph mid-shape.
    const words = trimmed.split(/\s+/);
    while (words.length > 1 && ctx.measureText(words.join(' ') + ' …').width > maxTextWidth) {
      words.pop();
    }
    displayText = words.length < trimmed.split(/\s+/).length ? words.join(' ') + ' …' : words.join(' ');
  }

  ctx.fillText(displayText, widthDots - 4, heightDots / 2, maxTextWidth);

  const { data } = ctx.getImageData(0, 0, widthDots, heightDots);
  const widthBytes = widthDots / 8;
  const bytes = new Uint8Array(widthBytes * heightDots);

  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const i = (y * widthDots + x) * 4;
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (luminance < 128) {
        const byteIndex = y * widthBytes + (x >> 3);
        const bitIndex = 7 - (x % 8);
        bytes[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  // A physical test print came back color-inverted (solid dark box, white cutout
  // text) — this printer's BITMAP command treats a set bit as "leave blank" and a
  // clear bit as "print", the opposite of the natural "1 = dark pixel" convention
  // used above. Invert the whole buffer so a dark canvas pixel actually prints dark.
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = ~bytes[i] & 0xff;
  }

  return { widthBytes, widthDots, heightDots, bytes };
}
