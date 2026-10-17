import { useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';

/** Renders `value` to a CODE128 barcode PNG data URL. Returns null while generating or on failure. */
export function useBarcodeImage(value: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setDataUrl(null);
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: 2,
        height: 90,
        displayValue: true,
        fontSize: 14,
        margin: 12,
      });
      setDataUrl(canvas.toDataURL('image/png'));
    } catch {
      setDataUrl(null);
    }
  }, [value]);

  return dataUrl;
}
