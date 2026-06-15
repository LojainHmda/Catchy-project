import { getDownloadURL, storage, storageRef, uploadBytes } from '../firebase';
import { fileToAdminImageDataUrl } from './images';

export function isEmbeddedImageUrl(url: string): boolean {
  return url.trim().startsWith('data:image/');
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  if (!base64) throw new Error('Invalid image data');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function productStoragePath(): string {
  return `products/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

async function uploadBlob(blob: Blob): Promise<string> {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Set VITE_FIREBASE_STORAGE_BUCKET in .env');
  }
  const ref = storageRef(storage, productStoragePath());
  await uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(ref);
}

export async function uploadProductImageDataUrl(dataUrl: string): Promise<string> {
  return uploadBlob(dataUrlToBlob(dataUrl));
}

export async function uploadProductImageFile(file: File): Promise<string> {
  const dataUrl = await fileToAdminImageDataUrl(file, { maxWidth: 1600, quality: 0.82 });
  return uploadProductImageDataUrl(dataUrl);
}

export async function ensureRemoteProductImage(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (!isEmbeddedImageUrl(trimmed)) return trimmed;
  return uploadProductImageDataUrl(trimmed);
}

export async function ensureRemoteProductImages(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map((url) => ensureRemoteProductImage(url)));
}
