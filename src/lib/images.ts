/** Read a file as a data URL (full quality). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale and re-encode as JPEG so admin uploads fit localStorage / mock DB.
 * Falls back to the original data URL if canvas fails (e.g. very large dimensions in old browsers).
 */
export function compressDataUrl(
  dataUrl: string,
  maxWidth: number,
  quality: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        const scale = w > maxWidth ? maxWidth / w : 1;
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function fileToAdminImageDataUrl(
  file: File,
  opts?: { maxWidth?: number; quality?: number }
): Promise<string> {
  const maxWidth = opts?.maxWidth ?? 1600;
  const quality = opts?.quality ?? 0.82;
  const raw = await readFileAsDataUrl(file);
  return compressDataUrl(raw, maxWidth, quality);
}
