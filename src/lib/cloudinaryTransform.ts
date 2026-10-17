/**
 * Insert an on-the-fly resize/format transform into a Cloudinary secure_url
 * (e.g. https://res.cloudinary.com/<cloud>/image/upload/v123/folder/id.jpg),
 * so each surface requests an image sized for where it's actually displayed
 * instead of the full upload (every upload is saved at up to 1600px — see
 * src/lib/productImageUpload.ts).
 *
 * Returns the URL unchanged for anything that isn't a Cloudinary upload URL
 * (legacy Firebase Storage URLs, data: URIs, the local placeholder, etc) —
 * safe to call on any image src from catalogThumbnailUrl/coerceProductImages.
 */
const CLOUDINARY_UPLOAD_SEGMENT = /\/image\/upload\//;

export type CloudinaryTransformOptions = {
  /** Target display width in CSS px — the transform requests ~2x this for retina screens. */
  width: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'thumb';
};

export function cloudinaryTransform(
  url: string,
  { width, height, crop = 'fill' }: CloudinaryTransformOptions
): string {
  if (!url || !CLOUDINARY_UPLOAD_SEGMENT.test(url)) return url;
  const w = Math.max(1, Math.round(width * 2));
  const parts = [`w_${w}`, `c_${crop}`, 'q_auto', 'f_auto'];
  if (height) parts.splice(1, 0, `h_${Math.max(1, Math.round(height * 2))}`);
  return url.replace(CLOUDINARY_UPLOAD_SEGMENT, `/image/upload/${parts.join(',')}/`);
}
