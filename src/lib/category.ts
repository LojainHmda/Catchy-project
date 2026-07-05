import { CATALOG_FILTER_CATEGORIES } from '../constants';

/**
 * Admin-managed category ids registered at runtime (from Firestore). Lets {@link canonicalCategory}
 * preserve the exact casing of custom/multi-word categories so product↔filter matching stays stable.
 */
let dynamicKnownCategories: string[] = [];

export function setKnownCategories(ids: string[]): void {
  dynamicKnownCategories = ids.filter((id) => typeof id === 'string' && id.trim().length > 0);
}

/** Map user/URL category to the canonical value stored on products. */
export function canonicalCategory(c?: string): string {
  if (!c || typeof c !== 'string') return '';
  const trimmed = c.trim();
  const known =
    dynamicKnownCategories.find((cat) => cat.toLowerCase() === trimmed.toLowerCase()) ??
    CATALOG_FILTER_CATEGORIES.find((cat) => cat.toLowerCase() === trimmed.toLowerCase());
  if (known) return known;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
