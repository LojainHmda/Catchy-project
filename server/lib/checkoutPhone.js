// Checkout mobile numbers: Palestinian mobiles only — exactly 10 digits starting with 05.
//
// Shared by the server (guest checkout) and the browser (checkout form, signed-in
// checkout); it lives under server/ because the production image ships only server/ and
// dist/. Firestore rules (firestore.rules → orders create) enforce the same pattern for
// orders written from the browser. A number is never rewritten to make it valid: one
// that does not start with 05 is refused, not "corrected".

/** The whole stored number: 05 followed by 8 more digits. */
export const CHECKOUT_MOBILE_PATTERN = /^05\d{8}$/;

/**
 * True when the (normalised) number is a valid checkout mobile.
 * @param {unknown} phone
 */
export function isCheckoutMobile(phone) {
  return typeof phone === 'string' && CHECKOUT_MOBILE_PATTERN.test(phone);
}

/**
 * True as soon as the digits typed so far can no longer become a 05… number — the first
 * digit is not 0, or the first two are not 05 (e.g. "07…", "59…", "+970…"). Empty or a
 * lone "0" is not wrong yet.
 * @param {unknown} raw
 */
export function hasWrongMobilePrefix(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length > 0 && !'05'.startsWith(digits.slice(0, 2));
}
