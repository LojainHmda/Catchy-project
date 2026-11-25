import { describe, it, expect } from 'vitest';
import type { OrderRecord } from '../../types/order';
import {
  orderWebDiscountAmount,
  validateWebDiscountDraft,
  webDiscountAmount,
  webDiscountDraftChanged,
  webDiscountDraftFromOrder,
  webOrderTotal,
} from './webOrderDiscount';
import { parseOrderDocument } from './orderUtils';
import { ordersCsvRows } from './orderListFilters';
import { buildSalesReport, reportSummaryCsvRows } from '../reports/salesReport';
import { invoiceSubtotalRows, type InvoiceLabels } from './invoiceImage';

const discount20 = { amount: 20, reason: 'Loyal customer', appliedAt: null, appliedByUid: 'owner', appliedByName: 'owner@x.com' };

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'abcdef123456', userId: 'u1', isGuest: false, customerEmail: null, customerName: 'Lina', customerPhone: '0591234567',
    deliveryAddress: 'Ramallah', deliveryZone: 'west_bank', status: 'pending', subtotal: 200, shippingCost: 20, total: 220,
    itemCount: 2, createdAt: new Date('2026-10-30T10:00:00'), source: 'web',
    items: [{ productId: 'skirt', name: 'Skirt (M)', price: 100, quantity: 2, image: '', lineTotal: 200, size: 'M' }],
    ...overrides,
  };
}
const discounted = (o: Partial<OrderRecord> = {}) => order({ webDiscount: discount20, total: 200, ...o });

describe('fixed-amount discount rule', () => {
  it('takes the fixed ILS amount off the items, never more than the subtotal', () => {
    expect(webDiscountAmount(20, 200)).toBe(20);
    expect(webDiscountAmount(19.999, 200)).toBe(20);
    expect(webDiscountAmount(250, 200)).toBe(200);
    expect(webDiscountAmount(20, 0)).toBe(0);
    expect(webDiscountAmount(null, 200)).toBe(0);
    expect(webDiscountAmount(-5, 200)).toBe(0);
  });

  it('total = subtotal − discount + shipping', () => {
    expect(webOrderTotal(200, 20, 20)).toBe(200);
    expect(webOrderTotal(99.9, 20, 9.9)).toBe(110);
  });
});

describe('admin discount draft (edit dialog) — same rules as the server', () => {
  it('a fixed amount with a reason is accepted; "none" means no discount', () => {
    expect(validateWebDiscountDraft({ mode: 'amount', amount: '20', reason: 'Loyal' }, 200)).toEqual({ ok: true, amount: 20, discount: { amount: 20, reason: 'Loyal' } });
    expect(validateWebDiscountDraft({ mode: 'amount', amount: '12,5', reason: 'x' }, 200)).toMatchObject({ ok: true, amount: 12.5 });
    expect(validateWebDiscountDraft({ mode: 'none', amount: '99', reason: '' }, 200)).toEqual({ ok: true, discount: null, amount: 0 });
  });

  it.each([
    [{ mode: 'amount', amount: '', reason: 'x' }, 'INVALID_VALUE'],
    [{ mode: 'amount', amount: 'abc', reason: 'x' }, 'INVALID_VALUE'],
    [{ mode: 'amount', amount: '10%', reason: 'x' }, 'INVALID_VALUE'], // no percentages
    [{ mode: 'amount', amount: '0', reason: 'x' }, 'INVALID_VALUE'],
    [{ mode: 'amount', amount: '-5', reason: 'x' }, 'INVALID_VALUE'],
    [{ mode: 'amount', amount: '1.005', reason: 'x' }, 'TOO_MANY_DECIMALS'],
    [{ mode: 'amount', amount: '200.01', reason: 'x' }, 'EXCEEDS_SUBTOTAL'],
    [{ mode: 'amount', amount: '20', reason: '  ' }, 'REASON_REQUIRED'],
    [{ mode: 'amount', amount: '20', reason: 'x'.repeat(201) }, 'REASON_TOO_LONG'],
  ] as const)('refuses %j → %s', (draft, error) => {
    expect(validateWebDiscountDraft({ ...draft }, 200)).toEqual({ ok: false, error });
  });

  it('a discount can never exceed the eligible (items) amount', () => {
    expect(validateWebDiscountDraft({ mode: 'amount', amount: '200', reason: 'x' }, 200)).toMatchObject({ ok: true, amount: 200 });
    expect(validateWebDiscountDraft({ mode: 'amount', amount: '5', reason: 'x' }, 0)).toEqual({ ok: false, error: 'NO_SUBTOTAL' });
  });

  it('draft round-trips from the stored order and only reports real changes', () => {
    const o = discounted();
    const draft = webDiscountDraftFromOrder(o);
    expect(draft).toEqual({ mode: 'amount', amount: '20', reason: 'Loyal customer' });
    expect(webDiscountDraftChanged(o, draft)).toBe(false);
    expect(webDiscountDraftChanged(o, { ...draft, amount: '20.00' })).toBe(false);
    expect(webDiscountDraftChanged(o, { ...draft, amount: '25' })).toBe(true);
    expect(webDiscountDraftChanged(o, { ...draft, reason: 'Other' })).toBe(true);
    expect(webDiscountDraftChanged(o, { mode: 'none', amount: '', reason: '' })).toBe(true);
    expect(webDiscountDraftChanged(order(), { mode: 'none', amount: '', reason: '' })).toBe(false);
    expect(webDiscountDraftChanged(order(), { mode: 'amount', amount: '5', reason: 'x' })).toBe(true);
  });
});

describe('stored orders (parseOrderDocument) — backward compatible', () => {
  const base = { status: 'pending', items: [{ productId: 'skirt', name: 'Skirt', price: 100, quantity: 2 }], subtotal: 200, shippingCost: 20, total: 220 };

  it('orders without a discount parse exactly as before', () => {
    const o = parseOrderDocument('o1', base);
    expect(o.webDiscount).toBeNull();
    expect(o.total).toBe(220);
    expect(orderWebDiscountAmount(o)).toBe(0);
    // Old fallback kept: a missing/zero total is still subtotal + shipping when there is no discount.
    expect(parseOrderDocument('o1', { ...base, total: 0 }).total).toBe(220);
  });

  it('reads a fixed discount, and trusts a stored total of 0 only when one exists (whole subtotal off, free shipping)', () => {
    const o = parseOrderDocument('o1', { ...base, total: 200, webDiscount: { amount: 20, reason: 'Loyal', appliedByUid: 'u', appliedByName: 'n', appliedAt: '2026-10-31T10:00:00.000Z' } });
    expect(o.webDiscount).toEqual({ amount: 20, reason: 'Loyal', appliedByUid: 'u', appliedByName: 'n', appliedAt: new Date('2026-10-31T10:00:00.000Z') });
    expect(orderWebDiscountAmount(o)).toBe(20);
    const free = parseOrderDocument('o1', { ...base, shippingCost: 0, total: 0, webDiscount: { amount: 200, reason: 'Gift' } });
    expect(free.total).toBe(0);
  });

  it('a record left over from the removed percentage option is read as its stored fixed amount', () => {
    const o = parseOrderDocument('o1', { ...base, total: 190, webDiscount: { mode: 'percent', value: 15, amount: 30, reason: 'Old test' } });
    expect(o.webDiscount).toMatchObject({ amount: 30, reason: 'Old test' });
    expect(o.webDiscount).not.toHaveProperty('mode');
    expect(o.total).toBe(190);
  });

  it('ignores a web discount on a POS sale and malformed values; POS discount is untouched', () => {
    const pos = parseOrderDocument('p1', { ...base, source: 'pos', status: 'completed', total: 190, discount: { mode: 'amount', value: 10, amount: 10 }, webDiscount: { amount: 20 } });
    expect(pos.webDiscount).toBeNull();
    expect(pos.discount).toMatchObject({ amount: 10 });
    expect(orderWebDiscountAmount(pos)).toBe(0);
    for (const bad of [{ amount: 0 }, { amount: -1 }, { amount: 'x' }, { reason: 'no amount' }, 'x', 5]) {
      expect(parseOrderDocument('o1', { ...base, webDiscount: bad }).webDiscount).toBeNull();
    }
  });
});

describe('Orders CSV export', () => {
  it('fills Discount for web orders and appends type + reason columns (existing columns keep their positions)', () => {
    const [header, plain, web, pos] = ordersCsvRows([
      order(),
      discounted(),
      order({ id: 'pos000000001', source: 'pos', status: 'completed', total: 180, discount: { mode: 'percent', value: 10, amount: 20, reason: 'Staff' } }),
    ]);
    const col = (name: string) => header.indexOf(name);
    expect(col('Discount')).toBe(13);
    expect(col('Total')).toBe(14);
    // Type + reason stay where they were appended (19, 20); the delivery-place columns come after them.
    const d = col('Discount type');
    expect(d).toBe(19);
    expect(header.slice(d, d + 2)).toEqual(['Discount type', 'Discount reason']);
    expect(header.slice(d + 2)).toEqual(['Delivery place', 'Delivery region', 'Delivery place ID']);
    expect([plain[col('Subtotal')], plain[col('Discount')], plain[col('Total')]]).toEqual([200, 0, 220]);
    expect(plain.slice(d, d + 2)).toEqual(['', '']);
    expect([web[col('Subtotal')], web[col('Shipping')], web[col('Discount')], web[col('Total')]]).toEqual([200, 20, 20, 200]);
    expect(web.slice(d, d + 2)).toEqual(['amount 20', 'Loyal customer']);
    // POS keeps its own discount, including its own percentage mode — unchanged.
    expect([pos[col('Discount')], pos[col('Total')]]).toEqual([20, 180]);
    expect(pos.slice(d, d + 2)).toEqual(['percent 10', 'Staff']);
  });
});

describe('Reports', () => {
  const range = { start: new Date('2026-10-01T00:00:00'), end: new Date('2026-11-01T00:00:00') };

  it('revenue uses the discounted total; web discounts are totalled separately from POS discounts', () => {
    const orders = [
      order({ id: 'a' }),
      discounted({ id: 'b' }),
      discounted({ id: 'c', status: 'cancelled' }), // cancelled: never revenue, never a discount given
      order({ id: 'p', source: 'pos', status: 'completed', total: 190, discount: { mode: 'amount', value: 10, amount: 10, reason: null } }),
    ];
    const report = buildSalesReport(orders, range);
    expect(report.web).toEqual({ count: 2, revenue: 420 });
    expect(report.booked.revenue).toBe(610);
    expect(report.webDiscounts).toBe(20);
    expect(report.webDiscountedOrders).toBe(1);
    expect(report.posDiscounts).toBe(10);
    const csv = reportSummaryCsvRows(report, range);
    expect(csv).toContainEqual(['Web discounts (admin, booked web orders)', 20]);
    expect(csv).toContainEqual(['POS discounts', 10]);
  });
});

describe('Invoice totals', () => {
  const labels = { subtotal: 'Subtotal', discount: 'Discount', shipping: 'Shipping', total: 'Total' } as InvoiceLabels;

  it('adds a Discount row between subtotal and shipping only for a discounted web order', () => {
    expect(invoiceSubtotalRows(discounted(), labels, 'en-GB', 'West Bank')).toEqual([
      { label: 'Subtotal', value: 'ILS 200.00' },
      { label: 'Discount', value: '−ILS 20.00' },
      { label: 'Shipping (West Bank)', value: 'ILS 20.00' },
    ]);
    expect(invoiceSubtotalRows(order(), labels, 'en-GB').map((r) => r.label)).toEqual(['Subtotal', 'Shipping']);
    const pos = order({ source: 'pos', discount: { mode: 'amount', value: 10, amount: 10, reason: null } });
    expect(invoiceSubtotalRows(pos, labels, 'en-GB').map((r) => r.label)).toEqual(['Subtotal', 'Shipping']); // POS invoice unchanged
  });
});
