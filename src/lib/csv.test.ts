import { describe, it, expect } from 'vitest';
import { csvFileName, toCsv } from './csv';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines, and leaves plain values alone', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'line1\nline2', 5, null, undefined, true]])).toBe(
      'a,"b,c","say ""hi""","line1\nline2",5,,,true'
    );
  });

  it('joins rows with CRLF and keeps Arabic text intact', () => {
    expect(toCsv([['الاسم', 'Name'], ['ليلى', 'Layla']])).toBe('الاسم,Name\r\nليلى,Layla');
  });

  it('neutralises spreadsheet formulas in text cells but not in numbers', () => {
    expect(toCsv([['=SUM(A1)', '+970599', '@x', -5]])).toBe("'=SUM(A1),'+970599,'@x,-5");
  });
});

describe('csvFileName', () => {
  it('uses the local date', () => {
    expect(csvFileName('catchy-orders', new Date(2026, 0, 5))).toBe('catchy-orders-2026-01-05.csv');
  });
});
