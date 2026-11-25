import { normalizeSearchText } from '../orders/searchText';
import type { DeliveryLocation, DeliveryRegion } from './deliveryAreas';

/**
 * Search form of a place name or query: the order-search folding (Latin digits, case,
 * harakat and tatweel removed, أ إ آ ٱ → ا, ى → ي, ة → ه) plus the hamza seats
 * (ؤ → و, ئ → ي), Persian-keyboard ی / ک, and the punctuation used in the place list
 * (- _ ( ) ، , . /) read as spaces. "بئر السبع", "بير السبع" and "بِئر  السبع" all match.
 */
export function normalizeLocationText(raw: unknown): string {
  return normalizeSearchText(raw)
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[-_()،,./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type LocationSearchEntry = {
  location: DeliveryLocation;
  region: DeliveryRegion;
  /** Normalised place name. */
  name: string;
  /** Its words, each also without a leading "ال" ("الطيبه" → also "طيبه"). */
  words: string[];
  /** Normalised region names (Arabic + English, lower case) for "town + region" queries. */
  regionText: string;
  /** Lower-case English region name ("jenin"): place names are Arabic only. */
  regionEn: string;
  /** Position in the place list (stable tie-break). */
  order: number;
};

export function buildLocationSearchEntries(
  locations: readonly DeliveryLocation[],
  regionById: (id: string) => DeliveryRegion | null
): LocationSearchEntry[] {
  const entries: LocationSearchEntry[] = [];
  locations.forEach((location, order) => {
    const region = regionById(location.regionId);
    if (!region) return;
    const name = normalizeLocationText(location.nameAr);
    const words = name.split(' ').filter(Boolean);
    const withoutArticle = words.filter((w) => w.startsWith('ال') && w.length > 3).map((w) => w.slice(2));
    const regionEn = region.nameEn.toLowerCase();
    entries.push({
      location,
      region,
      name,
      words: [...words, ...withoutArticle],
      regionText: `${normalizeLocationText(region.nameAr)} ${normalizeLocationText(regionEn)}`,
      regionEn,
      order,
    });
  });
  return entries;
}

/** Lower = better. null = no match. */
function matchScore(entry: LocationSearchEntry, q: string, tokens: string[]): number | null {
  const { name } = entry;
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (entry.words.some((word) => word.startsWith(q))) return 2;
  if (name.includes(q)) return 3;
  if (tokens.length > 1) {
    // "الطيبه رام الله": every word must be in the place name or its region, and at
    // least one in the place name (so a region name alone never lists the whole region).
    let inName = 0;
    for (const token of tokens) {
      if (name.includes(token)) inName += 1;
      else if (!entry.regionText.includes(token)) return null;
    }
    if (inName === 0) return null;
    return inName === tokens.length ? 4 : 5;
  }
  // English query ("Jenin"): place names are Arabic only, so match the region's English name.
  if (/[a-z]/.test(q) && entry.regionEn.includes(q)) return entry.location.regionItself ? 6 : 7;
  return null;
}

/**
 * Places matching what the customer typed, best first: exact name, name starting with
 * the text, a word starting with it, the text anywhere in the name, then several words
 * spread over the place and its region. Ties: the region's own entry, shorter names,
 * then list order. Places with the same name in different regions are all returned —
 * the caller shows each one's region beside it.
 */
export function searchDeliveryLocations(
  entries: readonly LocationSearchEntry[],
  rawQuery: string,
  limit = 8
): LocationSearchEntry[] {
  const q = normalizeLocationText(rawQuery);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const scored: { entry: LocationSearchEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = matchScore(entry, q, tokens);
    if (score !== null) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(Boolean(b.entry.location.regionItself)) - Number(Boolean(a.entry.location.regionItself)) ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.order - b.entry.order
  );
  return scored.slice(0, Math.max(0, limit)).map((item) => item.entry);
}
