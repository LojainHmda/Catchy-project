import { app } from '../firebase';

/**
 * Firebase Storage is only used by the admin hero-video uploader. Its SDK (~100KB)
 * is loaded on first use here instead of from src/firebase.ts, so it never ships
 * to storefront/POS visitors who never touch it.
 */
type StorageModule = typeof import('firebase/storage');

let modulePromise: Promise<StorageModule> | null = null;
function loadStorageModule(): Promise<StorageModule> {
  if (!modulePromise) modulePromise = import('firebase/storage');
  return modulePromise;
}

export async function uploadFileResumable(
  path: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<string> {
  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await loadStorageModule();
  const task = uploadBytesResumable(ref(getStorage(app), path), file);
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(err),
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve, reject);
      }
    );
  });
}

export async function deleteStorageObject(path: string): Promise<void> {
  const { getStorage, ref, deleteObject } = await loadStorageModule();
  await deleteObject(ref(getStorage(app), path));
}
