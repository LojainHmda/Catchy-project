import { getDiscountPercent, isProductOnSale } from './productDiscount';

export type CatalogProductLike = {
  id: string;
  price: number;
  compareAtPrice?: number;
  sale?: boolean;
  onSale?: boolean;
};

export type CatalogSaleMeta = {
  compareAt: number | null;
  onSale: boolean;
  discountPercent: number;
};

/** Catalog sale badge + discount filter — uses only real Firestore discount fields. */
export function getCatalogSaleMeta(p: CatalogProductLike): CatalogSaleMeta {
  const price = Number(p.price);
  const compareAt = Number(p.compareAtPrice);
  const onSale = isProductOnSale(p);

  return {
    compareAt: onSale && Number.isFinite(compareAt) ? roundDisplay(compareAt) : null,
    onSale,
    discountPercent: onSale ? getDiscountPercent(compareAt, price) : 0,
  };
}

export function isProductDiscounted(p: CatalogProductLike): boolean {
  return getCatalogSaleMeta(p).onSale;
}

function roundDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}
