import type { DeliveryDetails } from '../../types/order';

export type DeliveryFormValues = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  email: string;
};

export type DeliveryValidationResult =
  | { ok: true; details: DeliveryDetails }
  | { ok: false; field: keyof DeliveryFormValues; messageKey: string };

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

export function emptyDeliveryForm(email = ''): DeliveryFormValues {
  return {
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    email,
  };
}

export function validateDeliveryDetails(values: DeliveryFormValues): DeliveryValidationResult {
  const customerName = values.customerName.trim();
  if (customerName.length < 2) {
    return { ok: false, field: 'customerName', messageKey: 'cart.deliveryNameRequired' };
  }

  const customerPhone = normalizePhone(values.customerPhone.trim());
  const digits = customerPhone.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    return { ok: false, field: 'customerPhone', messageKey: 'cart.deliveryPhoneInvalid' };
  }

  const deliveryAddress = values.deliveryAddress.trim();
  if (deliveryAddress.length < 8) {
    return { ok: false, field: 'deliveryAddress', messageKey: 'cart.deliveryAddressRequired' };
  }

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, field: 'email', messageKey: 'cart.deliveryEmailInvalid' };
  }

  return {
    ok: true,
    details: {
      customerName,
      customerPhone,
      deliveryAddress,
      email: email || null,
    },
  };
}

export function isDeliveryFormComplete(values: DeliveryFormValues): boolean {
  return validateDeliveryDetails(values).ok;
}
