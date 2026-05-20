import { CATALOG_FILTER_CATEGORIES } from '../constants';

/** Map user/URL category to the canonical value stored on products. */
export function canonicalCategory(c?: string): string {
  if (!c || typeof c !== 'string') return '';
  const trimmed = c.trim();
  const known = CATALOG_FILTER_CATEGORIES.find(
    (cat) => cat.toLowerCase() === trimmed.toLowerCase()
  );
  if (known) return known;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
