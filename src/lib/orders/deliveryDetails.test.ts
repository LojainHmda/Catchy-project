import { describe, it, expect } from 'vitest';
import { emptyDeliveryForm, validateDeliveryDetails, type DeliveryFormValues } from './deliveryDetails';

const known = new Set(['jenin-025', 'jerusalem-012']);
const options = { isKnownLocation: (id: string) => known.has(id) };

const form = (overrides: Partial<DeliveryFormValues> = {}): DeliveryFormValues => ({
  ...emptyDeliveryForm(),
  customerName: 'Lina',
  customerPhone: '0591234567',
  deliveryLocationId: 'jenin-025',
  ...overrides,
});

describe('checkout delivery details', () => {
  it('a new form has no place, no address and no old zone field', () => {
    expect(emptyDeliveryForm('a@b.co')).toEqual({ customerName: '', customerPhone: '', deliveryLocationId: '', deliveryAddress: '', email: 'a@b.co' });
  });

  it('street / building / house number are OPTIONAL: an empty address is accepted', () => {
    for (const deliveryAddress of ['', '   ', 'x']) {
      const result = validateDeliveryDetails(form({ deliveryAddress }), options);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.details.deliveryAddress).toBe(deliveryAddress.trim());
    }
  });

  it('keeps the address details the customer typed (trimmed)', () => {
    const result = validateDeliveryDetails(form({ deliveryAddress: '  شارع الجامعة، عمارة 3  ' }), options);
    expect(result).toEqual({
      ok: true,
      details: { customerName: 'Lina', customerPhone: '0591234567', deliveryLocationId: 'jenin-025', deliveryAddress: 'شارع الجامعة، عمارة 3', email: null },
    });
  });

  it('a delivery place from the list is required', () => {
    expect(validateDeliveryDetails(form({ deliveryLocationId: '' }), options)).toMatchObject({ ok: false, field: 'deliveryLocationId', messageKey: 'cart.deliveryLocationRequired' });
    expect(validateDeliveryDetails(form({ deliveryLocationId: 'west_bank' }), options)).toMatchObject({ ok: false, field: 'deliveryLocationId' });
    expect(validateDeliveryDetails(form({ deliveryLocationId: 'nowhere-001' }), options)).toMatchObject({ ok: false, field: 'deliveryLocationId' });
  });

  it('the mobile number must start with 05: a clear message names the first two digits', () => {
    for (const customerPhone of ['0791234567', '5912345678', '0412345678', '9705912345']) {
      expect(validateDeliveryDetails(form({ customerPhone }), options)).toEqual({
        ok: false,
        field: 'customerPhone',
        messageKey: 'cart.deliveryPhoneMustStart05',
      });
    }
  });

  it('a 05 number with the wrong length asks for 10 digits starting with 05', () => {
    for (const customerPhone of ['', '0', '05', '059123456']) {
      expect(validateDeliveryDetails(form({ customerPhone }), options)).toEqual({
        ok: false,
        field: 'customerPhone',
        messageKey: 'cart.deliveryPhoneInvalid',
      });
    }
  });

  it('a valid 05 number is kept exactly (never rewritten)', () => {
    const result = validateDeliveryDetails(form({ customerPhone: '0561234567' }), options);
    expect(result).toMatchObject({ ok: true, details: { customerPhone: '0561234567' } });
  });

  it('name, phone and email rules are unchanged', () => {
    expect(validateDeliveryDetails(form({ customerName: 'L' }), options)).toMatchObject({ ok: false, field: 'customerName' });
    expect(validateDeliveryDetails(form({ customerPhone: '12345' }), options)).toMatchObject({ ok: false, field: 'customerPhone' });
    expect(validateDeliveryDetails(form({ email: 'not-an-email' }), options)).toMatchObject({ ok: false, field: 'email' });
    expect(validateDeliveryDetails(form({ email: 'a@b.co' }), options)).toMatchObject({ ok: true, details: { email: 'a@b.co' } });
  });
});
