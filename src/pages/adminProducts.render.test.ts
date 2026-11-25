import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Renders the real Admin → Products page with Firestore stubbed: 133 products — far past the
// old first page of 50 — including "قميص مخمل" at position 86, a product hidden online, a
// sold-out one and a legacy sized product whose sizes are all at 0.
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
  docs.push({ id: 'hidden', data: { name: 'قميص طويل', price: 90, category: 'Shirts', stock: 4, visible: false, createdAt: at(base + 50 * 60_000) } });
  docs.push({ id: 'soldout', data: { name: 'قميص براشوت', price: 80, category: 'Shirts', sizeStock: { S: 0, M: 0 }, stock: 0, createdAt: at(base + 190 * 60_000) } });
  docs.push({ id: 'legacy', data: { name: 'Legacy sized', price: 70, category: 'Tops', sizes: ['S', 'M'], stock: 5, createdAt: at(base + 10 * 60_000) } });
  return { docs: docs.reverse() };
});

vi.mock('../firebase', () => ({
  db: {},
  doc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(() => 'products-ref'),
  getDocs: vi.fn(async () => ({ docs: fx.docs.map((d) => ({ id: d.id, data: () => d.data })) })),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
}));
vi.mock('../lib/coordinatesService', () => ({ subscribeCoordinateLooks: () => () => {} }));
vi.mock('../lib/seed', () => ({ seedDressPants: vi.fn() }));
vi.mock('../lib/admin/deleteProduct', () => ({ deleteProductPermanently: vi.fn() }));
vi.mock('../components/admin/AdminProductFormModal', () => ({ default: () => null }));
vi.mock('../components/admin/AdminProductQrModal', () => ({ default: () => null }));
vi.mock('../components/admin/AdminProductBarcodeModal', () => ({ default: () => null }));
vi.mock('../components/admin/AdminCategoriesPanel', () => ({ default: () => null }));
vi.mock('../context/LanguageContext', () => {
  const templates: Record<string, string> = {
    'admin.products.page.showingCount': 'Showing {shown} of {total} products',
    'admin.products.page.stockOut': 'Out of stock ({n})',
  };
  return { useLanguage: () => ({ t: (k: string) => templates[k] ?? k, language: 'en', isRTL: false }) };
});

import { getDocs, limit, orderBy, startAfter } from '../firebase';
import AdminProducts from './AdminProducts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function setInput(el: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change') {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

// Captured while the page loads (mock call history may be cleared between tests).
const load = { getDocsArgs: [] as unknown[][], orderBy: 0, limit: 0, startAfter: 0 };

beforeAll(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(h(MemoryRouter, null, h(AdminProducts))));
  await flush();
  load.getDocsArgs = vi.mocked(getDocs).mock.calls.map((c) => [...c]);
  load.orderBy = vi.mocked(orderBy).mock.calls.length;
  load.limit = vi.mocked(limit).mock.calls.length;
  load.startAfter = vi.mocked(startAfter).mock.calls.length;
});
afterAll(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Admin → Products covers the whole catalog', () => {
  it('loads every product in one read — no first page, no "Load more"', () => {
    expect(load.getDocsArgs).toEqual([['products-ref']]);
    expect(load).toMatchObject({ orderBy: 0, limit: 0, startAfter: 0 });
    expect(text()).toContain('Showing 133 of 133 products');
    expect(text()).not.toContain('admin.products.page.loadMore');
  });

  it('search finds a product far down the list ("قميص مخمل", position 86) without loading more', async () => {
    const search = container.querySelector<HTMLInputElement>('input[type=search]')!;
    await setInput(search, 'قميص مخمل', 'input');
    expect(text()).toContain('Showing 1 of 133 products');
    expect(text()).toContain('قميص مخمل');
    await setInput(search, '', 'input');
  });

  it('keeps sold-out and hidden products listed; "Out of stock" = exactly what the store and POS hide', async () => {
    expect(text()).toContain('قميص طويل'); // hidden online — still managed here
    expect(text()).toContain('قميص براشوت'); // sold out — still managed here
    const select = container.querySelector<HTMLSelectElement>('select')!;
    expect(select.textContent).toContain('Out of stock (2)');
    await setInput(select, 'out', 'change');
    expect(text()).toContain('Showing 2 of 133 products');
    expect(text()).toContain('قميص براشوت');
    expect(text()).toContain('Legacy sized'); // sizes listed, all at 0 → sold out everywhere
    expect(text()).not.toContain('قميص طويل'); // hidden online but in stock → not "out"
    await setInput(select, 'all', 'change');
  });
});
