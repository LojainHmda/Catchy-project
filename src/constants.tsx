import React from 'react';
import { Layout } from 'lucide-react';

export const CATEGORY_KEYS: Record<string, string> = {
  'Pants': 'cat.pants',
  'Tops': 'cat.tops',
  'Shirts': 'cat.shirts',
  'Dresses': 'cat.dresses',
  'Skirts': 'cat.skirts',
  'Long Skirt Sets': 'cat.longSkirtSets',
  'Jackets': 'cat.jackets',
  'Formal Sets': 'cat.formal',
  'Practical Sets': 'cat.practicalSets',
  'Coordinates': 'cat.coordinates',
  'All': 'cat.all'
};

/** Real product categories (tags like "new-arrived" are separate). */
export const PRODUCT_CATEGORIES = [
  'Dresses',
  'Tops',
  'Shirts',
  'Pants',
  'Skirts',
  'Long Skirt Sets',
  'Jackets',
  'Formal Sets',
  'Practical Sets',
  'Coordinates',
] as const;

/** All categories shown in catalog sidebar (excludes "All"); counts come from products. */
export const CATALOG_FILTER_CATEGORIES = [
  'Dresses',
  'Tops',
  'Shirts',
  'Pants',
  'Skirts',
  'Long Skirt Sets',
  'Jackets',
  'Formal Sets',
  'Practical Sets',
  'Coordinates',
] as const;

export const CATEGORY_ICONS: Record<string, any> = {
  'Pants': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M7.5 3.5h9l1.5 17.5h-4.5l-0.5-8-0.5 8H6l1.5-17.5z" strokeLinejoin="round"/>
      <path d="M9.5 3.5v3m5-3v3M8.5 6.5h7" strokeLinecap="round"/>
      <circle cx="12" cy="5" r="0.5" fill="currentColor"/>
    </svg>
  ),
  'Tops': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M7 4.5l-2.5 3v2.5l2.5 2v8h10v-8l2.5-2v-2.5l-2.5-3H7z" strokeLinejoin="round"/>
      <path d="M10 4.5c0 1.2 1 2 2 2s2-0.8 2-2" strokeLinecap="round"/>
      <path d="M12 7.5v11.5M12 10.5h-1m1 3h-1m1 3h-1" strokeLinecap="round"/>
      <path d="M5.5 8.5h2m9 0h2" strokeLinecap="round"/>
    </svg>
  ),
  'Shirts': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M8.5 3.5l-4 2.5 1.4 3 1.6-1v12h13v-12l1.6 1 1.4-3-4-2.5-3 1.5-3-1.5z" strokeLinejoin="round"/>
      <path d="M9 5l3 2.5 3-2.5M12 8v11" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 11v0M12 14v0M12 17v0" strokeLinecap="round"/>
    </svg>
  ),
  'Dresses': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M9.5 3.5L8 7.5l-3.5 3v10h15v-10l-3.5-3-1.5-4H9.5z" strokeLinejoin="round"/>
      <path d="M12 3.5v4M9.5 7.5h5" strokeLinecap="round"/>
      <path d="M12 11c-1.2 0-2.5 0.8-2.5 2.5s1.3 2.5 2.5 2.5 2.5-0.8 2.5-2.5-1.3-2.5-2.5-2.5z" strokeLinecap="round"/>
    </svg>
  ),
  'Skirts': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M8.5 4.5h7l3 16h-13l3-16z" strokeLinejoin="round"/>
      <path d="M10 4.5v16M11.3 4.5v16M12.7 4.5v16M14 4.5v16M8.5 8.5h7" strokeLinecap="round"/>
    </svg>
  ),
  'Long Skirt Sets': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M9.5 2.5h5v3h-5z" strokeLinejoin="round"/>
      <path d="M9 5.5h6l3.5 16h-13l3.5-16z" strokeLinejoin="round"/>
      <path d="M10.2 5.5l-0.7 16M13.8 5.5l0.7 16M12 5.5v16M9 9.5h6" strokeLinecap="round"/>
    </svg>
  ),
  'Jackets': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M12 4.5l-5.5 2v14h11v-14l-5.5-2z" strokeLinejoin="round"/>
      <path d="M12 4.5v15.5M12 8.5l-3.5 2M12 8.5l3.5 2M9.5 14.5h1.5m2 0h1.5" strokeLinecap="round"/>
      <path d="M7 6.5l2.5 2.5m5-2.5L12 9" strokeLinecap="round"/>
    </svg>
  ),
  'Formal Sets': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M13.5 4h-3l-3.5 3.5v12.5h10V7.5L13.5 4z" strokeLinejoin="round"/>
      <path d="M10.5 4l1.5 3 1.5-3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.5 12h3.5v8h-3.5v-8z" strokeLinejoin="round"/>
      <path d="M17.25 12v-2.5" strokeLinecap="round"/>
    </svg>
  ),
  'Practical Sets': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M7 3.5l-2.5 2 1.2 2.2 1.3-0.8V12h6V6.9l1.3 0.8L15.5 5.5l-2.5-2-2 1.2-2-1.2z" strokeLinejoin="round"/>
      <path d="M9 4.2c0 0.9 0.8 1.5 1.5 1.5s1.5-0.6 1.5-1.5" strokeLinecap="round"/>
      <path d="M14 13.5h6l-0.8 7h-4.4L14 13.5z" strokeLinejoin="round"/>
      <path d="M15 13.5l0.4 7M19 13.5l-0.4 7M17 13.5v7" strokeLinecap="round"/>
    </svg>
  ),
  'Coordinates': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <rect x="5.5" y="5.5" width="5.5" height="5.5" rx="1.2"/>
      <rect x="13" y="5.5" width="5.5" height="5.5" rx="1.2"/>
      <rect x="5.5" y="13" width="5.5" height="5.5" rx="1.2"/>
      <rect x="13" y="13" width="5.5" height="5.5" rx="1.2"/>
    </svg>
  ),
  'All': Layout
};

/** Demo admin used by Login “fill” button and AuthContext (create in Firebase if missing). */
export const ADMIN_DEMO_EMAIL = 'admin@gmail.com';
export const ADMIN_DEMO_PASSWORD = 'admin123';
