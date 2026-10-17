import { deleteField, type FieldValue } from 'firebase/firestore';
import type { DiscountFormState, ProductLike } from '../types/product';

export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePriceInput(raw: string): number | null {
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) && n >= 0 ? roundPrice(n) : null;
}

/** True when product has a valid, persisted discount (explicit flag + compare-at > sale price). */
export function isProductOnSale(p: ProductLike): boolean {
  const price = Number(p.price);
  const compareAt = Number(p.compareAtPrice);
  if (p.onSale !== true && p.sale !== true) return false;
  if (!Number.isFinite(price) || price < 0) return false;
  if (!Number.isFinite(compareAt) || compareAt <= price) return false;
  return true;
}

export function getDiscountPercent(compareAt: number, salePrice: number): number {
  if (!Number.isFinite(compareAt) || compareAt <= 0 || salePrice >= compareAt) return 0;
  return Math.round((1 - salePrice / compareAt) * 100);
}

export function getDiscountAmount(compareAt: number, salePrice: number): number {
  if (!Number.isFinite(compareAt) || compareAt <= salePrice) return 0;
  return roundPrice(compareAt - salePrice);
}

export function applyPercentToPrice(originalPrice: number, percent: number): number {
  const clamped = Math.min(99, Math.max(1, Math.round(percent)));
  return roundPrice(originalPrice * (1 - clamped / 100));
}

export function validateDiscountInputs(
  compareAt: number,
  salePrice: number,
  t: (key: string) => string = (key) => key
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(compareAt) || compareAt <= 0) {
    return { ok: false, message: t('admin.products.form.invalidOriginalPrice') };
  }
  if (!Number.isFinite(salePrice) || salePrice < 0) {
    return { ok: false, message: t('admin.products.form.invalidSalePrice') };
  }
  if (salePrice >= compareAt) {
    return { ok: false, message: t('admin.products.form.salePriceTooHigh') };
  }
  if (getDiscountPercent(compareAt, salePrice) < 1) {
    return { ok: false, message: t('admin.products.form.discountTooSmall') };
  }
  return { ok: true };
}

export function buildDiscountUpdate(compareAt: number, salePrice: number) {
  return {
    onSale: true,
    compareAtPrice: roundPrice(compareAt),
    price: roundPrice(salePrice),
    sale: deleteField(),
  };
}

export function buildRemoveDiscountUpdate(product: ProductLike): {
  price: number;
  onSale: FieldValue;
  compareAtPrice: FieldValue;
  sale: FieldValue;
} {
  const currentPrice = Number(product.price);
  const compareAt = Number(product.compareAtPrice);
  const restored =
    Number.isFinite(compareAt) && compareAt > currentPrice ? roundPrice(compareAt) : roundPrice(currentPrice);

  return {
    price: restored,
    onSale: deleteField(),
    compareAtPrice: deleteField(),
    sale: deleteField(),
  };
}

export function discountFormFromProduct(product: ProductLike & { price: number }): DiscountFormState {
  const onSale = isProductOnSale(product);
  const price = Number(product.price);
  const compareAt = Number(product.compareAtPrice);

  if (onSale && Number.isFinite(compareAt)) {
    return {
      enabled: true,
      mode: 'manual',
      percent: String(getDiscountPercent(compareAt, price)),
      compareAtPrice: compareAt.toFixed(2),
      salePrice: price.toFixed(2),
    };
  }

  return {
    enabled: false,
    mode: 'percent',
    percent: '20',
    compareAtPrice: Number.isFinite(price) ? price.toFixed(2) : '',
    salePrice: '',
  };
}

export function resolveDiscountFromForm(
  form: DiscountFormState,
  basePrice: number,
  t: (key: string) => string = (key) => key
): { ok: true; compareAt: number; salePrice: number } | { ok: false; message: string } {
  if (!form.enabled) {
    return { ok: false, message: t('admin.products.form.discountDisabled') };
  }

  if (form.mode === 'percent') {
    const percent = parseFloat(form.percent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 99) {
      return { ok: false, message: t('admin.discounts.invalidPercent') };
    }
    const compareAt = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : parsePriceInput(form.compareAtPrice);
    if (compareAt == null || compareAt <= 0) {
      return { ok: false, message: t('admin.products.form.invalidBasePrice') };
    }
    const salePrice = applyPercentToPrice(compareAt, percent);
    const check = validateDiscountInputs(compareAt, salePrice, t);
    if (!check.ok) return check;
    return { ok: true, compareAt, salePrice };
  }

  const compareAt = parsePriceInput(form.compareAtPrice);
  const salePrice = parsePriceInput(form.salePrice);
  if (compareAt == null || salePrice == null) {
    return { ok: false, message: t('admin.products.form.invalidPricesPair') };
  }
  const check = validateDiscountInputs(compareAt, salePrice, t);
  if (!check.ok) return check;
  return { ok: true, compareAt, salePrice };
}

export function formatIls(amount: number): string {
  return `ILS ${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
