import { describe, it, expect } from 'vitest';
import { orderSummary, resolveRange, storeDayStart } from './catchyData.js';

describe('store days (Asia/Hebron)', () => {
  it('a store day starts at local midnight in winter (UTC+2) and summer (UTC+3)', () => {
    expect(storeDayStart('2026-11-10').toISOString()).toBe('2026-11-09T22:00:00.000Z');
    expect(storeDayStart('2026-07-01').toISOString()).toBe('2026-06-30T21:00:00.000Z');
  });

  it('defaults to the last 30 store days and validates ranges', () => {
    const r = resolveRange({}, new Date('2026-11-10T10:00:00Z'));
    expect(r).toMatchObject({ ok: true, from: '2026-10-12', to: '2026-11-10' });
    expect(r.end.toISOString()).toBe('2026-11-10T22:00:00.000Z');
    expect(resolveRange({ from: '2026-11-10', to: '2026-11-01' }).ok).toBe(false);
    expect(resolveRange({ from: '2024-01-01', to: '2026-11-01' }).ok).toBe(false);
  });
});

describe('order totals', () => {
  it('uses the stored total for a discounted web order (even 0), and the POS discount for POS', () => {
    expect(orderSummary('a', { subtotal: 200, shippingCost: 0, total: 0, webDiscount: { amount: 200 } })).toMatchObject({ total: 0, discount: 200 });
    expect(orderSummary('b', { subtotal: 200, shippingCost: 20 })).toMatchObject({ total: 220, discount: 0, source: 'web', status: 'pending' });
    expect(orderSummary('c', { source: 'pos', status: ' Completed ', subtotal: 300, total: 270, discount: { amount: 30 }, webDiscount: { amount: 99 } })).toMatchObject({ total: 270, discount: 30, status: 'completed' });
  });
});
