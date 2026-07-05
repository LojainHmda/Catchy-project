import React from 'react';
import { CATEGORY_ICONS } from '../constants';

export type CategoryIconComponent = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  size?: number | string;
}>;

/** Build a clothing icon component in the shared hand-drawn style. */
function garment(children: React.ReactNode): CategoryIconComponent {
  return function GarmentIcon(props) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

/** Existing hand-drawn garment icons (reused from the home category bar). */
const GARMENT_ICONS: Record<string, CategoryIconComponent> = {
  dresses: CATEGORY_ICONS['Dresses'],
  tops: CATEGORY_ICONS['Tops'],
  shirts: CATEGORY_ICONS['Shirts'],
  pants: CATEGORY_ICONS['Pants'],
  skirts: CATEGORY_ICONS['Skirts'],
  longSkirtSets: CATEGORY_ICONS['Long Skirt Sets'],
  jackets: CATEGORY_ICONS['Jackets'],
  formalSets: CATEGORY_ICONS['Formal Sets'],
  practicalSets: CATEGORY_ICONS['Practical Sets'],
  coordinates: CATEGORY_ICONS['Coordinates'],
};

/** Additional clothing / fashion icons (all garments — no generic shapes). */
const CLOTHING_ICONS: Record<string, CategoryIconComponent> = {
  tshirt: garment(
    <path d="M8 4 4.3 6.3l1.5 2.9 1.4-.9V20h9.6V8.3l1.4.9 1.5-2.9L16 4l-1.9 1.1a3.2 3.2 0 0 1-4.2 0L8 4Z" />
  ),
  blouse: garment(
    <>
      <path d="M8.5 4 5 6.5l1.4 3 1.6-1V20h8V8.5l1.6 1L19 6.5 15.5 4l-1.7 1.3a2.8 2.8 0 0 1-3.6 0L8.5 4Z" />
      <path d="M12 6.5v11M12 9.5h-.9m.9 2.6h-.9m.9 2.6h-.9" />
    </>
  ),
  hoodie: garment(
    <>
      <path d="M7.6 4.6 4.4 7l1.5 2.7 1.5-1V20h9V8.7l1.5 1L19.6 7l-3.2-2.4" />
      <path d="M7.6 4.6c0 2.2 2 3.5 4.4 3.5s4.4-1.3 4.4-3.5" />
      <path d="M10.6 9.5v3.3M13.4 9.5v3.3" />
      <path d="M9.4 15.2h5.2v3.2H9.4z" />
    </>
  ),
  sweater: garment(
    <>
      <path d="M8 4.4 4.4 6.9l1.6 3 1.4-1V20h9V8.9l1.4 1 1.6-3L16 4.4" />
      <path d="M9.4 4.4c0 1.5 1.2 2.4 2.6 2.4s2.6-.9 2.6-2.4" />
      <path d="M6.3 11.8l1.3.7M17.7 11.8l-1.3.7" />
    </>
  ),
  cardigan: garment(
    <>
      <path d="M8 4.4 4.4 6.9l1.6 3 1.4-1V20h9V8.9l1.4 1 1.6-3L16 4.4l-2.5 1.6h-3L8 4.4Z" />
      <path d="M11 6v14M13 6v14" />
      <path d="M12 9.2v.01M12 12v.01M12 14.8v.01" />
    </>
  ),
  coat: garment(
    <>
      <path d="M8.5 4 5.5 6v14h13V6l-3-2-3.5 2L8.5 4Z" />
      <path d="M12 6v14" />
      <path d="M5.5 6 4 9M18.5 6 20 9" />
    </>
  ),
  abaya: garment(
    <>
      <path d="M9.5 3.6 8 6.4l-2.4 2L7 20.4h10l1.4-12L16 6.4l-1.5-2.8" />
      <path d="M9.5 3.6h5M12 3.6v16.8" />
    </>
  ),
  scarf: garment(
    <>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M10 11v8.5M14 11v8.5" />
      <path d="M9.5 19.5h1M13.5 19.5h1" />
    </>
  ),
  vest: garment(
    <>
      <path d="M9 4 6 6.2V20h4.5l1.5-3.4L13.5 20H18V6.2L15 4l-3 3-3-3Z" />
      <path d="M12 7.2v5.5" />
    </>
  ),
  shorts: garment(
    <>
      <path d="M6 5.5h12l.4 6-1 5h-3.8L12 11l-1.6 5.5H6.6l-1-5L6 5.5Z" />
      <path d="M6 8.2h12" />
    </>
  ),
  hat: garment(
    <>
      <path d="M3.8 16c2.2-1 5.2-1.6 8.2-1.6s6 .6 8.2 1.6c-2.2 1.6-5.2 2.2-8.2 2.2S6 17.6 3.8 16Z" />
      <path d="M7.6 15.2c0-4.2 1.6-7.2 4.4-7.2s4.4 3 4.4 7.2" />
    </>
  ),
  handbag: garment(
    <>
      <path d="M6 8.5h12l-1 11H7l-1-11Z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
  heels: garment(
    <>
      <path d="M4.6 6.5v8c0 1.1.9 2 2 2H17v-2.4c-3 0-5-1-6.6-3.6C9.1 8.4 7.1 6.7 4.6 6.5Z" />
      <path d="M14.6 16.5l1 3.8" />
    </>
  ),
  socks: garment(
    <>
      <path d="M9.2 3.6h5v7.4l3.8 3.4-2.4 2.8-3.5-3a3.2 3.2 0 0 1-3.4-3.2V3.6Z" />
      <path d="M9.2 5.6h5" />
    </>
  ),
};

/** Every selectable icon, keyed by slug (clothing only). */
export const CATEGORY_ICON_REGISTRY: Record<string, CategoryIconComponent> = {
  ...GARMENT_ICONS,
  ...CLOTHING_ICONS,
};

/** Order shown in the icon picker. */
export const CATEGORY_ICON_KEYS: string[] = [
  ...Object.keys(GARMENT_ICONS),
  ...Object.keys(CLOTHING_ICONS),
];

export const DEFAULT_CATEGORY_ICON = 'tshirt';

/** Resolve an icon component from a stored slug, falling back to a neutral garment icon. */
export function getCategoryIcon(key?: string | null): CategoryIconComponent {
  if (key && CATEGORY_ICON_REGISTRY[key]) return CATEGORY_ICON_REGISTRY[key];
  return CATEGORY_ICON_REGISTRY[DEFAULT_CATEGORY_ICON];
}
