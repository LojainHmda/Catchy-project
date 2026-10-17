import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders `value` to a QR code PNG data URL. Returns null while generating or on failure. */
export function useQrCodeImage(value: string | null, size = 320): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return dataUrl;
}
