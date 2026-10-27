import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Renders the real dashboard with Firestore stubbed: queries are tagged by
// collection + filters so each getDocs call returns the right fixture.
type Q = { col: string; parts: unknown[] };

const fx = vi.hoisted(() => ({
  productsFail: false,
  products: [] as { id: string; data: Record<string, unknown> }[],
  windowOrders: [] as { id: string; data: Record<string, unknown> }[],
}));

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  size: docs.length,
});

vi.mock('../firebase', () => {
  const fn = () => vi.fn();
  return {
    app: {},
    db: {},
    auth: { currentUser: null },
    mergeShopCategoryTileImage: fn(),
    collection: vi.fn((_db: unknown, col: string) => ({ col, parts: [] })),
    query: vi.fn((base: Q, ...parts: unknown[]) => ({ col: base.col, parts })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ where: [field, op, value] })),
    orderBy: vi.fn((field: string) => ({ orderBy: field })),
    limit: vi.fn((n: number) => ({ limit: n })),
    getDocs: vi.fn(async (q: Q) => {
      if (q.col === 'products') {
        if (fx.productsFail) throw new Error('permission-denied');
        return snap(fx.products);
      }
      const where = q.parts.find((p) => (p as { where?: unknown[] }).where) as { where: unknown[] } | undefined;
      if (where?.where[0] === 'status') return snap([]); // cancelled orders
      if (q.parts.some((p) => (p as { limit?: number }).limit)) return snap(fx.windowOrders.slice(0, 5)); // recent
      return snap(fx.windowOrders); // 60-day window
    }),
    getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 7 }) })),
    getAggregateFromServer: vi.fn(async () => ({ data: () => ({ revenue: 1234 }) })),
    sum: fn(), count: fn(),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    onSnapshot: vi.fn((_q: unknown, next: (s: { size: number }) => void) => {
      next({ size: 4 });
      return () => {};
    }),
    doc: fn(), setDoc: fn(), addDoc: fn(), updateDoc: fn(), deleteDoc: fn(), getDocsFromCache: fn(),
    serverTimestamp: fn(), startAfter: fn(), runTransaction: fn(), documentId: fn(), deleteField: fn(),
    GoogleAuthProvider: fn(), signInWithPopup: fn(), signOut: fn(), signInWithEmailAndPassword: fn(),
    createUserWithEmailAndPassword: fn(), updateProfile: fn(), onAuthStateChanged: fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'owner-1' }, role: 'admin', loading: false, roleResolving: false }),
}));
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en', isRTL: false }),
}));

import AdminDashboard from './AdminDashboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';

async function renderDashboard() {
  await act(async () => {
    root.render(h(MemoryRouter, null, h(AdminDashboard)));
  });
  // Let the Promise.allSettled chain resolve.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  fx.productsFail = false;
  fx.products = [
    { id: 'p-low', data: { name: 'Linen Dress', colorVariants: [{ id: 'r', name: 'Red', images: [], sizeStock: { S: 1, M: 9 } }] } },
    { id: 'p-ok', data: { name: 'Plenty Top', stock: 50 } },
  ];
  fx.windowOrders = [
    { id: 'order0000001', data: { status: 'pending', total: 150, customerName: 'Lina', customerPhone: '0591234567', createdAt: new Date(), items: [] } },
  ];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Admin dashboard', () => {
  it('shows real figures: no hardcoded trends, live pending count, today, names in recent orders', async () => {
    await renderDashboard();
    for (const fake of ['+12.5%', '+5.2%', '-2.1%', '+8.4%']) expect(text()).not.toContain(fake);
    expect(text()).toContain('admin.dashboard.pendingToHandle');
    expect(text()).toContain('4'); // live pending count from the listener
    expect(text()).toContain('Lina'); // customer name, not the user id
    expect(text()).toContain('#ORDER000');
    expect(container.querySelector('a[href="/admin/orders"]')).not.toBeNull(); // "View all" works
    expect(text()).toContain('ILS 1,234.00'); // all-time booked revenue from the aggregate
  });

  it('lists real low-stock products at threshold 3, including variant cells', async () => {
    await renderDashboard();
    expect(text()).toContain('Linen Dress');
    expect(text()).toContain('Red / S');
    expect(text()).not.toContain('Plenty Top');
  });

  it('keeps the demo seed button available in local development', async () => {
    vi.stubEnv('DEV', true);
    await renderDashboard();
    expect(text()).toContain('admin.dashboard.seedButton');
    vi.unstubAllEnvs();
  });

  it('hides the demo seed button outside local development', async () => {
    vi.stubEnv('DEV', false);
    await renderDashboard();
    expect(text()).not.toContain('admin.dashboard.seedButton');
    vi.unstubAllEnvs();
  });

  it('shows a visible error instead of silent zeros when a source fails', async () => {
    fx.productsFail = true;
    await renderDashboard();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('admin.dashboard.loadError');
    expect(text()).toContain('admin.dashboard.lowStockUnavailable');
  });
});
