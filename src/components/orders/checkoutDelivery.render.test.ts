import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The real checkout delivery dialog with the real place list. Prices come from a
// controllable stand-in for the Firestore listener (an admin saving new prices = a new
// snapshot); translations are the real tables in the chosen language.
const fx = vi.hoisted(() => ({
  onPrices: null as null | ((settings: unknown) => void),
  language: 'ar' as 'ar' | 'en',
}));

vi.mock('../../firebase', () => {
  const fn = () => vi.fn();
  return {
    db: {}, auth: {}, collection: fn(), doc: fn(), getDoc: fn(), getDocFromServer: fn(), getDocs: fn(), query: fn(), where: fn(),
    orderBy: fn(), updateDoc: fn(), addDoc: fn(), setDoc: fn(), onSnapshot: fn(), serverTimestamp: fn(), runTransaction: fn(),
  };
});

vi.mock('../../lib/delivery/deliveryPriceService', () => ({
  subscribeDeliveryPriceSettings: (onChange: (settings: unknown) => void) => {
    fx.onPrices = onChange;
    return () => {
      fx.onPrices = null;
    };
  },
  fetchDeliveryPriceSettings: vi.fn(),
  saveDeliveryPriceSettings: vi.fn(),
}));

vi.mock('../../context/LanguageContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../context/LanguageContext')>();
  return {
    ...actual,
    useLanguage: () => ({
      language: fx.language,
      isRTL: fx.language === 'ar',
      t: (key: string) => actual.translations[fx.language][key] ?? key,
    }),
  };
});

import CheckoutDeliveryModal from './CheckoutDeliveryModal';
import { loadDeliveryLocationIndex } from '../../lib/delivery/deliveryAreas';
import { formatOrderMoney } from '../../lib/orders';
import { translations } from '../../context/LanguageContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prices = (regionPrices: Record<string, number> = {}, locationPrices: Record<string, number> = {}) => ({
  regionPrices,
  locationPrices,
  updatedAt: null,
  updatedByName: null,
});

let container: HTMLDivElement;
let root: Root;
const onConfirm = vi.fn();
const onClose = vi.fn();

async function openDialog(withPrices = true) {
  await act(async () => {
    root.render(
      h(CheckoutDeliveryModal, {
        open: true,
        onClose,
        onConfirm,
        subtotal: 100,
        defaultDelivery: { customerName: 'Lina', customerPhone: '0591234567' },
      })
    );
  });
  // Let the place list chunk resolve, then deliver the first price snapshot.
  await act(async () => {
    await loadDeliveryLocationIndex();
  });
  await act(async () => {});
  if (withPrices) await act(async () => fx.onPrices?.(prices()));
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const $ = <T extends Element = HTMLElement>(testId: string) => document.querySelector<T>(`[data-testid="${testId}"]`);
const $$ = (testId: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)];
const placeInput = () => $<HTMLInputElement>('delivery-location-input')!;
const options = () => $$('delivery-location-option');
const click = (el: HTMLElement) => act(async () => el.click());
const continueButton = () => $<HTMLButtonElement>('checkout-delivery-continue')!;

beforeEach(() => {
  fx.language = 'ar';
  fx.onPrices = null;
  onConfirm.mockReset();
  onClose.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('checkout — choosing the delivery place', () => {
  it('the old four zone buttons are gone; a place search box and an optional address field are shown', async () => {
    await openDialog();
    expect(document.querySelector('input[name="deliveryZone"]')).toBeNull();
    expect(placeInput().getAttribute('role')).toBe('combobox');
    expect($('checkout-address-details')).not.toBeNull();
    expect($('checkout-delivery-place')!.textContent).not.toContain(translations.ar['cart.optional']);
    expect(document.body.textContent).toContain(translations.ar['cart.optional']);
  });

  it('Arabic autocomplete: typing part of a name suggests the place with its region and price, and selects it', async () => {
    await openDialog();
    await type(placeInput(), 'برقي');
    const [first] = options();
    expect(first.dataset.locationId).toBe('jenin-025');
    expect(first.textContent).toContain('برقين');
    expect(first.textContent).toContain('جنين');
    expect(first.textContent).toContain(formatOrderMoney(20));

    await click(first);
    expect($('delivery-location-selected-name')!.textContent).toBe('برقين');
    expect($('delivery-location-selected-region')!.textContent).toBe('جنين');
    expect($('order-totals-shipping')!.textContent).toBe(formatOrderMoney(20));
    expect($('order-totals-total')!.textContent).toBe(formatOrderMoney(120));
  });

  it('spelling variants and diacritics still find the place (أبو / ابو, ة / ه, harakat)', async () => {
    await openDialog();
    for (const q of ['أبو ديس', 'ابو ديس', 'أبُو دِيس']) {
      await type(placeInput(), q);
      expect(options()[0].dataset.locationId).toBe('jerusalem-suburbs-001');
    }
    // Typed with ه, listed with ة: all three towns named exactly "الطيبة" are offered.
    await type(placeInput(), 'الطيبه');
    const exact = options().filter((o) => o.querySelector('[data-testid="delivery-location-option-name"]')?.textContent === 'الطيبة');
    expect(exact).toHaveLength(3);
  });

  it('places with the same name in different regions are told apart by their region', async () => {
    fx.language = 'en';
    await openDialog();
    await type(placeInput(), 'الطيبة');
    const taybeh = options().filter((o) => o.querySelector('[data-testid="delivery-location-option-name"]')?.textContent === 'الطيبة');
    expect(taybeh.map((o) => o.querySelector('[data-testid="delivery-location-option-region"]')!.textContent)).toEqual([
      'Jenin',
      'Ramallah & Al-Bireh',
      'Triangle',
    ]);
    expect(new Set(taybeh.map((o) => o.dataset.locationId)).size).toBe(3);
  });

  it('completes WITHOUT street or house details: the order goes ahead with an empty optional field', async () => {
    await openDialog();
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    await click(continueButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      customerName: 'Lina',
      customerPhone: '0591234567',
      deliveryLocationId: 'jenin-025',
      deliveryAddress: '',
      email: null,
      expectedShippingCost: 20,
    });
  });

  it('keeps optional street / building details separate from the place', async () => {
    await openDialog();
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    await type($<HTMLTextAreaElement>('checkout-address-details')!, '  شارع الجامعة، عمارة 3  ');
    await click(continueButton());
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ deliveryLocationId: 'jenin-025', deliveryAddress: 'شارع الجامعة، عمارة 3' });
  });

  it('a place from the list is required: typed text alone is not accepted', async () => {
    await openDialog();
    await type(placeInput(), 'برقين');
    await click(continueButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect($('checkout-delivery-place-error')!.textContent).toBe(translations.ar['cart.deliveryLocationRequired']);
  });

  it('an admin price change reaches the open checkout immediately (live prices)', async () => {
    await openDialog();
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    expect($('order-totals-total')!.textContent).toBe(formatOrderMoney(120));

    await act(async () => fx.onPrices!(prices({ jenin: 25 })));
    expect($('delivery-location-selected-price')!.textContent).toBe(formatOrderMoney(25));
    expect($('order-totals-shipping')!.textContent).toBe(formatOrderMoney(25));
    expect($('order-totals-total')!.textContent).toBe(formatOrderMoney(125));

    await act(async () => fx.onPrices!(prices({ jenin: 25 }, { 'jenin-025': 15 })));
    expect($('order-totals-shipping')!.textContent).toBe(formatOrderMoney(15));
    await click(continueButton());
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ expectedShippingCost: 15 });
  });

  it('cannot continue before the current prices have arrived', async () => {
    await openDialog(false);
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    expect($('order-totals-shipping')!.textContent).toBe('—');
    expect(continueButton().disabled).toBe(true);
    await act(async () => fx.onPrices!(prices()));
    expect(continueButton().disabled).toBe(false);
  });

  it('keyboard: arrows + Enter choose a suggestion; Escape closes the list but not the dialog', async () => {
    await openDialog();
    await type(placeInput(), 'الطيبة');
    expect(options()[1].dataset.locationId).toBe('ramallah-albireh-008');
    await act(async () => {
      placeInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await act(async () => {
      placeInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect($('delivery-location-selected-name')!.textContent).toBe('الطيبة');
    expect($('delivery-location-selected-region')!.textContent).toBe('رام الله والبيرة');
    await click($('delivery-location-change')!);
    expect($('delivery-location-selected')).toBeNull();

    await type(placeInput(), 'جنين');
    expect(options().length).toBeGreaterThan(0);
    await act(async () => {
      placeInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(options()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mobile number must start with 05: told at once, Continue blocked, the number is never rewritten', async () => {
    await openDialog();
    const phone = $<HTMLInputElement>('checkout-phone')!;
    await type(phone, '07');
    expect($('checkout-phone-error')!.textContent).toBe(translations.ar['cart.deliveryPhoneMustStart05']);
    expect(phone.getAttribute('aria-invalid')).toBe('true');

    await type(phone, '0791234567');
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    await click(continueButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(phone.value).toBe('0791234567');
    expect($('checkout-phone-error')!.textContent).toBe(translations.ar['cart.deliveryPhoneMustStart05']);

    await type(phone, '0591234567');
    expect($('checkout-phone-error')).toBeNull();
    await click(continueButton());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: '0591234567' }));
  });

  it('a 05 number that is too short is refused with the 10-digit message', async () => {
    await openDialog();
    await type($<HTMLInputElement>('checkout-phone')!, '059123');
    expect($('checkout-phone-error')).toBeNull(); // nothing wrong with the first two digits
    await type(placeInput(), 'برقين');
    await click(options()[0]);
    await click(continueButton());
    expect(onConfirm).not.toHaveBeenCalled();
    expect($('checkout-phone-error')!.textContent).toBe(translations.ar['cart.deliveryPhoneInvalid']);
  });

  it('the 05 message exists in English too', async () => {
    fx.language = 'en';
    await openDialog();
    await type($<HTMLInputElement>('checkout-phone')!, '0612345678');
    expect($('checkout-phone-error')!.textContent).toBe(translations.en['cart.deliveryPhoneMustStart05']);
    expect(translations.en['cart.deliveryPhoneMustStart05']).toMatch(/05/);
    expect(translations.ar['cart.deliveryPhoneMustStart05']).toMatch(/05/);
  });

  it('shows a clear message when nothing matches', async () => {
    await openDialog();
    await type(placeInput(), 'زززز');
    expect($('delivery-location-no-match')!.textContent).toBe(translations.ar['cart.deliveryLocationNoMatch']);
  });
});
