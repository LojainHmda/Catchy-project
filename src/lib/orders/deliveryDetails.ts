import type { DeliveryDetails } from '../../types/order';
import { hasWrongMobilePrefix, isCheckoutMobile } from '../../../server/lib/checkoutPhone.js';

export { hasWrongMobilePrefix, isCheckoutMobile };

export type DeliveryFormValues = {
  customerName: string;
  customerPhone: string;
  /** Chosen delivery place (Catchy id) — required. */
  deliveryLocationId: string;
  /** Street, building, house number, directions — optional. */
  deliveryAddress: string;
  email: string;
};

export type DeliveryValidationResult =
  | { ok: true; details: DeliveryDetails }
  | { ok: false; field: keyof DeliveryFormValues; messageKey: string };

export type DeliveryValidationOptions = {
  /** True when the id is one of Catchy's delivery places (omit to accept any non-empty id). */
  isKnownLocation?: (locationId: string) => boolean;
};

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

export function emptyDeliveryForm(email = ''): DeliveryFormValues {
  return {
    customerName: '',
    customerPhone: '',
    deliveryLocationId: '',
    deliveryAddress: '',
    email,
  };
}

/** Same rules as the server (server/lib/checkoutOrder.js validateDelivery). */
export function validateDeliveryDetails(
  values: DeliveryFormValues,
  options: DeliveryValidationOptions = {}
): DeliveryValidationResult {
  const customerName = values.customerName.trim();
  if (customerName.length < 2) {
    return { ok: false, field: 'customerName', messageKey: 'cart.deliveryNameRequired' };
  }

  // Palestinian mobile numbers only: 10 digits starting with 05 (also enforced by the
  // guest-checkout server and the Firestore rules). Never rewritten to make it valid.
  const customerPhone = normalizePhone(values.customerPhone.trim());
  if (hasWrongMobilePrefix(customerPhone)) {
    return { ok: false, field: 'customerPhone', messageKey: 'cart.deliveryPhoneMustStart05' };
  }
  if (!isCheckoutMobile(customerPhone)) {
    return { ok: false, field: 'customerPhone', messageKey: 'cart.deliveryPhoneInvalid' };
  }

  const deliveryLocationId = values.deliveryLocationId.trim();
  if (!deliveryLocationId || (options.isKnownLocation && !options.isKnownLocation(deliveryLocationId))) {
    return { ok: false, field: 'deliveryLocationId', messageKey: 'cart.deliveryLocationRequired' };
  }

  // Street, building, house number and directions are optional: never validated as required.
  const deliveryAddress = values.deliveryAddress.trim();

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, field: 'email', messageKey: 'cart.deliveryEmailInvalid' };
  }

  return {
    ok: true,
    details: {
      customerName,
      customerPhone,
      deliveryLocationId,
      deliveryAddress,
      email: email || null,
    },
  };
}

export function isDeliveryFormComplete(values: DeliveryFormValues, options: DeliveryValidationOptions = {}): boolean {
  return validateDeliveryDetails(values, options).ok;
}
