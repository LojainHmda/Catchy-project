import { auth } from '../firebase';
import { fileToAdminImageDataUrl } from './images';

export function isEmbeddedImageUrl(url: string): boolean {
  return url.trim().startsWith('data:image/');
}

async function uploadDataUrlToCloudinary(dataUrl: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as an admin to upload images.');
  const idToken = await user.getIdToken();

  const res = await fetch('/api/admin/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ dataUrl }),
  });
  const payload = await res.json().catch(() => ({}) as { url?: string; message?: string });
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.message || `Image upload failed (${res.status})`);
  }
  return payload.url;
}

export async function uploadProductImageDataUrl(dataUrl: string): Promise<string> {
  return uploadDataUrlToCloudinary(dataUrl);
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
