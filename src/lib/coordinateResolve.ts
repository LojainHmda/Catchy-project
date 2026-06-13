import { getCatalogSaleMeta } from './catalogSale';
import type { CoordinateLook } from '../types/coordinates';
import {
  hasSizedInventory,
  resolveProductInventory,
  stockForSelection,
  totalFromSizeStock,
  type SizeStock,
} from './productInventory';

export type ProductLike = Record<string, unknown> & {
  id?: string;
  price?: number;
};

export type ResolvedCoordinate = {
  /** Price shoppers pay for the whole set */
  price: number;
  /** Sum of individual item prices (before bundle override) */
  itemsTotal: number;
  compareAtPrice: number | null;
  onSale: boolean;
  discountPercent: number;
  /** Admin set a custom price below items total */
  bundleDiscount: boolean;
  sizeStock: SizeStock;
  stock: number;
  sizes: string[];
  products: ProductLike[];
};

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

type ItemsAggregate = {
  itemsTotal: number;
  itemsCompareAt: number;
  itemsOnSale: boolean;
  sizeStock: SizeStock;
  stock: number;
  sizes: string[];
  products: ProductLike[];
};

/** Inventory + item price sum from linked products (no bundle override). */
export function aggregateCoordinateItems(
  look: Pick<CoordinateLook, 'productIds'>,
  products: ProductLike[]
): ItemsAggregate | null {
  const ordered = (look.productIds ?? [])
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is ProductLike => Boolean(p));

  if (ordered.length === 0) return null;

  let itemsTotal = 0;
  let itemsCompareAt = 0;
  let itemsOnSale = false;

  ordered.forEach((product) => {
    const unit = Number(product.price) || 0;
    const meta = getCatalogSaleMeta(product as { id: string; price: number });
    itemsTotal += unit;
    if (meta.onSale && meta.compareAt != null) {
      itemsOnSale = true;
      itemsCompareAt += meta.compareAt;
    } else {
      itemsCompareAt += unit;
    }
  });

  itemsTotal = roundPrice(itemsTotal);
  itemsCompareAt = roundPrice(itemsCompareAt);

  const inventories = ordered.map((p) => resolveProductInventory(p));
  const allSized = inventories.every((inv) => hasSizedInventory(inv.sizeStock));

  if (allSized) {
    const sizeStock: SizeStock = {};
    const stock = Math.min(
      ...inventories.map((inv) =>
        hasSizedInventory(inv.sizeStock) ? totalFromSizeStock(inv.sizeStock) : inv.stock
      )
    );

    return {
      itemsTotal,
      itemsCompareAt,
      itemsOnSale,
      sizeStock,
      stock,
      sizes: [],
      products: ordered,
    };
  }

  return {
    itemsTotal,
    itemsCompareAt,
    itemsOnSale,
    sizeStock: {},
    stock: Math.min(...inventories.map((inv) => inv.stock)),
    sizes: [],
    products: ordered,
  };
}

function sellingPriceForLook(
  look: Pick<CoordinateLook, 'price' | 'priceAutoSync'>,
  itemsTotal: number
): number {
  if (look.priceAutoSync !== false) return itemsTotal;
  const custom = Number(look.price);
  if (Number.isFinite(custom) && custom > 0) return roundPrice(custom);
  return itemsTotal;
}

/**
 * Full coordinate resolution: inventory from linked products, price from admin bundle or items sum.
 */
export function resolveCoordinate(
  look: Pick<CoordinateLook, 'productIds' | 'price' | 'priceAutoSync'>,
  products: ProductLike[]
): ResolvedCoordinate | null {
  const agg = aggregateCoordinateItems(look, products);
  if (!agg) return null;

  const price = sellingPriceForLook(look, agg.itemsTotal);
  const bundleDiscount = price < agg.itemsTotal;
  const compareAtPrice = bundleDiscount
    ? agg.itemsTotal
    : agg.itemsOnSale && agg.itemsCompareAt > agg.itemsTotal
      ? agg.itemsCompareAt
      : null;
  const onSale = bundleDiscount || Boolean(compareAtPrice && compareAtPrice > price);
  const discountPercent =
    compareAtPrice && compareAtPrice > price
      ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100)
      : 0;

  return {
    price,
    itemsTotal: agg.itemsTotal,
    compareAtPrice,
    onSale,
    discountPercent,
    bundleDiscount,
    sizeStock: agg.sizeStock,
    stock: agg.stock,
    sizes: agg.sizes,
    products: agg.products,
  };
}

/** @deprecated Use resolveCoordinate */
export function resolveCoordinateFromProducts(
  look: Pick<CoordinateLook, 'productIds' | 'price' | 'priceAutoSync'>,
  products: ProductLike[]
): ResolvedCoordinate | null {
  return resolveCoordinate(look, products);
}

export function coordinateStockForSize(resolved: ResolvedCoordinate, size: string | null): number {
  return stockForSelection(resolved.sizeStock, resolved.stock, size);
}

export function coordinateSizesSummaryFromResolved(resolved: ResolvedCoordinate): string {
  if (resolved.sizes.length === 0) return resolved.stock > 0 ? `${resolved.stock} in stock` : '—';
  if (resolved.sizes.length <= 3) return resolved.sizes.join(', ');
  return `${resolved.sizes.slice(0, 2).join(', ')} +${resolved.sizes.length - 2}`;
}

export function isCoordinateAvailable(
  look: Pick<CoordinateLook, 'productIds' | 'published' | 'images' | 'image' | 'price' | 'priceAutoSync'>,
  products: ProductLike[],
  hasPhotos: boolean
): boolean {
  if (look.published === false || !hasPhotos) return false;
  const resolved = resolveCoordinate(look, products);
  if (!resolved || resolved.price <= 0) return false;
  return coordinateHasAnyStock(products);
}

function coordinateHasAnyStock(products: ProductLike[]): boolean {
  if (products.length === 0) return false;
  return products.every((product) => {
    const { sizeStock, stock } = resolveProductInventory(product);
    if (hasSizedInventory(sizeStock)) return Object.values(sizeStock).some((n) => n > 0);
    return stock > 0;
  });
}

/** Suggested set price when syncing from items */
export function itemsTotalForLook(
  look: Pick<CoordinateLook, 'productIds'>,
  products: ProductLike[]
): number {
  return aggregateCoordinateItems(look, products)?.itemsTotal ?? 0;
}
