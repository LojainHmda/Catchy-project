import { describe, it, expect } from 'vitest';
import {
  createdAtMillis,
  hasStock,
  isSellableInPos,
  isSellableOnline,
  isShownOnline,
  sortNewestFirst,
} from './productAvailability';

// The store owner's rules (one definition for every screen):
//   in stock + shown online  → online store AND POS
//   in stock + hidden online → POS only
//   sold out                 → neither (Admin → Products still lists it)
describe('product availability rules', () => {
  const cases = [
    { name: 'in stock, shown online', p: { visible: true, stock: 3 }, online: true, pos: true },
    { name: 'in stock, visible field missing (older product)', p: { stock: 3 }, online: true, pos: true },
    { name: 'in stock, hidden online', p: { visible: false, stock: 3 }, online: false, pos: true },
    { name: 'sold out (stock 0), shown online', p: { visible: true, stock: 0 }, online: false, pos: false },
    { name: 'sold out, hidden online', p: { visible: false, stock: 0 }, online: false, pos: false },
    { name: 'sized: one size left', p: { visible: true, sizeStock: { S: 0, M: 1 }, stock: 1 }, online: true, pos: true },
    { name: 'sized: every size at 0', p: { visible: true, sizeStock: { S: 0, M: 0 }, stock: 0 }, online: false, pos: false },
    {
      name: 'sized with all sizes at 0 but a stale total — sizes win, sold out everywhere',
      p: { visible: true, sizeStock: { S: 0, M: 0 }, stock: 5 },
      online: false,
      pos: false,
    },
  ];

  it.each(cases)('$name → online: $online, POS: $pos', ({ p, online, pos }) => {
    expect(isSellableOnline(p)).toBe(online);
    expect(isSellableInPos(p)).toBe(pos);
  });

  it('a product hidden online is never listed online, whatever its stock', () => {
    expect(isShownOnline({ visible: false })).toBe(false);
    expect(isShownOnline({ visible: true })).toBe(true);
    expect(isShownOnline({})).toBe(true);
  });

  it('hasStock with no inventory at all is false', () => {
    expect(hasStock({})).toBe(false);
  });
});

describe('createdAtMillis / sortNewestFirst', () => {
  it('reads Firestore Timestamps, ISO strings and numbers; missing or invalid → undefined', () => {
    expect(createdAtMillis({ toDate: () => new Date('2026-10-07T13:28:07.606Z') })).toBe(
      Date.parse('2026-10-07T13:28:07.606Z')
    );
    expect(createdAtMillis('2026-11-12T11:54:44.923Z')).toBe(Date.parse('2026-11-12T11:54:44.923Z'));
    expect(createdAtMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(createdAtMillis(undefined)).toBeUndefined();
    expect(createdAtMillis(null)).toBeUndefined();
    expect(createdAtMillis('not a date')).toBeUndefined();
  });

  it('orders newest first, keeps undated items (last) and does not mutate the input', () => {
    const items = [
      { id: 'old', at: 1 },
      { id: 'undated', at: undefined },
      { id: 'new', at: 3 },
      { id: 'mid', at: 2 },
    ];
    const copy = [...items];
    expect(sortNewestFirst(items, (i) => i.at).map((i) => i.id)).toEqual(['new', 'mid', 'old', 'undated']);
    expect(items).toEqual(copy);
  });
});
