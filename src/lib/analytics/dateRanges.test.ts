import { describe, it, expect } from 'vitest';
import { addDays, daysInRange, presetRange, validateCustomRange } from './dateRanges';

// 2026-10-28 01:30 in Asia/Hebron is still 2026-10-27 in UTC — presets follow the store's day.
const NOW = Date.parse('2026-10-27T23:30:00Z');

describe('analytics date presets (store time zone, inclusive calendar days)', () => {
  it('today, yesterday, last 7 / 30 days and this month', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(presetRange('last7', NOW)).toEqual({ from: '2026-10-22', to: '2026-10-28' });
    expect(daysInRange(presetRange('last7', NOW))).toBe(7);
    expect(presetRange('last30', NOW)).toEqual({ from: '2026-09-29', to: '2026-10-28' });
    expect(daysInRange(presetRange('last30', NOW))).toBe(30);
    expect(presetRange('thisMonth', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-28' });
  });

  it('crosses month and year boundaries correctly', () => {
    const jan1 = Date.parse('2027-01-01T10:00:00Z');
    expect(presetRange('yesterday', jan1)).toEqual({ from: '2026-12-31', to: '2026-12-31' });
    expect(presetRange('thisMonth', jan1)).toEqual({ from: '2027-01-01', to: '2027-01-01' });
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('custom range validation', () => {
  it('accepts a valid range and rejects invalid, reversed, future and over-long ones', () => {
    expect(validateCustomRange({ from: '2026-10-01', to: '2026-10-28' }, NOW)).toEqual({ ok: true });
    expect(validateCustomRange({ from: '', to: '2026-10-28' }, NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateCustomRange({ from: '2026-10-10', to: '2026-10-01' }, NOW)).toEqual({ ok: false, reason: 'order' });
    expect(validateCustomRange({ from: '2026-10-01', to: '2026-10-29' }, NOW)).toEqual({ ok: false, reason: 'future' });
    expect(validateCustomRange({ from: '2025-01-01', to: '2026-10-28' }, NOW)).toEqual({ ok: false, reason: 'tooLong' });
  });
});
