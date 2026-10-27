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
  MAX_VIDEO_BYTES,
  MAX_VIDEO_MB,
  deleteProductVideoIfOwned,
  isVideoFile,
  storagePathFromDownloadUrl,
  uploadProductVideoFile,
  validateProductVideoFile,
} from './productVideoUpload';
import { translations } from '../context/LanguageContext';

const tEn = (key: string) => translations.en[key] ?? key;
const tAr = (key: string) => translations.ar[key] ?? key;

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

  it('the limit is 100 MB in binary units: 104,857,600 bytes', () => {
    expect(MAX_VIDEO_BYTES).toBe(104_857_600);
    expect(MAX_VIDEO_MB).toBe(100);
  });

  it('accepts a file of exactly 100 MB (the boundary is inclusive)', () => {
    expect(validateProductVideoFile(fakeVideoFile(104_857_600), tEn)).toBeNull();
  });

  it('rejects 100 MB + 1 byte, with the 100 MB limit in English and Arabic', () => {
    const tooLarge = fakeVideoFile(104_857_601);
    expect(validateProductVideoFile(tooLarge, tEn)).toBe('Video must be under 100 MB.');
    expect(validateProductVideoFile(tooLarge, tAr)).toContain('100');
    expect(validateProductVideoFile(fakeVideoFile(300 * 1024 * 1024), tEn)).toMatch(/100 MB/);
  });

  it('files between the old 50 MB and the new 100 MB limit are now accepted', () => {
    expect(validateProductVideoFile(fakeVideoFile(50 * 1024 * 1024 + 1), tEn)).toBeNull();
    expect(validateProductVideoFile(fakeVideoFile(99 * 1024 * 1024), tEn)).toBeNull();
  });

  it('the type check still applies at any size (a large image is never accepted as a video)', () => {
    expect(validateProductVideoFile(fakeVideoFile(1024, 'image/jpeg'), tEn)).toMatch(/video file/i);
    expect(validateProductVideoFile(fakeVideoFile(104_857_600, 'application/octet-stream'), tEn)).toMatch(/video file/i);
  });

  it('the form hint shows the new limit in both languages', () => {
    expect(tEn('admin.products.form.videoFormats').replace('{n}', String(MAX_VIDEO_MB))).toBe('MP4, MOV, WebM — max 100 MB');
    expect(tAr('admin.products.form.videoFormats').replace('{n}', String(MAX_VIDEO_MB))).toContain('100');
  });
});

describe('uploadProductVideoFile — re-validates before anything is uploaded', () => {
  beforeEach(() => {
    uploadFileResumableMock.mockReset();
    uploadFileResumableMock.mockResolvedValue('https://example.test/video.mp4');
  });

  it('refuses a file over 100 MB without starting an upload', async () => {
    await expect(uploadProductVideoFile(fakeVideoFile(104_857_601), () => {})).rejects.toThrow();
    expect(uploadFileResumableMock).not.toHaveBeenCalled();
  });

  it('refuses a non-video file without starting an upload', async () => {
    await expect(uploadProductVideoFile(fakeVideoFile(1024, 'image/png'), () => {})).rejects.toThrow();
    expect(uploadFileResumableMock).not.toHaveBeenCalled();
  });

  it('uploads a 100 MB video to products/ via the resumable (chunked) uploader with the File itself', async () => {
    const file = fakeVideoFile(104_857_600);
    await expect(uploadProductVideoFile(file, () => {})).resolves.toBe('https://example.test/video.mp4');
    expect(uploadFileResumableMock).toHaveBeenCalledTimes(1);
    const [path, passed] = uploadFileResumableMock.mock.calls[0]!;
    expect(path).toMatch(/^products\/video-\d+-[a-z0-9]+\.mp4$/);
    expect(passed).toBe(file); // the File (streamed in chunks by the SDK), never a buffered copy
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
