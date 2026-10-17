import { describe, it, expect, vi, beforeEach } from 'vitest';

const { deleteStorageObjectMock, uploadFileResumableMock } = vi.hoisted(() => ({
  deleteStorageObjectMock: vi.fn().mockResolvedValue(undefined),
  uploadFileResumableMock: vi.fn(),
}));

vi.mock('./firebaseStorage', () => ({
  deleteStorageObject: deleteStorageObjectMock,
  uploadFileResumable: uploadFileResumableMock,
}));

import {
  deleteProductVideoIfOwned,
  isVideoFile,
  storagePathFromDownloadUrl,
  validateProductVideoFile,
} from './productVideoUpload';
import { translations } from '../context/LanguageContext';

const tEn = (key: string) => translations.en[key] ?? key;

function fakeVideoFile(sizeBytes: number, type = 'video/mp4'): File {
  const file = new File([new Uint8Array(1)], 'clip.mp4', { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('isVideoFile / validateProductVideoFile', () => {
  it('accepts a reasonably-sized video file', () => {
    expect(isVideoFile(fakeVideoFile(1024))).toBe(true);
    expect(validateProductVideoFile(fakeVideoFile(1024), tEn)).toBeNull();
  });

  it('rejects a non-video file type', () => {
    const file = fakeVideoFile(1024, 'image/png');
    expect(isVideoFile(file)).toBe(false);
    expect(validateProductVideoFile(file, tEn)).toMatch(/video file/i);
  });

  it('rejects a file over the size limit', () => {
    const tooLarge = fakeVideoFile(51 * 1024 * 1024);
    expect(validateProductVideoFile(tooLarge, tEn)).toMatch(/50 MB/);
  });

  it('accepts a file right at the size limit', () => {
    const atLimit = fakeVideoFile(50 * 1024 * 1024);
    expect(validateProductVideoFile(atLimit, tEn)).toBeNull();
  });
});

describe('storagePathFromDownloadUrl', () => {
  it('recovers the storage path from a real Firebase Storage download URL', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/catchy-496207.firebasestorage.app/o/products%2Fvideo-123-abc.mp4?alt=media&token=xyz';
    expect(storagePathFromDownloadUrl(url)).toBe('products/video-123-abc.mp4');
  });

  it('returns null for a URL with no recognizable /o/ segment (not a Firebase Storage URL)', () => {
    expect(storagePathFromDownloadUrl('https://example.com/some-video.mp4')).toBeNull();
    expect(storagePathFromDownloadUrl('https://res.cloudinary.com/demo/video/upload/clip.mp4')).toBeNull();
  });

  it('returns null for an empty or malformed string rather than throwing', () => {
    expect(storagePathFromDownloadUrl('')).toBeNull();
    expect(storagePathFromDownloadUrl('not a url at all')).toBeNull();
  });
});

describe('deleteProductVideoIfOwned — "safe ownership verified" before deleting any storage asset', () => {
  beforeEach(() => {
    deleteStorageObjectMock.mockClear();
  });

  it('deletes the underlying storage object for a recognized products/ video URL', async () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/catchy-496207.firebasestorage.app/o/products%2Fvideo-123.mp4?alt=media&token=xyz';

    await deleteProductVideoIfOwned(url);

    expect(deleteStorageObjectMock).toHaveBeenCalledWith('products/video-123.mp4');
  });

  it('REGRESSION: never attempts to delete a URL it cannot positively identify as its own (e.g. an external/Cloudinary URL)', async () => {
    await deleteProductVideoIfOwned('https://res.cloudinary.com/demo/video/upload/someone-elses-clip.mp4');
    await deleteProductVideoIfOwned('https://example.com/clip.mp4');

    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('REGRESSION: never attempts to delete a Firebase Storage URL outside the products/ folder (e.g. the hero video)', async () => {
    const heroUrl =
      'https://firebasestorage.googleapis.com/v0/b/catchy-496207.firebasestorage.app/o/hero%2Fhero-video-123.mp4?alt=media&token=xyz';

    await deleteProductVideoIfOwned(heroUrl);

    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('is a no-op for null/undefined/empty — safe to call unconditionally', async () => {
    await deleteProductVideoIfOwned(null);
    await deleteProductVideoIfOwned(undefined);
    await deleteProductVideoIfOwned('');

    expect(deleteStorageObjectMock).not.toHaveBeenCalled();
  });

  it('does not throw if the underlying delete fails (already gone)', async () => {
    deleteStorageObjectMock.mockRejectedValueOnce(new Error('object-not-found'));
    const url =
      'https://firebasestorage.googleapis.com/v0/b/catchy-496207.firebasestorage.app/o/products%2Fvideo-gone.mp4?alt=media&token=xyz';

    await expect(deleteProductVideoIfOwned(url)).resolves.toBeUndefined();
  });
});
