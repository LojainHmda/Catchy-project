// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DELIVERY_GROUPS, DELIVERY_REGIONS } from './deliveryRegions.js';
import { DELIVERY_LOCATIONS } from './deliveryLocations.js';
import { findDeliveryLocation } from './deliveryLocationLookup.js';
import {
  MAX_DELIVERY_PRICE,
  deliveryLocationPrice,
  deliveryLocationSnapshot,
  deliveryPriceRange,
  deliveryRegionPrice,
  normalizeDeliveryPrice,
  parseDeliveryPriceSettings,
} from './deliveryPricing.js';

// Same folding as the storefront search: "the same place spelled twice" check.
const fold = (s) =>
  s
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[-_()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('imported delivery places — Catchy-owned data', () => {
  it('has the 4 groups, 22 regions and 1,045 places of the import', () => {
    expect(DELIVERY_GROUPS.map((g) => g.id)).toEqual(['west_bank', 'jerusalem', 'inside_1948', 'golan']);
    expect(DELIVERY_REGIONS).toHaveLength(22);
    expect(DELIVERY_LOCATIONS).toHaveLength(1045);
  });

  it('every region and place has a unique Catchy id; every place belongs to a known region', () => {
    const regionIds = DELIVERY_REGIONS.map((r) => r.id);
    expect(new Set(regionIds).size).toBe(regionIds.length);
    const locationIds = DELIVERY_LOCATIONS.map((l) => l.id);
    expect(new Set(locationIds).size).toBe(locationIds.length);
    for (const location of DELIVERY_LOCATIONS) {
      expect(regionIds).toContain(location.regionId);
      expect(location.id).toMatch(new RegExp(`^${location.regionId}-\\d{3}$`));
      expect(location.nameAr.trim()).toBe(location.nameAr);
      expect(location.nameAr.length).toBeGreaterThan(1);
    }
    for (const region of DELIVERY_REGIONS) {
      expect(DELIVERY_GROUPS.map((g) => g.id)).toContain(region.groupId);
      if (region.parentRegionId) expect(regionIds).toContain(region.parentRegionId);
    }
  });

  it('keeps every place of each region (counts per region)', () => {
    const counts = Object.fromEntries(DELIVERY_REGIONS.map((r) => [r.id, DELIVERY_LOCATIONS.filter((l) => l.regionId === r.id).length]));
    expect(counts).toEqual({
      jericho: 31, hebron: 42, bethlehem: 41, jenin: 101, 'ramallah-albireh': 94, salfit: 20, tubas: 16, tulkarm: 65,
      qalqilya: 36, 'hebron-city': 47, 'bethlehem-city': 18, 'ramallah-albireh-city': 34, nablus: 114,
      jerusalem: 82, 'jerusalem-suburbs': 20, 'abu-ghosh': 4, galilee: 95, 'eastern-galilee': 15, triangle: 30,
      center: 32, 'beersheba-naqab': 72, golan: 36,
    });
  });

  it('contains no test rows, provider/system rows, courier routing lines, copies or empty records', () => {
    const notPlaces = [
      'test sub branch area', 'vhub', 'VHub Default', 'Default Integration Area', 'داخل شمال_copy', 'ضفة جليل_copy',
      'قدس شمال_copy', 'ابو غوش الخليل', 'ابو غوش جليل', 'الداخل بيت لحم', 'القدس بيت لحم', 'ضفة القدس', 'ضفة جليل',
      'قدس شمال', 'قدس الخليل', 'مناطق القدس', 'مناطق ابو غوش', 'الداخل', 'الضفة الغربية', 'مدينة',
    ];
    const names = new Set(DELIVERY_LOCATIONS.map((l) => l.nameAr));
    for (const name of notPlaces) expect(names.has(name)).toBe(false);
    expect(DELIVERY_LOCATIONS.some((l) => /_copy|vhub|test|default/i.test(l.nameAr))).toBe(false);
  });

  it('keeps one spelling of a place listed twice in the same region (hamza variants)', () => {
    for (const region of DELIVERY_REGIONS) {
      const folded = DELIVERY_LOCATIONS.filter((l) => l.regionId === region.id).map((l) => fold(l.nameAr));
      expect(new Set(folded).size).toBe(folded.length);
    }
    const names = DELIVERY_LOCATIONS.map((l) => l.nameAr);
    expect(names).toContain('بيت أولا');
    expect(names).not.toContain('بيت اولا');
    expect(names).toContain('دير إبزيع');
    expect(names).not.toContain('دير ابزيع');
    expect(names).toContain('بيت إيبا');
    expect(names).not.toContain('بيت ايبا');
  });

  it('keeps same-named places in different regions as separate places', () => {
    const taybeh = DELIVERY_LOCATIONS.filter((l) => l.nameAr === 'الطيبة');
    expect(taybeh.map((l) => l.regionId).sort()).toEqual(['jenin', 'ramallah-albireh', 'triangle']);
    expect(new Set(taybeh.map((l) => l.id)).size).toBe(3);
  });

  it('finds a place by id (and nothing for unknown / non-string ids)', () => {
    expect(findDeliveryLocation('jenin-025')).toMatchObject({ nameAr: 'برقين', regionId: 'jenin' });
    expect(findDeliveryLocation(' jenin-025 ')).toMatchObject({ id: 'jenin-025' });
    expect(findDeliveryLocation('west_bank')).toBeNull();
    expect(findDeliveryLocation(undefined)).toBeNull();
    expect(findDeliveryLocation(42)).toBeNull();
  });
});

describe('starting prices — approved 2026-11-23 (Catchy\'s previous zone prices)', () => {
  it('West Bank regions 20, Jerusalem + suburbs 30, Abu Ghosh 50, 1948 areas 70, Golan 70', () => {
    const byGroup = (groupId) => DELIVERY_REGIONS.filter((r) => r.groupId === groupId);
    expect(byGroup('west_bank')).toHaveLength(13);
    expect(byGroup('west_bank').every((r) => r.defaultPrice === 20)).toBe(true);
    expect(byGroup('jerusalem').map((r) => [r.id, r.defaultPrice])).toEqual([['jerusalem', 30], ['jerusalem-suburbs', 30]]);
    expect(DELIVERY_REGIONS.find((r) => r.id === 'abu-ghosh').defaultPrice).toBe(50);
    expect(byGroup('inside_1948').filter((r) => r.id !== 'abu-ghosh').map((r) => r.defaultPrice)).toEqual([70, 70, 70, 70, 70]);
    expect(DELIVERY_REGIONS.find((r) => r.id === 'golan').defaultPrice).toBe(70);
  });
});

describe('delivery price rules', () => {
  const burqin = { id: 'jenin-025', nameAr: 'برقين', regionId: 'jenin' };

  it('a usable price is 0–1000, rounded to agorot; anything else is refused', () => {
    expect(normalizeDeliveryPrice(25)).toBe(25);
    expect(normalizeDeliveryPrice('25')).toBe(25);
    expect(normalizeDeliveryPrice(' 17.5 ')).toBe(17.5);
    expect(normalizeDeliveryPrice(19.999)).toBe(20);
    expect(normalizeDeliveryPrice(0)).toBe(0);
    expect(normalizeDeliveryPrice(MAX_DELIVERY_PRICE)).toBe(MAX_DELIVERY_PRICE);
    for (const bad of [-1, 1001, NaN, Infinity, '', '   ', 'abc', null, undefined, true, {}, []]) {
      expect(normalizeDeliveryPrice(bad)).toBeNull();
    }
  });

  it('no saved prices (missing document) → every place uses its region\'s starting price', () => {
    const settings = parseDeliveryPriceSettings(null);
    expect(settings).toEqual({ regionPrices: {}, locationPrices: {} });
    expect(deliveryLocationPrice(burqin, settings)).toEqual({ price: 20, source: 'region' });
    expect(deliveryRegionPrice('golan', settings)).toBe(70);
  });

  it('a place without its own price inherits its region\'s admin price; its own price wins', () => {
    const settings = parseDeliveryPriceSettings({ regionPrices: { jenin: 25 }, locationPrices: { 'jenin-033': 15 } });
    expect(deliveryLocationPrice(burqin, settings)).toEqual({ price: 25, source: 'region' });
    expect(deliveryLocationPrice({ id: 'jenin-033', nameAr: 'جنين', regionId: 'jenin' }, settings)).toEqual({ price: 15, source: 'location' });
    expect(deliveryRegionPrice('nablus', settings)).toBe(20);
  });

  it('ignores unknown regions and unusable stored prices (falls back instead of charging 0)', () => {
    const settings = parseDeliveryPriceSettings({
      regionPrices: { jenin: 'oops', nowhere: 5, nablus: -3, hebron: '22' },
      locationPrices: { 'jenin-025': null, 'jenin-001': 12 },
    });
    expect(settings).toEqual({ regionPrices: { hebron: 22 }, locationPrices: { 'jenin-001': 12 } });
    expect(deliveryLocationPrice(burqin, settings)).toEqual({ price: 20, source: 'region' });
  });

  it('price range covers region and place prices', () => {
    expect(deliveryPriceRange(parseDeliveryPriceSettings(null))).toEqual({ min: 20, max: 70 });
    expect(deliveryPriceRange(parseDeliveryPriceSettings({ regionPrices: { golan: 90 }, locationPrices: { 'jenin-025': 10 } }))).toEqual({ min: 10, max: 90 });
  });

  it('the order snapshot keeps place, region names and the price charged', () => {
    const snapshot = deliveryLocationSnapshot(burqin, parseDeliveryPriceSettings({ regionPrices: { jenin: 25 } }));
    expect(snapshot).toEqual({ id: 'jenin-025', name: 'برقين', regionId: 'jenin', regionName: 'جنين', regionNameEn: 'Jenin', price: 25 });
    expect(deliveryLocationSnapshot({ id: 'x-001', nameAr: 'x', regionId: 'nowhere' }, null)).toBeNull();
    expect(deliveryLocationSnapshot(null, null)).toBeNull();
  });
});
