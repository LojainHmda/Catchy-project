import { describe, it, expect, beforeAll } from 'vitest';
import { loadDeliveryLocationIndex, type DeliveryLocationIndex } from './deliveryAreas';
import { normalizeLocationText, searchDeliveryLocations } from './locationSearch';

let index: DeliveryLocationIndex;
beforeAll(async () => {
  index = await loadDeliveryLocationIndex();
});

const search = (q: string, limit?: number) => searchDeliveryLocations(index.search, q, limit);
const ids = (q: string, limit?: number) => search(q, limit).map((e) => e.location.id);
const names = (q: string, limit?: number) => search(q, limit).map((e) => e.location.nameAr);

describe('Arabic normalisation for place search', () => {
  it.each([
    ['أبو ديس', 'ابو ديس'],
    ['إبزيع', 'ابزيع'],
    ['آمنة', 'امنه'],
    ['الطيبة', 'الطيبه'],
    ['مصطفى', 'مصطفي'],
    ['بئر السبع', 'بير السبع'],
    ['مؤتة', 'موته'],
    ['جَنِين', 'جنين'],
    ['جنـــين', 'جنين'],
    ['جنین', 'جنين'], // Persian-keyboard yeh
    ['مدينة جنين-الحي الشرقي', 'مدينه جنين الحي الشرقي'],
    ['  رام   الله ', 'رام الله'],
    ['شارع ١٥', 'شارع 15'],
  ])('%s → %s', (raw, folded) => {
    expect(normalizeLocationText(raw)).toBe(folded);
  });
});

describe('place autocomplete', () => {
  it('typing a town name puts that town first ("جنين" → the Jenin entry)', () => {
    const [first] = search('جنين');
    expect(first.location).toMatchObject({ id: 'jenin-033', nameAr: 'جنين', regionItself: true });
    expect(first.region.nameAr).toBe('جنين');
  });

  it('completes from the first letters ("برق" → برقين in Jenin)', () => {
    expect(ids('برق')).toContain('jenin-025');
    expect(names('برقي')[0]).toBe('برقين');
  });

  it('ignores alef/hamza forms, ta marbuta, alef maqsura, diacritics and tatweel', () => {
    for (const q of ['ابو ديس', 'أبو ديس', 'أبُو دِيس', 'ابـو ديس']) expect(ids(q)[0]).toBe('jerusalem-suburbs-001');
    for (const q of ['بئر السبع', 'بير السبع', 'بِئْرُ السَّبْعِ']) expect(ids(q)[0]).toBe('beersheba-naqab-030');
    for (const q of ['بيت أولا', 'بيت اولا']) expect(ids(q)[0]).toBe('hebron-011');
  });

  it('same-named places in different regions are all offered, each with its own region', () => {
    const results = search('الطيبه');
    const taybeh = results.filter((e) => e.location.nameAr === 'الطيبة');
    expect(taybeh.map((e) => e.region.nameAr)).toEqual(['جنين', 'رام الله والبيرة', 'المثلث']);
    expect(taybeh.map((e) => e.region.nameEn)).toEqual(['Jenin', 'Ramallah & Al-Bireh', 'Triangle']);
    expect(new Set(taybeh.map((e) => e.location.id)).size).toBe(3);
  });

  it('a place plus its region narrows the duplicates ("الطيبة رام الله" → only Ramallah\'s)', () => {
    expect(ids('الطيبة رام الله')).toEqual(['ramallah-albireh-008']);
    expect(ids('طيبة المثلث')).toEqual(['triangle-002']);
  });

  it('finds a neighbourhood by its own name inside "City-Neighbourhood" names', () => {
    expect(names('الحي الشرقي')).toContain('مدينة جنين-الحي الشرقي');
  });

  it('an English region name offers that region (place names are Arabic only)', () => {
    const [first] = search('Jenin');
    expect(first.location.id).toBe('jenin-033');
    expect(search('hebron').slice(0, 2).map((e) => e.location.id).sort()).toEqual(['hebron-002', 'hebron-city-005']);
  });

  it('returns nothing for empty or unknown text, and at most the requested number', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
    expect(search('زززز')).toEqual([]);
    expect(search('qqqq')).toEqual([]);
    expect(search('ال')).toHaveLength(8);
    expect(search('ال', 3)).toHaveLength(3);
  });

  it('a region name alone does not list every place in it', () => {
    const results = search('رام الله');
    expect(results[0].location.id).toBe('ramallah-albireh-057');
    expect(results.every((e) => normalizeLocationText(e.location.nameAr).includes('رام الله'))).toBe(true);
  });
});
