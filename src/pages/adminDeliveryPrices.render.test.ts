import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Admin → Delivery prices with the real place list; the Firestore read/write of
// site_settings/delivery_prices is stubbed (`t` returns the key).
const fx = vi.hoisted(() => ({
  stored: null as null | Record<string, unknown>,
  fetch: vi.fn(),
  save: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../firebase', () => {
  const fn = () => vi.fn();
  return {
    db: {}, auth: {}, collection: fn(), doc: fn(), getDoc: fn(), getDocFromServer: fn(), getDocs: fn(), query: fn(), where: fn(),
    orderBy: fn(), updateDoc: fn(), addDoc: fn(), setDoc: fn(), onSnapshot: fn(), serverTimestamp: fn(), runTransaction: fn(),
  };
});

vi.mock('../lib/delivery/deliveryPriceService', () => ({
  fetchDeliveryPriceSettings: fx.fetch,
  saveDeliveryPriceSettings: fx.save,
  subscribeDeliveryPriceSettings: vi.fn(() => () => {}),
}));

vi.mock('sonner', () => ({ toast: { success: fx.toastSuccess, error: fx.toastError, warning: vi.fn() } }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'owner-1', email: 'owner@example.com', displayName: 'Owner' }, role: 'admin', loading: false }),
}));

vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en', isRTL: false, setLanguage: () => {} }),
}));

import AdminDeliveryPrices from './AdminDeliveryPrices';
import { loadDeliveryLocationIndex } from '../lib/delivery/deliveryAreas';
import { DELIVERY_REGIONS } from '../../server/lib/delivery/deliveryRegions.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings = (regionPrices: Record<string, number> = {}, locationPrices: Record<string, number> = {}, extra = {}) => ({
  regionPrices,
  locationPrices,
  updatedAt: null,
  updatedByName: null,
  ...extra,
});

let container: HTMLDivElement;
let root: Root;

async function openPage() {
  await act(async () => {
    root.render(h(AdminDeliveryPrices));
  });
  await act(async () => {
    await loadDeliveryLocationIndex();
  });
  await act(async () => {});
}

async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const $ = <T extends Element = HTMLElement>(testId: string) => document.querySelector<T>(`[data-testid="${testId}"]`);
const regionInput = (id: string) => $<HTMLInputElement>(`delivery-region-price-${id}`)!;
const saveButton = () => $<HTMLButtonElement>('delivery-prices-save')!;

beforeEach(() => {
  fx.fetch.mockReset();
  fx.fetch.mockImplementation(async () => fx.stored ?? settings());
  fx.save.mockReset();
  // Like Firestore: what is saved is what the next read returns.
  fx.save.mockImplementation(async (prices: { regionPrices: Record<string, number>; locationPrices: Record<string, number> }) => {
    fx.stored = settings(prices.regionPrices, prices.locationPrices, { updatedAt: new Date(), updatedByName: 'Owner' });
  });
  fx.toastSuccess.mockReset();
  fx.toastError.mockReset();
  fx.stored = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Admin → Delivery prices', () => {
  it('shows every region with its current price (starting prices before anything is saved)', async () => {
    await openPage();
    for (const region of DELIVERY_REGIONS) expect(regionInput(region.id).value).toBe(String(region.defaultPrice));
    expect(regionInput('jenin').value).toBe('20');
    expect(regionInput('jerusalem-suburbs').value).toBe('30');
    expect(regionInput('abu-ghosh').value).toBe('50');
    expect(regionInput('golan').value).toBe('70');
    expect($('delivery-region-jenin')!.textContent).toContain('101'); // places in the region
    expect($('delivery-prices-last-saved')!.textContent).toContain('admin.deliveryPrices.neverSaved');
    expect(saveButton().disabled).toBe(true);
  });

  it('shows saved prices and who saved them', async () => {
    fx.stored = settings({ jenin: 25 }, { 'jenin-025': 12 }, { updatedAt: new Date('2026-11-20T10:00:00Z'), updatedByName: 'Owner' });
    await openPage();
    expect(regionInput('jenin').value).toBe('25');
    expect($<HTMLInputElement>('delivery-place-price-jenin-025')!.value).toBe('12');
    expect($('delivery-prices-last-saved')!.textContent).toContain('admin.deliveryPrices.lastSaved');
  });

  it('edits a region price and saves the whole table (all 22 regions)', async () => {
    await openPage();
    await type(regionInput('jenin'), '25');
    expect($('delivery-region-jenin')!.textContent).toContain('admin.deliveryPrices.changed');
    expect($('delivery-prices-status')!.textContent).toBe('admin.deliveryPrices.unsaved');
    await act(async () => saveButton().click());
    expect(fx.save).toHaveBeenCalledTimes(1);
    const [prices, actor] = fx.save.mock.calls[0];
    expect(Object.keys(prices.regionPrices)).toHaveLength(22);
    expect(prices.regionPrices).toMatchObject({ jenin: 25, nablus: 20, jerusalem: 30, 'abu-ghosh': 50, golan: 70 });
    expect(prices.locationPrices).toEqual({});
    expect(actor).toEqual({ uid: 'owner-1', name: 'Owner' });
    expect(fx.toastSuccess).toHaveBeenCalledWith('admin.deliveryPrices.saved');
    expect(fx.fetch).toHaveBeenCalledTimes(2); // re-read from the server after saving
  });

  it('gives one place its own price (pre-filled with its region price) and can take it away again', async () => {
    await openPage();
    await type($<HTMLInputElement>('admin-place-search-input')!, 'برقين');
    const option = document.querySelector<HTMLElement>('[data-testid="admin-place-search-option"][data-location-id="jenin-025"]')!;
    await act(async () => option.click());
    const placePrice = $<HTMLInputElement>('delivery-place-price-jenin-025')!;
    expect(placePrice.value).toBe('20');
    await type(placePrice, '12');
    await act(async () => saveButton().click());
    expect(fx.save.mock.calls[0][0].locationPrices).toEqual({ 'jenin-025': 12 });

    await act(async () => $<HTMLButtonElement>('delivery-place-remove-jenin-025')!.click());
    expect($('delivery-place-jenin-025')).toBeNull();
  });

  it('refuses unusable prices: Save stays disabled and nothing is written', async () => {
    await openPage();
    for (const bad of ['abc', '-5', '1001', '']) {
      await type(regionInput('jenin'), bad);
      expect($('delivery-prices-invalid')).not.toBeNull();
      expect(saveButton().disabled).toBe(true);
    }
    expect(fx.save).not.toHaveBeenCalled();
  });

  it('tells a non-owner account that only the store owner can change prices', async () => {
    fx.save.mockRejectedValue({ code: 'permission-denied' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await openPage();
    await type(regionInput('golan'), '75');
    await act(async () => saveButton().click());
    expect(fx.toastError).toHaveBeenCalledWith('admin.deliveryPrices.permissionDenied');
  });
});
