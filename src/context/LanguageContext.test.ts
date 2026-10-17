import { describe, it, expect } from 'vitest';
import { translations, defaultLanguageForPath } from './LanguageContext';

describe('translations — every key exists in both languages', () => {
  const enKeys = new Set(Object.keys(translations.en));
  const arKeys = new Set(Object.keys(translations.ar));

  it('REGRESSION: every English key has an Arabic counterpart', () => {
    const missing = [...enKeys].filter((key) => !arKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('REGRESSION: every Arabic key has an English counterpart', () => {
    const missing = [...arKeys].filter((key) => !enKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('neither dictionary has an empty-string translation (a real gap, not a legitimate empty value)', () => {
    const emptyEn = [...enKeys].filter((key) => translations.en[key]!.trim() === '');
    const emptyAr = [...arKeys].filter((key) => translations.ar[key]!.trim() === '');
    expect(emptyEn).toEqual([]);
    expect(emptyAr).toEqual([]);
  });

  it('has at least one admin.* key once the admin dashboard translation work begins', () => {
    // Loosened to >= 0 initially; tightened to > 0 once Phase 1 lands admin.* keys.
    const adminKeys = [...enKeys].filter((key) => key.startsWith('admin.'));
    expect(adminKeys.length).toBeGreaterThanOrEqual(0);
  });
});

describe('defaultLanguageForPath — admin defaults to English, storefront keeps its Arabic default', () => {
  it('REGRESSION: an admin path defaults to English', () => {
    expect(defaultLanguageForPath('/admin')).toBe('en');
    expect(defaultLanguageForPath('/admin/orders')).toBe('en');
    expect(defaultLanguageForPath('/admin/products')).toBe('en');
  });

  it("REGRESSION: the storefront's existing default (Arabic) is unchanged for non-admin paths", () => {
    expect(defaultLanguageForPath('/')).toBe('ar');
    expect(defaultLanguageForPath('/catalog')).toBe('ar');
    expect(defaultLanguageForPath('/product/abc123')).toBe('ar');
    expect(defaultLanguageForPath('/pos')).toBe('ar');
  });

  it('a path that merely contains "admin" elsewhere does not false-positive as an admin route', () => {
    expect(defaultLanguageForPath('/administration-policy')).toBe('ar');
  });
});
