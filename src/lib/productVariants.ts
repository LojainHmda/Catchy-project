import { coerceProductImages } from './productImages';
import {
  hasSizedInventory,
  parseSizeStock,
  resolveProductInventory,
  rowsToSizeStock,
  sizeStockToRows,
  totalFromSizeStock,
  type SizeRow,
  type SizeStock,
} from './productInventory';
import type { ProductColorVariant } from '../types/product';

export type ColorVariantFormRow = {
  id: string;
  name: string;
  nameAr: string;
  hex: string;
  images: string[];
  sizeRows: SizeRow[];
};

function newId(prefix: string) {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newColorVariantRow(partial?: Partial<ColorVariantFormRow>): ColorVariantFormRow {
  return {
    id: partial?.id ?? newId('color'),
    name: partial?.name ?? '',
    nameAr: partial?.nameAr ?? '',
    hex: partial?.hex ?? '#9ca3af',
    images: partial?.images ?? [],
    sizeRows: partial?.sizeRows ?? [],
  };
}

export function parseColorVariants(raw: unknown): ProductColorVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!id || !name) return null;
      const images = Array.isArray(row.images)
        ? row.images.filter((u): u is string => typeof u === 'string' && u.trim().length > 12)
        : [];
      return {
        id,
        name,
        nameAr: typeof row.nameAr === 'string' ? row.nameAr.trim() : undefined,
        hex: typeof row.hex === 'string' ? row.hex.trim() : undefined,
        images,
        sizeStock: parseSizeStock(row.sizeStock),
      } satisfies ProductColorVariant;
    })
    .filter((v): v is ProductColorVariant => v !== null);
}

export function hasColorVariants(product: { colorVariants?: unknown }): boolean {
  return parseColorVariants(product.colorVariants).length > 0;
}

export function colorCount(product: { colorVariants?: unknown }): number {
  return parseColorVariants(product.colorVariants).length;
}

export function variantLabel(variant: Pick<ProductColorVariant, 'name' | 'nameAr'>, isAr: boolean): string {
  if (isAr && variant.nameAr) return variant.nameAr;
  return variant.name;
}

export function getVariantById(
  product: { colorVariants?: unknown },
  colorId: string | null | undefined
): ProductColorVariant | null {
  const variants = parseColorVariants(product.colorVariants);
  if (!colorId) return variants[0] ?? null;
  return variants.find((v) => v.id === colorId) ?? null;
}

export function defaultVariantId(product: {
  colorVariants?: unknown;
  defaultColorId?: unknown;
}): string | null {
  const variants = parseColorVariants(product.colorVariants);
  if (!variants.length) return null;
  const preferred =
    typeof product.defaultColorId === 'string' ? product.defaultColorId.trim() : '';
  if (preferred && variants.some((v) => v.id === preferred)) return preferred;
  const inStock = variants.find((v) => totalFromSizeStock(v.sizeStock) > 0);
  return inStock?.id ?? variants[0]!.id;
}

type ProductInventoryFields = {
  colorVariants?: unknown;
  sizeStock?: unknown;
  sizes?: unknown;
  stock?: unknown;
};

/**
 * Storefront inventory for a product doc. When color variants exist they are the
 * source of truth — the top-level `stock`/`sizeStock` is a denormalized aggregate
 * that can drift stale, so we recompute from the variants instead.
 */
export function resolveListingInventory(data: ProductInventoryFields): {
  sizeStock: SizeStock;
  stock: number;
} {
  const variants = parseColorVariants(data.colorVariants);
  if (variants.length > 0) {
    const sizeStock = aggregateSizeStockFromVariants(variants);
    return { sizeStock, stock: totalFromSizeStock(sizeStock) };
  }
  return resolveProductInventory(data);
}

/** Whether a storefront listing should treat the product as buyable (variant-aware). */
export function isProductInStock(data: ProductInventoryFields): boolean {
  const { sizeStock, stock } = resolveListingInventory(data);
  if (hasSizedInventory(sizeStock)) return totalFromSizeStock(sizeStock) > 0;
  return stock > 0;
}

/** Sum inventory across all color variants (for catalog chips / legacy fields). */
export function aggregateSizeStockFromVariants(variants: ProductColorVariant[]): SizeStock {
  const map: SizeStock = {};
  variants.forEach((variant) => {
    Object.entries(variant.sizeStock).forEach(([size, qty]) => {
      map[size] = (map[size] ?? 0) + Math.max(0, qty);
    });
  });
  return map;
}

export function aggregateFromVariants(variants: ProductColorVariant[]): {
  stock: number;
  sizes: string[];
  sizeStock: SizeStock;
  images: string[];
  defaultColorId: string;
} {
  const sizeStock = aggregateSizeStockFromVariants(variants);
  const defaultColorId = defaultVariantId({ colorVariants: variants }) ?? variants[0]!.id;
  const defaultVariant = variants.find((v) => v.id === defaultColorId) ?? variants[0]!;
  return {
    stock: totalFromSizeStock(sizeStock),
    sizes: Object.keys(sizeStock),
    sizeStock,
    images: defaultVariant.images.length ? defaultVariant.images : [],
    defaultColorId,
  };
}

export function colorVariantFormFromProduct(product: Record<string, unknown>): ColorVariantFormRow[] {
  const parsed = parseColorVariants(product.colorVariants);
  if (parsed.length) {
    return parsed.map((variant) =>
      newColorVariantRow({
        id: variant.id,
        name: variant.name,
        nameAr: variant.nameAr ?? '',
        hex: variant.hex ?? '#9ca3af',
        images: variant.images,
        sizeRows: sizeStockToRows(variant.sizeStock),
      })
    );
  }
  return [];
}

export function legacyToSingleVariantForm(product: Record<string, unknown>): ColorVariantFormRow {
  const images = coerceProductImages(product);
  const sizeStock = parseSizeStock(product.sizeStock);
  const rows = sizeStockToRows(sizeStock);
  return newColorVariantRow({
    name: 'Default',
    images,
    sizeRows: rows.length ? rows : [{ id: newId('row'), size: 'One Size', quantity: String(product.stock ?? 0) }],
  });
}

export function variantRowsToFirestore(rows: ColorVariantFormRow[]): {
  colorVariants: ProductColorVariant[];
  defaultColorId: string;
  stock: number;
  sizes: string[];
  sizeStock: SizeStock;
  images: string[];
  error?: string;
} {
  const colorVariants: ProductColorVariant[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) return { colorVariants: [], defaultColorId: '', stock: 0, sizes: [], sizeStock: {}, images: [], error: 'Every color needs a name.' };

    const { sizeStock, error } = rowsToSizeStock(row.sizeRows);
    if (error) return { colorVariants: [], defaultColorId: '', stock: 0, sizes: [], sizeStock: {}, images: [], error };

    const images = row.images.filter((u) => u.trim().length > 12);
    if (!images.length) {
      return {
        colorVariants: [],
        defaultColorId: '',
        stock: 0,
        sizes: [],
        sizeStock: {},
        images: [],
        error: `Add at least one photo for "${name}".`,
      };
    }

    colorVariants.push({
      id: row.id,
      name,
      nameAr: row.nameAr.trim() || undefined,
      hex: row.hex.trim() || undefined,
      images,
      sizeStock,
    });
  }

  if (!colorVariants.length) {
    return { colorVariants: [], defaultColorId: '', stock: 0, sizes: [], sizeStock: {}, images: [], error: 'Add at least one color.' };
  }

  const names = colorVariants.map((v) => v.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    return { colorVariants: [], defaultColorId: '', stock: 0, sizes: [], sizeStock: {}, images: [], error: 'Duplicate color names.' };
  }

  const agg = aggregateFromVariants(colorVariants);
  if (agg.stock <= 0) {
    return { colorVariants: [], defaultColorId: '', stock: 0, sizes: [], sizeStock: {}, images: [], error: 'Add stock for at least one size in any color.' };
  }

  return { colorVariants, ...agg };
}

export function resolveVariantSelection(
  product: Record<string, unknown>,
  colorId: string | null | undefined
): {
  hasVariants: boolean;
  variant: ProductColorVariant | null;
  sizeStock: SizeStock;
  stock: number;
  images: string[];
} {
  const variants = parseColorVariants(product.colorVariants);
  if (!variants.length) {
    const sizeStock = parseSizeStock(product.sizeStock);
    const stock =
      Object.keys(sizeStock).length > 0
        ? totalFromSizeStock(sizeStock)
        : Math.max(0, Math.floor(Number(product.stock) || 0));
    return {
      hasVariants: false,
      variant: null,
      sizeStock,
      stock,
      images: coerceProductImages(product),
    };
  }

  const id = colorId && variants.some((v) => v.id === colorId) ? colorId : defaultVariantId(product);
  const variant = variants.find((v) => v.id === id) ?? variants[0]!;
  const sizeStock = variant.sizeStock;
  return {
    hasVariants: true,
    variant,
    sizeStock,
    stock: totalFromSizeStock(sizeStock),
    images: variant.images.length ? variant.images : coerceProductImages(product),
  };
}

export function decrementColorVariants(
  variants: ProductColorVariant[],
  colorId: string,
  size: string | null | undefined,
  quantity: number
): ProductColorVariant[] {
  const idx = variants.findIndex((v) => v.id === colorId);
  if (idx < 0) throw new Error('COLOR_REQUIRED');
  const variant = variants[idx]!;
  const sizeStock = { ...variant.sizeStock };
  if (!size) throw new Error('SIZE_REQUIRED');
  const current = Math.max(0, sizeStock[size] ?? 0);
  if (current < quantity) throw new Error('OUT_OF_STOCK');
  sizeStock[size] = current - quantity;
  const next = [...variants];
  next[idx] = { ...variant, sizeStock };
  return next;
}

export function cartLineKey(
  productId: string,
  options?: { size?: string | null; colorId?: string | null }
): string {
  const parts = [productId];
  if (options?.colorId) parts.push(options.colorId);
  if (options?.size) parts.push(options.size);
  return parts.join('::');
}
