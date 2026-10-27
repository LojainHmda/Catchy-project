import React from 'react';

/**
 * Line icons used on the admin Orders page, adapted from the Sisley store's
 * AdminIcons.tsx (24×24 viewBox, 1.8 stroke, round caps/joins) so the page's
 * row actions read the same way. Only the icons this page uses are included.
 */
const PATHS = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  phone: 'M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z',
  users:
    'M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm9 0a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 21c0-4 3-6.5 6-6.5s6 2.5 6 6.5M13 14.7c2.6.3 5 2.6 5 6.3',
  return: 'M9 14l-5-5 5-5M20 20v-7a4 4 0 00-4-4H4',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M8 8h11a1 1 0 011 1v11a1 1 0 01-1 1H8a1 1 0 01-1-1V9a1 1 0 011-1zM5 16H4a1 1 0 01-1-1V4a1 1 0 011-1h11a1 1 0 011 1v1',
  refresh: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M4 4v5h5M20 20v-5h-5',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  bag: 'M6 8h12l1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L6 8zM9 8V6a3 3 0 016 0v2',
  globe: 'M12 2a15 15 0 010 20M12 2a15 15 0 000 20M2 12h20M3 7h18M3 17h18M12 2a10 10 0 100 20 10 10 0 000-20z',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  box: 'M3 8l9-5 9 5-9 5-9-5zm0 0v9l9 5 9-5V8M12 13v9',
} as const;

export type AdminStrokeIconName = keyof typeof PATHS;

const AdminStrokeIcon: React.FC<{ name: AdminStrokeIconName; className?: string }> = ({ name, className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name]} />
  </svg>
);

export default AdminStrokeIcon;
