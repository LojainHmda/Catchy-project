// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hasWrongMobilePrefix, isCheckoutMobile } from './checkoutPhone.js';

describe('checkout mobile numbers: 10 digits starting with 05', () => {
  it.each(['0591234567', '0561234567', '0500000000', '0599999999'])('accepts %s', (phone) => {
    expect(isCheckoutMobile(phone)).toBe(true);
    expect(hasWrongMobilePrefix(phone)).toBe(false);
  });

  it.each([
    ['another first two digits', '0791234567'],
    ['04 landline-style prefix', '0412345678'],
    ['missing the leading 0', '5912345678'],
    ['country code +970', '+970591234567'],
    ['country code 970 without +', '9705912345'],
    ['too short', '059123456'],
    ['too long', '05912345678'],
    ['spaces or dashes left in', '059 123 4567'],
    ['empty', ''],
  ])('refuses %s (%s)', (_label, phone) => {
    expect(isCheckoutMobile(phone)).toBe(false);
  });

  it('refuses non-strings', () => {
    for (const value of [null, undefined, 591234567, {}, []]) expect(isCheckoutMobile(value)).toBe(false);
  });

  it('flags a wrong prefix as soon as the first or second digit is wrong', () => {
    for (const typed of ['7', '07', '079', '5', '59', '1', '+970', '970', '04']) expect(hasWrongMobilePrefix(typed)).toBe(true);
    for (const typed of ['', '0', '05', '059', '0591234567']) expect(hasWrongMobilePrefix(typed)).toBe(false);
  });
});
