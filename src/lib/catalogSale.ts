type CatalogProductLike = {
  id: string;
  price: number;
  compareAtPrice?: number;
  sale?: boolean;
  onSale?: boolean;
};

function hashFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return Math.abs(h);
}

/**
 * Catalog “sale” badge + discount filter share the same rules:
 * real `compareAtPrice` / `sale` fields when present, otherwise a stable mock from product id.
 */
export function getCatalogSaleMeta(p: CatalogProductLike) {
  const h = hashFromId(p.id);
  const nColors = 2 + (h % 6);
  const price = Number(p.price);
  const rawMsrp = Number(p.compareAtPrice);

  if (p?.sale === true || p?.onSale === true) {
    const compareAt =
      Number.isFinite(rawMsrp) && rawMsrp > price
        ? Math.round(rawMsrp)
        : Math.round(price * (1.22 + (h % 20) / 100));
    return { compareAt, onSale: true as const, nColors };
  }
  if (Number.isFinite(rawMsrp) && Number.isFinite(price) && rawMsrp > price) {
    return { compareAt: Math.round(rawMsrp), onSale: true as const, nColors };
  }

  const onSale = h % 3 === 0;
  const compareAt = onSale ? Math.round(price * (1.22 + (h % 20) / 100)) : null;
  return { compareAt, onSale, nColors };
}

export function isProductDiscounted(p: CatalogProductLike): boolean {
  return getCatalogSaleMeta(p).onSale;
}
