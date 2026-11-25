import { dayKey, STORE_TIME_ZONE } from './tracker';

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom';
export type DayRange = { from: string; to: string };

export const MAX_RANGE_DAYS = 366;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD shifted by whole days (calendar arithmetic, no time-zone drift). */
export function addDays(day: string, delta: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysInRange({ from, to }: DayRange): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Calendar-day range for a preset, in the store's time zone (days end at local midnight). */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, nowMs: number, timeZone = STORE_TIME_ZONE): DayRange {
  const today = dayKey(nowMs, timeZone);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** Custom range check: valid dates, from ≤ to, not in the future, at most MAX_RANGE_DAYS. */
export function validateCustomRange(range: DayRange, nowMs: number, timeZone = STORE_TIME_ZONE): { ok: true } | { ok: false; reason: 'invalid' | 'order' | 'future' | 'tooLong' } {
  const { from, to } = range;
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) {
    return { ok: false, reason: 'invalid' };
  }
  if (from > to) return { ok: false, reason: 'order' };
  if (to > dayKey(nowMs, timeZone)) return { ok: false, reason: 'future' };
  if (daysInRange(range) > MAX_RANGE_DAYS) return { ok: false, reason: 'tooLong' };
  return { ok: true };
}
