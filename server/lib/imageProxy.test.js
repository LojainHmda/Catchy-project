import { describe, it, expect } from 'vitest';
import { isAllowedImageUrl, proxyImage } from './imageProxy.js';

// The invoice canvas loads product photos through /api/image-proxy. Photos uploaded
// since the Cloudinary pipeline live on res.cloudinary.com — they were refused (403),
// so invoices came out without product images.
const own = { cloudinaryCloudName: 'catchy-store' };

describe('image proxy allowlist', () => {
  it('relays this store\'s own Cloudinary images (plain and resized)', () => {
    expect(isAllowedImageUrl('https://res.cloudinary.com/catchy-store/image/upload/v1/products/a.jpg', own)).toBe(true);
    expect(isAllowedImageUrl('https://res.cloudinary.com/catchy-store/image/upload/w_144,c_limit,q_auto,f_auto/v1/products/a.jpg', own)).toBe(true);
  });

  it('still relays Firebase / Google Storage photos (older products)', () => {
    expect(isAllowedImageUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media', own)).toBe(true);
    expect(isAllowedImageUrl('https://storage.googleapis.com/kartacagenai-catchy-media/a.jpg', own)).toBe(true);
  });

  it.each([
    ['another Cloudinary account', 'https://res.cloudinary.com/someone-else/image/upload/a.jpg'],
    ['a non-image Cloudinary resource', 'https://res.cloudinary.com/catchy-store/raw/upload/a.txt'],
    ['a look-alike host', 'https://res.cloudinary.com.evil.io/catchy-store/image/upload/a.jpg'],
    ['plain http', 'http://res.cloudinary.com/catchy-store/image/upload/a.jpg'],
    ['an unrelated host', 'https://example.com/a.jpg'],
    ['garbage', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(isAllowedImageUrl(url, own)).toBe(false);
  });

  it('fails closed when the store\'s cloud name is not configured', () => {
    expect(isAllowedImageUrl('https://res.cloudinary.com/catchy-store/image/upload/a.jpg', { cloudinaryCloudName: '' })).toBe(false);
  });

  it('proxyImage answers 403 for a refused URL without fetching it', async () => {
    const res = { statusCode: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
    await proxyImage('https://example.com/a.jpg', res);
    expect(res.statusCode).toBe(403);
  });
});
