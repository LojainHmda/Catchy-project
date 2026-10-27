import { describe, it, expect, vi } from 'vitest';

// In local emulator mode, Storage (which is not emulated) must never be reached:
// uploads and deletes are refused before the Storage SDK is even loaded.
const storageSdk = vi.hoisted(() => ({ getStorage: vi.fn(), loaded: vi.fn() }));
vi.mock('../firebase', () => ({ app: {}, firebaseEmulatorMode: true }));
vi.mock('firebase/storage', () => {
  storageSdk.loaded();
  return { getStorage: storageSdk.getStorage, ref: vi.fn(), uploadBytesResumable: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn() };
});

import { deleteStorageObject, uploadFileResumable } from './firebaseStorage';

describe('firebaseStorage in emulator mode', () => {
  it('refuses uploads and deletes without touching the Storage SDK', async () => {
    await expect(uploadFileResumable('products/x.mp4', new File(['x'], 'x.mp4'), () => {})).rejects.toThrow(/disabled in local emulator mode/);
    await expect(deleteStorageObject('products/x.mp4')).rejects.toThrow(/disabled in local emulator mode/);
    expect(storageSdk.getStorage).not.toHaveBeenCalled();
    expect(storageSdk.loaded).not.toHaveBeenCalled();
  });
});
