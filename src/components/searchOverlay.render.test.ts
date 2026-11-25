import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The REAL header search + REAL catalogService, with only Firestore stubbed: 130 products
// ("قميص مخمل" is the 86th newest), plus one hidden online and one sold out.
const fx = vi.hoisted(() => {
  const at = (ms: number) => ({ toDate: () => new Date(ms) });
  const base = Date.UTC(2026, 9, 1);
  const docs: { id: string; data: Record<string, unknown> }[] = [];
  for (let i = 0; i < 130; i++) {
    docs.push({
      id: `p${i}`,
      data: {
        name: i === 85 ? 'قميص مخمل' : `Product ${i}`,
        price: 100,
        category: 'Shirts',
        sizeStock: { S: 1, M: 2 },
        stock: 3,
        visible: true,
        createdAt: at(base + (200 - i) * 60_000),
      },
    });
  }
  docs.push({ id: 'hidden', data: { name: 'قميص مخمل طويل', price: 90, stock: 4, visible: false, createdAt: at(base) } });
  docs.push({ id: 'soldout', data: { name: 'قميص مخمل براشوت', price: 80, sizeStock: { S: 0 }, stock: 0, createdAt: at(base + 300 * 60_000) } });
  return { docs };
});

vi.mock('../firebase', () => ({
  db: {},
  collection: vi.fn(() => 'products-ref'),
  getDocsFromServer: vi.fn(async () => ({ docs: fx.docs.map((d) => ({ id: d.id, data: () => d.data })) })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  documentId: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en', isRTL: false }),
}));

import { limit } from '../firebase';
import SearchOverlay from './SearchOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const resultIds = () =>
  [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/product/"]')].map((a) => a.getAttribute('href')!.slice('/product/'.length));

async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type=search]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeAll(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(h(MemoryRouter, null, h(SearchOverlay))));
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="catalog.search"]')!.click());
  await flush();
});
afterAll(() => {
  act(() => root.unmount());
  container.remove();
});

describe('store header search', () => {
  it('finds "قميص مخمل" — a product past the old 80-product cut-off', async () => {
    expect(limit).not.toHaveBeenCalled();
    await search('قميص مخمل');
    expect(resultIds()).toEqual(['p85']);
  });

  it('never shows a product that is hidden online or sold out (same rule as the catalog grid)', async () => {
    await search('مخمل');
    expect(resultIds()).not.toContain('hidden');
    expect(resultIds()).not.toContain('soldout');
  });
});
