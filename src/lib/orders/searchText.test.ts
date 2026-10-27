import { describe, it, expect } from 'vitest';
import { normalizeSearchText, toLatinDigits } from './searchText';
import { orderMatchesSearch, phoneDigitsCore } from './orderListFilters';
import type { OrderRecord } from '../../types/order';

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'abc12345xyz', userId: 'u1', isGuest: false, customerEmail: 'lina@example.com', customerName: 'لينا أحمد',
    customerPhone: '0591234567', deliveryAddress: 'رام الله، شارع الإرسال', deliveryZone: null, status: 'pending',
    subtotal: 0, shippingCost: 0, total: 0, itemCount: 0, createdAt: null, items: [], source: 'web', ...overrides,
  };
}

describe('P3 — search normalisation', () => {
  it('Arabic-Indic and Persian digits become Latin digits', () => {
    expect(toLatinDigits('٠٥٩١٢٣٤٥٦٧')).toBe('0591234567');
    expect(toLatinDigits('۰۵۹')).toBe('059');
    expect(phoneDigitsCore('٠٥٩١٢٣٤٥٦٧')).toBe('591234567');
  });

  it('unifies alef forms, ى/ي, ة/ه and drops diacritics/tatweel', () => {
    expect(normalizeSearchText('أحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('إسراء')).toBe(normalizeSearchText('اسراء'));
    expect(normalizeSearchText('مصطفى')).toBe(normalizeSearchText('مصطفي'));
    expect(normalizeSearchText('فاطمة')).toBe(normalizeSearchText('فاطمه'));
    expect(normalizeSearchText('مُحَمَّد')).toBe('محمد');
    expect(normalizeSearchText('مـــحمد')).toBe('محمد');
  });

  it('orders match Arabic-digit phone queries and Arabic spelling variants', () => {
    const o = order();
    expect(orderMatchesSearch(o, '٠٥٩١٢٣')).toBe(true);
    expect(orderMatchesSearch(o, 'لينا احمد')).toBe(true); // stored with أ
    expect(orderMatchesSearch(o, 'الارسال')).toBe(true); // stored with إ
    expect(orderMatchesSearch(o, 'LINA@EXAMPLE')).toBe(true);
    expect(orderMatchesSearch(o, '٠٥٦٠٠٠')).toBe(false);
  });

  it('existing behaviour is unchanged for Latin input', () => {
    const o = order();
    expect(orderMatchesSearch(o, '+970 59 123 4567')).toBe(true);
    expect(orderMatchesSearch(o, '#ABC12345')).toBe(true);
    expect(orderMatchesSearch(o, '')).toBe(true);
  });
});
