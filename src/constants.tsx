import React from 'react';
import { Layout } from 'lucide-react';

export const CATEGORY_KEYS: Record<string, string> = {
  'New Arrivals': 'cat.newArrivals',
  'Pants': 'cat.pants',
  'Tops': 'cat.tops',
  'Dresses': 'cat.dresses',
  'Skirts': 'cat.skirts',
  'Jackets': 'cat.jackets',
  'Formal Sets': 'cat.formal',
  'Coordinates': 'cat.coordinates',
  'All': 'cat.all'
};

export const CATEGORY_ICONS: Record<string, any> = {
  'New Arrivals': (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" {...props}>
      <path d="M12 3l1.912 5.885h6.188l-5.007 3.638 1.912 5.885-5.005-3.638-5.005 3.638 1.912-5.885-5.007-3.638h6.188L12 3z" strokeLinejoin="round"/>
    </svg>
  ),
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
