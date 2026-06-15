/** Firestore product document — discount fields are optional and owner-managed. */
export type ProductColorVariant = {
  id: string;
  name: string;
  nameAr?: string;
  /** Swatch for storefront picker (#rrggbb). */
  hex?: string;
  images: string[];
  sizeStock: Record<string, number>;
};

export type ProductRecord = {
  id: string;
  name: string;
  description?: string;
  price: number;
  /** Original price before discount; must be greater than `price` when on sale. */
  compareAtPrice?: number;
  /** Explicit sale flag set by admin. */
  onSale?: boolean;
  /** Legacy alias — treated the same as `onSale`. */
  sale?: boolean;
  category?: string;
  images?: string[];
  videos?: string[];
  sizes?: string[];
  sizeStock?: Record<string, number>;
  stock?: number;
  lifestyleImage?: string;
  /** Per-color inventory, images, and size counts. When set, drives storefront color picker. */
  colorVariants?: ProductColorVariant[];
  defaultColorId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ProductLike = Pick<ProductRecord, 'price' | 'compareAtPrice' | 'onSale' | 'sale'>;

export type DiscountFormMode = 'percent' | 'manual';

export type DiscountFormState = {
  enabled: boolean;
  mode: DiscountFormMode;
  /** Percent off (1–99) when mode is `percent`. */
  percent: string;
  /** Original / compare-at price (ILS). */
  compareAtPrice: string;
  /** Sale price customer pays (ILS). */
  salePrice: string;
};
