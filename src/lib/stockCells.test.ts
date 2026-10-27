import { describe, it, expect } from 'vitest';
import { colorVariantsForWrite, exactStockCell, parseColorVariants } from './productVariants';

const colourProduct = {
  colorVariants: [
    { id: 'red', name: 'Red', nameAr: 'أحمر', hex: '#c00', images: ['https://img.example.test/r.jpg'], sizeStock: { S: 3, M: 0 }, order: 1 },
    { id: 'navy', name: 'Navy', images: ['n.jpg'], sizeStock: { S: 2 } },
  ],
  defaultColorId: 'red',
};

describe('exactStockCell — the exact colour/size an order line refers to, never a fallback', () => {
  it('finds the exact colour + size', () => {
    expect(exactStockCell(colourProduct, 'red', 'S')).toEqual({ ok: true, available: 3, colorId: 'red', size: 'S' });
    expect(exactStockCell(colourProduct, 'red', 'M')).toEqual({ ok: true, available: 0, colorId: 'red', size: 'M' });
  });

  it.each([
    ['a removed colour (no fallback to the default colour)', colourProduct, 'blue', 'S', 'variant_missing'],
    ['a line without a colour on a colour product', colourProduct, null, 'S', 'variant_missing'],
    ['a removed size of an existing colour', colourProduct, 'navy', 'M', 'size_missing'],
    ['a line without a size on a colour product', colourProduct, 'red', null, 'size_missing'],
    ['a deleted product', null, 'red', 'S', 'product_missing'],
    ['a removed size (no fallback to the first size)', { sizeStock: { S: 2 } }, null, 'M', 'size_missing'],
    ['a sized product line without a size', { sizeStock: { S: 2 } }, null, null, 'size_missing'],
    ['a colour on a product that no longer has colours', { sizeStock: { S: 2 } }, 'red', 'S', 'variant_missing'],
    ['a size on a product without sizes', { stock: 4 }, null, 'M', 'size_missing'],
  ])('refuses %s', (_label, product, colorId, size, reason) => {
    expect(exactStockCell(product as Record<string, unknown> | null, colorId, size)).toEqual({ ok: false, reason });
  });

  it('plain products use their total stock', () => {
    expect(exactStockCell({ stock: 4 }, null, null)).toEqual({ ok: true, available: 4, colorId: null, size: null });
  });
});

describe('colorVariantsForWrite — stored colour objects back, only sizeStock changed, nothing undefined', () => {
  it('keeps every stored field (incl. missing nameAr/hex staying absent) and replaces only sizeStock', () => {
    const working = parseColorVariants(colourProduct.colorVariants).map((v) => (v.id === 'navy' ? { ...v, sizeStock: { S: 1 } } : v));
    const written = colorVariantsForWrite(colourProduct.colorVariants, working) as Record<string, unknown>[];
    expect(written[0]).toEqual(colourProduct.colorVariants[0]);
    expect(written[1]).toEqual({ id: 'navy', name: 'Navy', images: ['n.jpg'], sizeStock: { S: 1 } });
    expect(Object.keys(written[1]!)).not.toContain('nameAr');
    expect(JSON.stringify(written)).not.toContain('undefined');
    // the parsed copy itself would have carried undefined values
    expect(Object.prototype.hasOwnProperty.call(working[1]!, 'nameAr')).toBe(true);
    expect(working[1]!.nameAr).toBeUndefined();
  });
});
