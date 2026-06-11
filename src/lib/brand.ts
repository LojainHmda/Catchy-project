/**
 * Catchy client brand palette — single source of truth.
 * CSS/Tailwind tokens in `src/index.css` (@theme) mirror these values.
 * Prefer semantic classes (`bg-primary`, `text-catchy`, `hover:bg-catchy-dark`) in components.
 */
export const BRAND = {
  primary: '#42aa77',
  primaryDark: '#358f62',
  primaryDarker: '#2a6b4f',
  onPrimary: '#ffffff',
  primaryContainer: '#5bba8c',
  onPrimaryContainer: '#e8f7ef',
  surface: '#f2faf6',
  surfaceContainer: '#e0f0e8',
  onSurface: '#1a3d2f',
  outline: '#6aab88',
} as const;

export type BrandColor = (typeof BRAND)[keyof typeof BRAND];
