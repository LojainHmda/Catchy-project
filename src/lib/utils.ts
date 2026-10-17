import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Keystroke filters for numeric text inputs. We use type="text" instead of
 * type="number" for all numeric fields because Chromium renders a type="number"
 * input's digits using the page's locale numbering system (Eastern Arabic-Indic
 * digits under lang="ar"/dir="rtl") regardless of the input's own lang/dir
 * attributes — these sanitizers restore type="number"-like input filtering
 * while keeping the displayed and stored digits plain Western numerals.
 */
export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}
