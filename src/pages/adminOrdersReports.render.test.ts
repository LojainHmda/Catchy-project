import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OrderRecord } from '../types/order';

// Renders the real Orders page (+ detail modal + web cancel dialog) and the
// Reports page against fixture orders. Firebase, auth and translations are
// stubbed; `t` returns the key so assertions don't depend on wording.
const fx = vi.hoisted(() => ({
  orders: [] as OrderRecord[],
  patchOrder: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  getIdToken: vi.fn(async () => 'test-token'),
  reload: vi.fn(),
  // What Firestore currently holds (may differ from the list the screen loaded).
  stored: new Map<string, Record<string, unknown>>(),
  txUpdates: [] as [string, Record<string, unknown>][],
}));

vi.mock('../firebase', () => {
  const fn = () => vi.fn();
  return {
    app: {},
    db: {},
    auth: { currentUser: { uid: 'owner-1', getIdToken: fx.getIdToken } },
    mergeShopCategoryTileImage: fn(),
    collection: fn(), doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })), getDoc: fn(), getDocs: fn(),
    getDocsFromCache: fn(), setDoc: fn(), updateDoc: fx.updateDoc, deleteDoc: fn(), addDoc: fn(),
    onSnapshot: vi.fn(() => () => {}), query: fn(), where: fn(), orderBy: fn(), limit: fn(), startAfter: fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    runTransaction: vi.fn(async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
      run({
        get: async (ref: { path: string }) => ({ exists: () => fx.stored.has(ref.path), data: () => fx.stored.get(ref.path) }),
        update: (ref: { path: string }, patch: Record<string, unknown>) => {
          fx.txUpdates.push([ref.path, patch]);
          fx.stored.set(ref.path, { ...fx.stored.get(ref.path), ...patch });
        },
      })
    ), documentId: fn(), deleteField: fn(),
    getCountFromServer: fn(), getAggregateFromServer: fn(), count: fn(), sum: fn(),
    GoogleAuthProvider: fn(), signInWithPopup: fn(), signOut: fn(), signInWithEmailAndPassword: fn(),
    createUserWithEmailAndPassword: fn(), updateProfile: fn(), onAuthStateChanged: fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'owner-1', email: 'owner@example.com', displayName: 'Owner' },
    role: 'admin',
    loading: false,
    roleResolving: false,
  }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en', isRTL: false, setLanguage: () => {} }),
}));

vi.mock('../hooks/useOrdersList', () => ({
  useOrdersList: () => ({
    orders: fx.orders,
    loading: false,
    refreshing: false,
    error: null,
    reload: fx.reload,
    patchOrder: fx.patchOrder,
  }),
}));

import AdminOrders from './AdminOrders';
import AdminReports from './AdminReports';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function order(overrides: Partial<OrderRecord>): OrderRecord {
  return {
    id: 'aaaaaaaa1111',
    userId: 'cust-1',
    isGuest: false,
    customerEmail: 'lina@example.com',
    customerName: 'Lina',
    customerPhone: '0591234567',
    deliveryAddress: 'Ramallah',
    deliveryZone: 'west_bank',
    status: 'pending',
    subtotal: 100,
    shippingCost: 20,
    total: 120,
    itemCount: 1,
    createdAt: new Date(),
    items: [{ productId: 'p1', name: 'Dress (Red / M)', price: 100, quantity: 1, image: '', lineTotal: 100, size: 'M', colorId: 'red', colorName: 'Red' }],
    source: 'web',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

const render = (element: ReturnType<typeof h>, path = '/admin/orders') =>
  act(() => root.render(h(MemoryRouter, { initialEntries: [path] }, element)));
const text = () => document.body.textContent ?? '';
const byText = (label: string, tag = 'button') =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === label);

beforeEach(() => {
  fx.orders = [
    order({ id: 'aaaaaaaa1111', customerName: 'Lina', total: 120 }),
    order({ id: 'bbbbbbbb2222', customerName: 'Omar', customerPhone: '0560000000', status: 'shipped', total: 300 }),
    order({ id: 'cccccccc3333', customerName: 'Walk-in', customerPhone: null, source: 'pos', status: 'completed', total: 80, userId: 'cashier-1' }),
  ];
  fx.patchOrder.mockReset();
  fx.updateDoc.mockClear();
  fx.reload.mockClear();
  fx.txUpdates = [];
  fx.stored = new Map(fx.orders.map((o) => [`orders/${o.id}`, { status: o.status, source: o.source, items: o.items }]));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Orders page', () => {
  it('lists orders, filters by phone digits, and honours ?status=', async () => {
    render(h(AdminOrders));
    expect(text()).toContain('#AAAAAAAA');
    expect(text()).toContain('#BBBBBBBB');

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search, '+970 56 000 0000');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('#BBBBBBBB');
    expect(text()).not.toContain('#AAAAAAAA');

    act(() => root.unmount());
    root = createRoot(container);
    render(h(AdminOrders), '/admin/orders?status=shipped');
    expect(text()).toContain('#BBBBBBBB');
    expect(text()).not.toContain('#AAAAAAAA');
  });

  it('bulk-moves eligible orders forward, skips POS sales, and stamps who did it', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(h(AdminOrders));
    const selectAll = container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!;
    await act(async () => selectAll.click());
    expect(text()).toContain('admin.orders.page.selectedCount');

    const select = [...container.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === 'admin.orders.page.bulkSetStatus')!;
    await act(async () => {
      select.value = 'delivered';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => byText('admin.orders.page.bulkApply')!.click());

    // Two web orders updated (each in a transaction against stored state); the completed POS sale is skipped.
    expect(fx.txUpdates.map(([path]) => path).sort()).toEqual(['orders/aaaaaaaa1111', 'orders/bbbbbbbb2222']);
    expect(fx.txUpdates[0]![1]).toMatchObject({ status: 'delivered', statusUpdatedByUid: 'owner-1', statusUpdatedByName: 'Owner' });
    expect(fx.patchOrder).not.toHaveBeenCalledWith('cccccccc3333', expect.anything());
  });

  it('a stale list cannot move an order that was cancelled elsewhere; it reloads instead (V1)', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(h(AdminOrders));
    // Cancelled in another tab after this list loaded (the screen still shows it as pending).
    fx.stored.set('orders/aaaaaaaa1111', {
      ...fx.stored.get('orders/aaaaaaaa1111'),
      status: 'cancelled',
      cancellation: { cancelledByUid: 'owner-2', reason: 'other tab' },
    });
    await act(async () => container.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!.click());
    const select = [...container.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === 'admin.orders.page.bulkSetStatus')!;
    await act(async () => {
      select.value = 'delivered';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => byText('admin.orders.page.bulkApply')!.click());

    // Only the still-valid order was written; the cancelled one was refused inside its transaction.
    expect(fx.txUpdates.map(([path]) => path)).toEqual(['orders/bbbbbbbb2222']);
    expect(fx.stored.get('orders/aaaaaaaa1111')!.status).toBe('cancelled');
    expect(fx.patchOrder).not.toHaveBeenCalledWith('aaaaaaaa1111', expect.anything());
    expect(fx.reload).toHaveBeenCalledWith(true);
  });
});

describe('Order detail + web cancellation', () => {
  it('shows customer history and cancels through the owner-only endpoint with the sign-in token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        alreadyCancelled: false,
        cancellation: {
          cancelledAt: new Date().toISOString(), cancelledByUid: 'owner-1', cancelledByName: 'owner@example.com',
          reason: 'Customer asked', previousStatus: 'pending', restockApplied: true,
          restoredLines: [{ productId: 'p1', quantity: 1 }], skippedLines: [],
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(h(AdminOrders), '/admin/orders?order=aaaaaaaa1111');
    expect(text()).toContain('admin.orders.detail.history');
    expect(text()).toContain('admin.orders.detail.adminNote');

    await act(async () => byText('admin.orders.detail.cancelOrder')!.click());
    expect(text()).toContain('admin.orders.webCancel.restockInfo');

    const reason = document.querySelector<HTMLTextAreaElement>('#web-cancel-reason')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(reason, 'Customer asked');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => byText('admin.orders.cancel.reviewButton')!.click());
    await act(async () => byText('admin.orders.webCancel.confirmButton')!.click());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/orders/cancel');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(JSON.parse(String(init.body))).toMatchObject({ orderId: 'aaaaaaaa1111', reason: 'Customer asked', restock: true });
    expect(fx.patchOrder).toHaveBeenCalledWith('aaaaaaaa1111', expect.objectContaining({ status: 'cancelled' }));
  });

  it('a shipped order requires the admin to say whether goods came back', async () => {
    render(h(AdminOrders), '/admin/orders?order=bbbbbbbb2222');
    await act(async () => byText('admin.orders.detail.cancelOrder')!.click());
    expect(text()).toContain('admin.orders.webCancel.shippedQuestion');
    expect(document.querySelectorAll('input[name="web-cancel-restock"]')).toHaveLength(2);
  });

  it('a cancellation that restored nothing says so (not "restored for 0 lines") and lists why (V6)', async () => {
    fx.orders = [
      order({
        id: 'dddddddd4444',
        status: 'cancelled',
        cancellation: {
          cancelledAt: new Date(), cancelledByUid: 'owner-1', cancelledByName: 'owner@example.com', reason: 'x',
          registerSessionStatusAtCancellation: null, previousStatus: 'pending', restockApplied: true, restoredLines: [],
          skippedLines: [{ productId: 'p1', name: 'Dress', colorId: 'red', size: 'M', quantity: 1, reason: 'variant_missing' }],
        },
      }),
    ];
    render(h(AdminOrders), '/admin/orders?order=dddddddd4444');
    expect(text()).toContain('admin.orders.detail.restockNone');
    expect(text()).not.toContain('admin.orders.detail.restockSummary');
    expect(text()).toContain('admin.orders.detail.skipVariantMissing');
    expect(byText('admin.orders.detail.cancelOrder')).toBeUndefined();
  });

  it('never offers web cancellation on a POS sale', async () => {
    render(h(AdminOrders), '/admin/orders?order=cccccccc3333');
    expect(byText('admin.orders.detail.cancelOrder')).toBeUndefined();
    expect(text()).toContain('admin.orders.detail.historyWalkIn');
  });
});

describe('Needs review bucket (P0)', () => {
  it('lists an unknown stored status under Needs review and never counts it as pending', async () => {
    fx.orders = [
      order({ id: 'aaaaaaaa1111', status: 'pending' }),
      order({ id: 'eeeeeeee5555', status: 'pending', statusUnrecognized: true, statusNeedsReview: true, rawStatus: 'Refunded' }),
    ];
    render(h(AdminOrders));
    const pendingCard = container.querySelector<HTMLButtonElement>('[data-status-card="pending"]')!;
    const reviewCard = container.querySelector<HTMLButtonElement>('[data-status-card="needs_review"]')!;
    // Status cards show the count, then the label (+ status icon).
    expect(pendingCard.textContent).toBe('1orders.status.pending 📥');
    expect(reviewCard.textContent).toBe('1orders.status.needs_review ⚠️');
    expect(text()).toContain('"Refunded"'); // the raw stored value is shown on the badge

    await act(async () => reviewCard.click());
    expect(reviewCard.getAttribute('aria-pressed')).toBe('true');
    expect(text()).toContain('#EEEEEEEE');
    expect(text()).not.toContain('#AAAAAAAA');

    // Clicking the active card again clears the filter (Sisley behaviour).
    await act(async () => reviewCard.click());
    expect(reviewCard.getAttribute('aria-pressed')).toBe('false');
    expect(text()).toContain('#AAAAAAAA');
  });
});

describe('Orders page — Sisley-style visual design', () => {
  const rowOf = (shortId: string) =>
    [...container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((tr) => tr.textContent?.includes(shortId))!;
  const iconIn = (el: Element, label: string) => el.querySelector<HTMLElement>(`[aria-label="${label}"]`);

  it('renders one saturated card per status with Sisley colours, and the status filter dropdown includes Needs review', async () => {
    render(h(AdminOrders));
    const cards = [...container.querySelectorAll<HTMLButtonElement>('[data-status-card]')];
    expect(cards.map((c) => c.dataset.statusCard)).toEqual([
      'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed', 'needs_review',
    ]);
    const cls = (status: string) => container.querySelector(`[data-status-card="${status}"]`)!.className;
    expect(cls('pending')).toContain('bg-purple-600');
    expect(cls('processing')).toContain('bg-orange-600');
    expect(cls('shipped')).toContain('bg-blue-600');
    expect(cls('delivered')).toContain('bg-amber-500');
    expect(cls('cancelled')).toContain('bg-red-600');
    expect(cls('completed')).toContain('bg-teal-600');
    expect(cls('needs_review')).toContain('bg-fuchsia-600');

    const statusSelect = [...container.querySelectorAll('select')].find((sel) => sel.getAttribute('aria-label') === 'admin.common.status')!;
    expect([...statusSelect.options].map((o) => o.value)).toEqual([
      'all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed', 'needs_review',
    ]);
    await act(async () => {
      statusSelect.value = 'shipped';
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(text()).toContain('#BBBBBBBB');
    expect(text()).not.toContain('#AAAAAAAA');
  });

  it('row badges use the Sisley pill with a status icon; customer-facing badges are unchanged', async () => {
    render(h(AdminOrders));
    const badge = rowOf('#AAAAAAAA').querySelector<HTMLElement>('[data-status="pending"]')!;
    expect(badge.textContent).toBe('orders.status.pending📥');
    expect(badge.className).toContain('bg-[#efeae1]'); // Sisley "neutral" tone
    const shipped = rowOf('#BBBBBBBB').querySelector<HTMLElement>('[data-status="shipped"]')!;
    expect(shipped.textContent).toContain('✈️');
  });

  it('row quick actions follow the same eligibility as the detail view (no actions on POS sales)', async () => {
    fx.orders = [
      order({ id: 'aaaaaaaa1111', status: 'pending' }),
      order({ id: 'bbbbbbbb2222', status: 'shipped' }),
      order({ id: 'dddddddd4444', status: 'delivered' }),
      order({ id: 'cccccccc3333', status: 'completed', source: 'pos', customerPhone: null }),
      order({ id: 'eeeeeeee5555', status: 'pending', statusUnrecognized: true, statusNeedsReview: true, rawStatus: 'Refunded' }),
    ];
    render(h(AdminOrders));
    const cancel = 'admin.orders.detail.cancelOrder';
    const ret = 'admin.returns.processReturn';
    // pending web: cancel only
    expect(iconIn(rowOf('#AAAAAAAA'), cancel)).not.toBeNull();
    expect(iconIn(rowOf('#AAAAAAAA'), ret)).toBeNull();
    // shipped web: both (cancellable and returnable)
    expect(iconIn(rowOf('#BBBBBBBB'), cancel)).not.toBeNull();
    expect(iconIn(rowOf('#BBBBBBBB'), ret)).not.toBeNull();
    // delivered web: return only
    expect(iconIn(rowOf('#DDDDDDDD'), cancel)).toBeNull();
    expect(iconIn(rowOf('#DDDDDDDD'), ret)).not.toBeNull();
    // POS sale and an unrecognised legacy status: neither
    for (const id of ['#CCCCCCCC', '#EEEEEEEE']) {
      expect(iconIn(rowOf(id), cancel)).toBeNull();
      expect(iconIn(rowOf(id), ret)).toBeNull();
    }
    // Every row still offers view / invoice / copy link; call only when there is a phone.
    expect(iconIn(rowOf('#AAAAAAAA'), 'admin.orders.page.viewOrder')).not.toBeNull();
    expect(iconIn(rowOf('#AAAAAAAA'), 'invoice.download')).not.toBeNull();
    expect(iconIn(rowOf('#AAAAAAAA'), 'admin.orders.detail.callCustomer')!.getAttribute('href')).toBe('tel:0591234567');
    expect(iconIn(rowOf('#CCCCCCCC'), 'admin.orders.detail.callCustomer')).toBeNull();
  });

  it('an order with returns shows no cancel action in its row', async () => {
    fx.orders = [
      order({
        id: 'bbbbbbbb2222',
        status: 'shipped',
        returnSummary: { returnCount: 1, openCount: 1, returnedQtyByKey: { 'p1|~|red|~|M': 1 }, lastReturnAt: null },
      }),
    ];
    render(h(AdminOrders));
    expect(iconIn(rowOf('#BBBBBBBB'), 'admin.orders.detail.cancelOrder')).toBeNull();
    // the only unit was returned already → no return action either; the returns marker is shown instead
    expect(iconIn(rowOf('#BBBBBBBB'), 'admin.returns.processReturn')).toBeNull();
    expect(iconIn(rowOf('#BBBBBBBB'), 'admin.returns.chipOpen')).not.toBeNull();
  });

  it('row cancel / return actions open the same guarded dialogs (owner endpoints) without opening the detail', async () => {
    fx.orders = [order({ id: 'bbbbbbbb2222', status: 'shipped' })];
    render(h(AdminOrders));
    await act(async () => iconIn(rowOf('#BBBBBBBB'), 'admin.orders.detail.cancelOrder')!.click());
    expect(text()).toContain('admin.orders.webCancel.shippedQuestion');
    expect(text()).not.toContain('admin.orders.detail.history'); // the detail dialog did not open
    await act(async () => byText('admin.orders.webCancel.keep')!.click());

    await act(async () => iconIn(rowOf('#BBBBBBBB'), 'admin.returns.processReturn')!.click());
    expect(text()).toContain('admin.returns.intake.noMoneyNote');
  });

  it('sortable column headers drive the same sort as the sort dropdown', async () => {
    fx.orders = [
      order({ id: 'aaaaaaaa1111', total: 120 }),
      order({ id: 'bbbbbbbb2222', total: 300 }),
    ];
    render(h(AdminOrders));
    const sortSelect = [...container.querySelectorAll('select')].find((sel) => sel.getAttribute('aria-label') === 'admin.orders.page.sortBy')!;
    const totalHeader = container.querySelector<HTMLButtonElement>('[aria-label="admin.orders.page.sortByColumn"]');
    expect(totalHeader).not.toBeNull();
    const header = [...container.querySelectorAll<HTMLButtonElement>('thead button')].find((b) => b.textContent?.includes('admin.orders.page.colItemsTotal'))!;
    await act(async () => header.click());
    expect(sortSelect.value).toBe('total-desc');
    const order1 = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent?.includes('#BBBBBBBB'));
    expect(order1[0]).toBe(true); // highest total first
    await act(async () => header.click());
    expect(sortSelect.value).toBe('total-asc');
  });
});

describe('Returns shelf from the order detail (P1)', () => {
  const delivered = (overrides: Partial<OrderRecord> = {}) =>
    order({ id: 'ffffffff6666', status: 'delivered', items: [
      { productId: 'p1', name: 'Dress (Red / M)', price: 100, quantity: 2, image: '', lineTotal: 200, size: 'M', colorId: 'red', colorName: 'Red' },
      { productId: 'coord:look', name: 'Summer Set', price: 170, quantity: 1, image: '', lineTotal: 170, size: 'M' },
    ], ...overrides });

  it('offers "Process return" only on shipped/delivered website orders', async () => {
    fx.orders = [delivered(), order({ id: 'aaaaaaaa1111', status: 'pending' })];
    render(h(AdminOrders), '/admin/orders?order=ffffffff6666');
    expect(byText('admin.returns.processReturn')).toBeDefined();
    act(() => root.unmount());
    root = createRoot(container);
    render(h(AdminOrders), '/admin/orders?order=aaaaaaaa1111');
    expect(byText('admin.returns.processReturn')).toBeUndefined();
  });

  it('never offers returns on a POS sale', async () => {
    render(h(AdminOrders), '/admin/orders?order=cccccccc3333');
    expect(byText('admin.returns.processReturn')).toBeUndefined();
  });

  it('logs returned units through the owner endpoint (no stock or money fields) and excludes coordinate sets', async () => {
    fx.orders = [delivered()];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, replayed: false, returns: [{ id: 'ret_k_0', orderId: 'ffffffff6666', productName: 'Dress (Red / M)', quantity: 1, status: 'quarantine' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(h(AdminOrders), '/admin/orders?order=ffffffff6666');
    await act(async () => byText('admin.returns.processReturn')!.click());
    expect(text()).toContain('admin.returns.intake.coordinateExcluded');
    expect(text()).toContain('admin.returns.intake.noMoneyNote');

    const qty = document.querySelector<HTMLSelectElement>('select[aria-label="admin.returns.intake.qtyLabel"]')!;
    expect([...qty.options].map((o) => o.value)).toEqual(['0', '1', '2']); // capped at the ordered quantity
    await act(async () => {
      qty.value = '1';
      qty.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const reason = document.querySelector<HTMLSelectElement>('#return-reason')!;
    await act(async () => {
      reason.value = 'wrong_size';
      reason.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => byText('admin.returns.intake.reviewButton')!.click());
    await act(async () => byText('admin.returns.intake.confirmButton')!.click());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/returns/create');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      orderId: 'ffffffff6666',
      reason: 'wrong_size',
      lines: [{ productId: 'p1', colorId: 'red', size: 'M', quantity: 1 }],
    });
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
    expect(Object.keys(body).sort()).toEqual(['idempotencyKey', 'lines', 'note', 'orderId', 'reason']);
    expect(fx.patchOrder).toHaveBeenCalledWith(
      'ffffffff6666',
      expect.objectContaining({ returnSummary: expect.objectContaining({ returnCount: 1, openCount: 1, returnedQtyByKey: { 'p1|~|red|~|M': 1 } }) })
    );
  });

  it('an order with returns cannot be cancelled and its items are locked in the editor', async () => {
    fx.orders = [delivered({ status: 'shipped', returnSummary: { returnCount: 1, openCount: 1, returnedQtyByKey: { 'p1|~|red|~|M': 1 }, lastReturnAt: null } })];
    render(h(AdminOrders), '/admin/orders?order=ffffffff6666');
    expect(byText('admin.orders.detail.cancelOrder')).toBeUndefined();
    expect(text()).toContain('admin.returns.lockedNotice');
    await act(async () => byText('admin.common.edit')!.click());
    expect(text()).toContain('admin.returns.itemsLocked');
    // Only forward moves remain in the edit dialog's status picker (the page's own
    // status filter dropdown also lists 'shipped', so look inside the dialog).
    const editDialog = document.querySelector('[aria-labelledby="admin-order-edit-title"]')!;
    const statusSelect = [...editDialog.querySelectorAll<HTMLSelectElement>('select')].find((sel) =>
      [...sel.options].some((o) => o.value === 'shipped')
    )!;
    expect([...statusSelect.options].map((o) => o.value)).toEqual(['shipped', 'delivered']);
  });
});

describe('Cancelled POS sale with lines that could not be restocked', () => {
  it('lists the skipped lines and why in the order details', async () => {
    fx.orders = [
      order({
        id: 'gggggggg7777',
        source: 'pos',
        status: 'cancelled',
        cancellation: {
          cancelledAt: new Date(), cancelledByUid: 'owner-1', cancelledByName: 'owner@example.com', reason: 'void',
          registerSessionStatusAtCancellation: 'open',
          skippedLines: [{ productId: 'p1', name: 'Dress (Blue / S)', colorId: 'blue', size: 'S', quantity: 1, reason: 'variant_missing' }],
        },
      }),
    ];
    render(h(AdminOrders), '/admin/orders?order=gggggggg7777');
    expect(text()).toContain('admin.orders.detail.skippedTitle');
    expect(text()).toContain('Dress (Blue / S) × 1');
    expect(text()).toContain('admin.orders.detail.skipVariantMissing');
  });
});

describe('Reports page', () => {
  it('renders booked and fulfilled revenue and the breakdown panels', async () => {
    render(h(AdminReports), '/admin/reports');
    for (const key of ['admin.reports.booked', 'admin.reports.fulfilled', 'admin.reports.byDay', 'admin.reports.topProducts', 'admin.reports.channels']) {
      expect(text()).toContain(key);
    }
    expect(text()).toContain('ILS 500.00'); // booked: 120 + 300 + 80 (nothing cancelled)
    expect(text()).toContain('ILS 80.00'); // fulfilled: the completed POS sale only
    await act(async () => byText('admin.orders.page.dateToday')!.click());
    expect(text()).toContain('ILS 500.00');
  });
});
