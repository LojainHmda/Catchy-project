import { describe, it, expect } from 'vitest';
import type { OrderRecord } from '../../types/order';
import { parseOrderDocument } from './orderUtils';
import {
  deliveryAreaCounts,
  orderAddressLine,
  orderDeliveryArea,
  orderDeliveryAreaLabel,
  orderDeliveryPlaceLabel,
} from './orderDelivery';
import { aggregateOrderCustomers } from './orderCustomerSummary';
import { orderMatchesSearch, ordersCsvRows } from './orderListFilters';
import { buildSalesReport } from '../reports/salesReport';

const t = (key: string) =>
  ({ 'shipping.zone.westBank': 'West Bank', 'shipping.zone.jerusalem': 'Jerusalem', 'admin.customers.unknownLocationFallback': 'Unknown location' })[key] ?? key;

// What a NEW order stores (checkout with a delivery place).
const newOrderDoc = {
  userId: 'guest',
  isGuest: true,
  customerName: 'Lina',
  customerPhone: '0591111111',
  deliveryAddress: null,
  deliveryLocation: { id: 'jenin-025', name: 'برقين', regionId: 'jenin', regionName: 'جنين', regionNameEn: 'Jenin', price: 20 },
  status: 'pending',
  subtotal: 100,
  shippingCost: 20,
  total: 120,
  items: [{ productId: 'p1', name: 'Dress', price: 100, quantity: 1 }],
  createdAt: new Date('2026-11-20T10:00:00Z'),
};

// What an OLD order stores (four-zone checkout) — must read exactly as before.
const oldOrderDoc = {
  userId: 'cust-1',
  isGuest: false,
  customerName: 'Sara',
  customerPhone: '0592222222',
  deliveryAddress: 'Ramallah, Al-Irsal street, building 4',
  deliveryZone: 'west_bank',
  status: 'delivered',
  subtotal: 200,
  shippingCost: 20,
  total: 220,
  items: [{ productId: 'p2', name: 'Skirt', price: 200, quantity: 1 }],
  createdAt: new Date('2026-10-01T10:00:00Z'),
};

const newOrder = () => parseOrderDocument('new-order-1', newOrderDoc);
const oldOrder = () => parseOrderDocument('old-order-1', oldOrderDoc);

describe('reading orders — new place snapshot and old zone orders', () => {
  it('a new order keeps its place, region and price snapshot as stored', () => {
    const order = newOrder();
    expect(order.deliveryLocation).toEqual(newOrderDoc.deliveryLocation);
    expect(order.deliveryZone).toBeNull();
    expect(order.deliveryAddress).toBeNull();
    expect(order).toMatchObject({ shippingCost: 20, total: 120 });
  });

  it('an old order reads exactly as before (zone, address, stored shipping)', () => {
    const order = oldOrder();
    expect(order).toMatchObject({ deliveryZone: 'west_bank', deliveryAddress: oldOrderDoc.deliveryAddress, shippingCost: 20, total: 220 });
    expect(order.deliveryLocation).toBeNull();
  });

  it('an order without a stored shipping cost falls back to its snapshot price, or (oldest orders) its zone price', () => {
    expect(parseOrderDocument('a', { ...newOrderDoc, shippingCost: undefined, total: undefined }).shippingCost).toBe(20);
    expect(parseOrderDocument('b', { ...oldOrderDoc, deliveryZone: 'inside_israel', shippingCost: undefined }).shippingCost).toBe(70);
  });

  it('later edits to places or prices cannot change a placed order: display uses only its own snapshot', () => {
    // A region renamed or removed from the place list later — the order still shows what it stored.
    const order = parseOrderDocument('c', {
      ...newOrderDoc,
      deliveryLocation: { id: 'gone-001', name: 'مكان قديم', regionId: 'gone', regionName: 'منطقة قديمة', regionNameEn: 'Old region', price: 33 },
      shippingCost: 33,
    });
    expect(orderDeliveryPlaceLabel(order, t, 'ar')).toBe('مكان قديم · منطقة قديمة');
    expect(orderDeliveryPlaceLabel(order, t, 'en')).toBe('مكان قديم · Old region');
    expect(order.shippingCost).toBe(33);
  });

  it('ignores a malformed snapshot instead of inventing a place', () => {
    expect(parseOrderDocument('d', { ...newOrderDoc, deliveryLocation: { id: '', name: '' } }).deliveryLocation).toBeNull();
    expect(parseOrderDocument('e', { ...newOrderDoc, deliveryLocation: 'jenin-025' }).deliveryLocation).toBeNull();
  });
});

describe('where an order goes — labels for admin screens and invoices', () => {
  it('new orders: place · region (region in the admin language)', () => {
    expect(orderDeliveryPlaceLabel(newOrder(), t, 'ar')).toBe('برقين · جنين');
    expect(orderDeliveryPlaceLabel(newOrder(), t, 'en')).toBe('برقين · Jenin');
    expect(orderDeliveryAreaLabel(newOrder(), t, 'en')).toBe('Jenin');
    expect(orderDeliveryArea(newOrder()).key).toBe('region:jenin');
  });

  it('old orders: their former zone, as before', () => {
    expect(orderDeliveryPlaceLabel(oldOrder(), t, 'en')).toBe('West Bank');
    expect(orderDeliveryArea(oldOrder()).key).toBe('zone:west_bank');
  });

  it('address line: new orders place · region · details (details optional); old orders their address text', () => {
    expect(orderAddressLine(newOrder(), t, 'ar')).toBe('برقين · جنين');
    expect(orderAddressLine({ ...newOrder(), deliveryAddress: 'شارع الجامعة' }, t, 'ar')).toBe('برقين · جنين · شارع الجامعة');
    expect(orderAddressLine(oldOrder(), t, 'en')).toBe(oldOrderDoc.deliveryAddress);
  });

  it('counts orders per area: new orders by region, old orders by former zone', () => {
    const pos = parseOrderDocument('pos-1', { ...oldOrderDoc, source: 'pos', deliveryZone: null, deliveryAddress: null });
    const counts = deliveryAreaCounts([newOrder(), newOrder(), oldOrder(), pos]);
    expect(counts.all).toBe(4);
    expect(counts.areas.map((row) => [row.area.key, row.count])).toEqual([['region:jenin', 2], ['zone:west_bank', 1], ['unknown', 1]]);
  });
});

describe('Admin → Customers, Reports, CSV and order search with the new structure', () => {
  it('customer rows carry stable area keys and the latest address (place even without details)', () => {
    const [lina] = aggregateOrderCustomers([newOrder()], t, 'ar');
    expect(lina.areas).toEqual(['region:jenin']);
    expect(lina.latestAddress).toBe('برقين · جنين');
    expect(lina.deliveryLocations).toEqual(['برقين · جنين']);

    const [sara] = aggregateOrderCustomers([oldOrder()], t, 'en');
    expect(sara.areas).toEqual(['zone:west_bank']);
    expect(sara.latestAddress).toBe(oldOrderDoc.deliveryAddress);
    expect(sara.deliveryLocations).toEqual([`West Bank · ${oldOrderDoc.deliveryAddress}`]);
  });

  it('the sales report groups web orders by region (new) and former zone (old)', () => {
    const report = buildSalesReport([newOrder(), oldOrder()], { start: null, end: null });
    expect(report.byZone.map((row) => [row.zone, row.count, row.revenue])).toEqual([
      ['zone:west_bank', 1, 220],
      ['region:jenin', 1, 120],
    ]);
    expect(report.byZone[1].area).toMatchObject({ kind: 'region', nameAr: 'جنين', nameEn: 'Jenin' });
  });

  it('CSV keeps its existing columns and appends the delivery place columns', () => {
    const [header, newRow, oldRow] = ordersCsvRows([newOrder(), oldOrder()]) as unknown[][];
    expect(header.slice(-3)).toEqual(['Delivery place', 'Delivery region', 'Delivery place ID']);
    expect(header.indexOf('Zone')).toBe(8);
    expect(newRow.slice(-3)).toEqual(['برقين', 'جنين', 'jenin-025']);
    expect(newRow[8]).toBe('');
    expect(oldRow[8]).toBe('west_bank');
    expect(oldRow.slice(-3)).toEqual(['', '', '']);
  });

  it('order search finds orders by place or region name, with Arabic spelling variants', () => {
    expect(orderMatchesSearch(newOrder(), 'برقين')).toBe(true);
    expect(orderMatchesSearch(newOrder(), 'jenin')).toBe(true);
    expect(orderMatchesSearch(newOrder(), 'جنين')).toBe(true);
    expect(orderMatchesSearch(oldOrder() as OrderRecord, 'برقين')).toBe(false);
  });
});
