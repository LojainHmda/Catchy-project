import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en', isRTL: false }),
}));

import PosProductGrid from './PosProductGrid';
import { toPosProduct } from '../../lib/pos/posProduct';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Real Firestore-shaped docs through the real POS mapping.
const products = [
  toPosProduct('velvet', { name: 'قميص مخمل', price: 120, category: 'Shirts', sizeStock: { S: 1, M: 2 }, stock: 3, visible: true }),
  toPosProduct('hidden', { name: 'قميص طويل', price: 90, category: 'Shirts', stock: 4, visible: false }),
  toPosProduct('soldout', { name: 'قميص براشوت', price: 80, category: 'Shirts', sizeStock: { S: 0, M: 0 }, stock: 0 }),
  toPosProduct('variants-soldout', {
    name: 'Variant sold out',
    price: 60,
    category: 'Shirts',
    colorVariants: [{ id: 'c1', name: 'Black', sizeStock: { S: 0 } }],
    stock: 0,
  }),
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (search: string) =>
  act(() =>
    root.render(
      h(PosProductGrid, {
        products,
        loading: false,
        search,
        onSearchChange: () => {},
        selection: { kind: 'all' },
        onQuickAdd: () => {},
        onOpenPicker: () => {},
        onScanQr: () => {},
      })
    )
  );

describe('POS grid', () => {
  it('offers in-stock products — including one hidden from the online store — and no sold-out ones', () => {
    render('');
    const text = container.textContent ?? '';
    expect(text).toContain('قميص مخمل');
    expect(text).toContain('قميص طويل');
    expect(text).not.toContain('قميص براشوت');
    expect(text).not.toContain('Variant sold out');
  });

  it('search does not bring a sold-out product back', () => {
    render('قميص');
    const text = container.textContent ?? '';
    expect(text).toContain('قميص مخمل');
    expect(text).toContain('قميص طويل');
    expect(text).not.toContain('قميص براشوت');
  });
});
