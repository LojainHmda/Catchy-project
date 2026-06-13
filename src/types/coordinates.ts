/** A coordinate set sold like a product — price, sizes, multi-photo collage. */
export type CoordinateLook = {
  id: string;
  title: string;
  titleAr?: string;
  tagline?: string;
  taglineAr?: string;
  /** Up to 4 photos shown as a collage on catalog cards and detail page */
  images?: string[];
  /** Legacy single hero image — kept in sync with `images[0]` when possible */
  image: string;
  /** Admin bundle price for the whole set (used when priceAutoSync is false) */
  price?: number;
  /** When true (default), set price follows sum of linked items */
  priceAutoSync?: boolean;
  compareAtPrice?: number;
  onSale?: boolean;
  /** @deprecated Legacy — inventory always comes from linked products */
  sizeStock?: Record<string, number>;
  sizes?: string[];
  stock?: number;
  /** Linked product document IDs (shown in set grid on detail page) */
  productIds: string[];
  sortOrder: number;
  published: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type CoordinatesPageSettings = {
  heroTitle: string;
  heroTitleAr?: string;
  heroSubtitle: string;
  heroSubtitleAr?: string;
  heroImage?: string;
};

export const DEFAULT_COORDINATES_PAGE: CoordinatesPageSettings = {
  heroTitle: 'Perfectly Paired',
  heroTitleAr: 'تنسيقات متكاملة',
  heroSubtitle: 'Curated top-and-bottom sets styled to move together — effortless polish, every time.',
  heroSubtitleAr: 'مجموعات مختارة بعناية — أناقة متناسقة بلا مجهود.',
  heroImage:
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=85&w=1400',
};
