// Search normalisation for admin lists (orders, returns). Pure functions.

const ARABIC_INDIC_ZERO = 0x0660; // ٠..٩
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0; // ۰..۹ (Persian/Urdu forms)

/** "٠٥٩١٢٣" / "۰۵۹۱۲۳" → "059123" (other characters unchanged). */
export function toLatinDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= EXTENDED_ARABIC_INDIC_ZERO ? code - EXTENDED_ARABIC_INDIC_ZERO : code - ARABIC_INDIC_ZERO);
  });
}

/**
 * Case-, digit- and Arabic-spelling-insensitive form for substring matching:
 * Latin digits, lower case, no diacritics (harakat) or tatweel, unified alef
 * forms (أ إ آ ٱ → ا), ى → ي and ة → ه, collapsed whitespace.
 */
export function normalizeSearchText(raw: unknown): string {
  return toLatinDigits(String(raw ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}
