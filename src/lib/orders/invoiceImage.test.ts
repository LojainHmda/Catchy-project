import { describe, it, expect } from 'vitest';
import { canvasSafeSrc, invoiceThumbSrc } from './invoiceImage';

describe('invoice product photo URLs', () => {
  it('asks Cloudinary for a small thumbnail instead of the full upload', () => {
    expect(invoiceThumbSrc('https://res.cloudinary.com/c/image/upload/v1/products/a.jpg')).toBe(
      'https://res.cloudinary.com/c/image/upload/w_144,c_limit,q_auto,f_auto/v1/products/a.jpg'
    );
  });

  it('leaves Firebase Storage, local and data: images unchanged', () => {
    const fb = 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media';
    expect(invoiceThumbSrc(fb)).toBe(fb);
    expect(invoiceThumbSrc('/placeholder.png')).toBe('/placeholder.png');
    expect(invoiceThumbSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('routes remote photos through the same-origin proxy; local ones load directly', () => {
    expect(canvasSafeSrc('https://res.cloudinary.com/c/image/upload/a.jpg')).toBe(
      `/api/image-proxy?url=${encodeURIComponent('https://res.cloudinary.com/c/image/upload/a.jpg')}`
    );
    expect(canvasSafeSrc('/placeholder.png')).toBe('/placeholder.png');
  });
});
