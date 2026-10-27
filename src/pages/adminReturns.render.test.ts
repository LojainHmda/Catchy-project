import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Renders the Returns page + detail dialog against fixture return documents.
// Firestore reads are stubbed; writes only happen through the (stubbed) owner endpoints.
const fx = vi.hoisted(() => ({
  docs: [] as { id: string; data: Record<string, unknown> }[],
  getIdToken: vi.fn(async () => 'test-token'),
}));

vi.mock('../firebase', () => {
  const fn = () => vi.fn();
  return {
    app: {},
    db: {},
    auth: { currentUser: { uid: 'owner-1', getIdToken: fx.getIdToken } },
    collection: fn(), doc: fn(), getDoc: fn(),
    getDocs: vi.fn(async () => ({ docs: fx.docs.map((d) => ({ id: d.id, data: () => d.data })) })),
    query: fn(), where: fn(), orderBy: fn(), limit: fn(), onSnapshot: vi.fn(() => () => {}),
    updateDoc: fn(), setDoc: fn(), addDoc: fn(), deleteDoc: fn(), runTransaction: fn(), serverTimestamp: fn(),
  };
});

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en', isRTL: false, setLanguage: () => {} }),
}));

import AdminReturns from './AdminReturns';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ret = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  data: {
    orderId: 'test-o-delivered', productId: 'test-skirt', productName: 'Test Linen Skirt (S)', size: 'S', quantity: 1,
    reason: 'wrong_size', status: 'quarantine', disposition: null, customerName: 'Test Customer D',
    createdAt: new Date('2026-10-25T10:00:00Z'), history: [], ...overrides,
  },
});

let container: HTMLDivElement;
let root: Root;
const render = (path: string) => act(async () => root.render(h(MemoryRouter, { initialEntries: [path] }, h(AdminReturns))));
const text = () => document.body.textContent ?? '';
const byText = (label: string) => [...document.querySelectorAll<HTMLElement>('button')].find((el) => el.textContent?.trim() === label);

beforeEach(() => {
  fx.docs = [ret('r-open'), ret('r-done', { status: 'resolved', disposition: 'damaged', productName: 'Test Silk Scarf' })];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Returns page', () => {
  it('shows what is still on the shelf by default', async () => {
    await render('/admin/returns');
    expect(text()).toContain('Test Linen Skirt (S)');
    expect(text()).not.toContain('Test Silk Scarf'); // resolved → not in the default "on shelf" filter
  });

  it('restock refused by the server (size removed): explains why, disables restock, writes nothing else', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, code: 'RESTOCK_NOT_POSSIBLE', skipReason: 'size_missing', message: 'x' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await render('/admin/returns?return=r-open');
    expect(text()).toContain('admin.returns.detail.notSellable');

    await act(async () => byText('admin.returns.detail.choose.restocked')!.click());
    await act(async () => byText('admin.returns.detail.confirmResolve')!.click());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/returns/resolve');
    expect(JSON.parse(String(init.body))).toMatchObject({ returnId: 'r-open', disposition: 'restocked' });
    expect(text()).toContain('admin.returns.detail.restockBlocked');
    expect(byText('admin.returns.detail.choose.restocked')).toHaveProperty('disabled', true);
  });

  it('manual review requires a note before it can be confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await render('/admin/returns?return=r-open');
    await act(async () => byText('admin.returns.detail.choose.manual_review')!.click());
    expect(byText('admin.returns.detail.confirmResolve')).toHaveProperty('disabled', true);
  });

  it('a resolved return shows its outcome and offers no further actions', async () => {
    await render('/admin/returns?return=r-done');
    expect(text()).toContain('admin.returns.detail.stockUnchanged');
    expect(byText('admin.returns.detail.choose.restocked')).toBeUndefined();
  });
});
