import { uploadFileResumable, deleteStorageObject } from './firebaseStorage';

/**
 * Per-product video upload — reuses the same Firebase Storage resumable-upload
 * plumbing as the admin hero video (src/lib/firebaseStorage.ts), not Cloudinary.
 * Product images go through Cloudinary via a JSON data-URL POST to our own
 * server (server/lib/cloudinaryUpload.js), but that path is capped by the
 * server's 12MB JSON body limit (and Cloud Run's hard 32MB request limit) —
 * unworkable for video files. Firebase Storage uploads go directly from the
 * browser to Storage, bypassing our server and that limit entirely, and the
 * `storage.rules` already has a `products/{filename}` admin-write rule.
 *
 * Size: MAX_VIDEO_BYTES (binary MB, like every other upload limit in this repo).
 * `uploadBytesResumable` sends the File in chunks straight from disk, so the
 * whole video is never read into memory and no request-body limit applies.
 * NOTE: storage.rules does not check size or type for `products/`, so this
 * client check is currently the only enforcement of the limit.
 */

const STORAGE_FOLDER = 'products';
/** 100 MB (binary): 104,857,600 bytes — product clips, not the site-wide hero asset (300 MB). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024);

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/** Returns an error message, or null if the file is acceptable. */
export function validateProductVideoFile(file: File, t: (key: string) => string = (key) => key): string | null {
  if (!isVideoFile(file)) return t('admin.products.form.invalidVideoType');
  if (file.size > MAX_VIDEO_BYTES) return t('admin.products.form.videoTooLarge').replace('{n}', String(MAX_VIDEO_MB));
  return null;
}

export async function uploadProductVideoFile(
  file: File,
  onProgress: (percent: number) => void
): Promise<string> {
  // Re-checked here so no caller can upload a file the form would have refused.
  const invalid = validateProductVideoFile(file);
  if (invalid) throw new Error(invalid);
  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${STORAGE_FOLDER}/video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return uploadFileResumable(path, file, onProgress);
}

/**
 * Recovers the Storage path from a `getDownloadURL()` result
 * (".../o/<url-encoded-path>?alt=media&token=...") so a replaced/removed video
 * can be deleted without a separate "storagePath" field on the product. Returns
 * null for anything that isn't a recognizable Firebase Storage download URL —
 * callers must treat null as "don't know how to delete this, so don't."
 */
export function storagePathFromDownloadUrl(url: string): string | null {
  const match = /\/o\/([^?]+)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/**
 * Deletes a product video's Storage object, but only if the URL is positively
 * identifiable as one of our own Firebase Storage objects (see
 * storagePathFromDownloadUrl) — never attempts to delete anything else, so it's
 * always safe to call on any URL a product might have.
 */
export async function deleteProductVideoIfOwned(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const path = storagePathFromDownloadUrl(url);
  if (!path || !path.startsWith(`${STORAGE_FOLDER}/`)) return;
  try {
    await deleteStorageObject(path);
  } catch {
    /* already gone, or never existed — nothing more to do */
  }
}
