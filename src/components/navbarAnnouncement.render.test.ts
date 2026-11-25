import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The real Navbar's announcement bar (the green "free delivery" bar at the top). The live
// Firestore subscription is replaced by a stand-in the test answers by hand, so "the
// setting has not arrived yet" can be observed — that moment used to show the bar.
const fx = vi.hoisted(() => ({
  deliver: null as null | ((settings: { enabled: boolean; textAr: string; textEn: string }) => void),
  options: null as null | { onError?: (error: unknown) => void; serverConfirmed?: boolean },
  language: 'ar' as 'ar' | 'en',
  openCart: () => {},
  closeCart: () => {},
  logout: async () => {},
}));

vi.mock('../lib/announcementBanner', () => ({
  subscribeAnnouncement: (deliver: NonNullable<typeof fx.deliver>, options: typeof fx.options) => {
    fx.deliver = deliver;
    fx.options = options ?? null;
    return () => {
      fx.deliver = null;
    };
  },
}));
vi.mock('./SearchOverlay', () => ({ default: () => null }));
vi.mock('./TickerBanner', () => ({ default: () => null }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, role: null, logout: fx.logout }) }));
vi.mock('../context/CartContext', () => ({ useCart: () => ({ cartCount: 0, openCart: fx.openCart, closeCart: fx.closeCart }) }));
vi.mock('../context/LanguageContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/LanguageContext')>();
  return {
    ...actual,
    useLanguage: () => ({
      language: fx.language,
      isRTL: fx.language === 'ar',
      setLanguage: () => {},
      t: (key: string) => actual.translations[fx.language][key] ?? key,
    }),
  };
});

import Navbar from './Navbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED = { textAr: 'توصيل مجاني للطلبات فوق 300 شيكل', textEn: 'Free delivery over 300 ILS' };
const DEFAULT_TEXT_AR = 'توصيل مجاني للطلبيات فوق 300 شيكل'; // the built-in default that used to flash

let container: HTMLDivElement;
let root: Root;
const bar = () => document.querySelector('[data-testid="announcement-bar"]');

async function renderNavbar(path = '/') {
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: [path] }, h(Navbar)));
  });
}

beforeEach(() => {
  fx.deliver = null;
  fx.options = null;
  fx.language = 'ar';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('announcement bar (top of the site)', () => {
  it('REGRESSION: shows nothing while the saved setting is still loading (no flash of the default bar)', async () => {
    await renderNavbar();
    expect(fx.deliver).not.toBeNull(); // subscribed, no answer yet
    expect(bar()).toBeNull();
    expect(document.body.textContent).not.toContain(DEFAULT_TEXT_AR);
  });

  it('stays hidden when the owner switched it off', async () => {
    await renderNavbar();
    await act(async () => fx.deliver!({ enabled: false, ...SAVED }));
    expect(bar()).toBeNull();
  });

  it('appears normally, with the saved text, when it is switched on', async () => {
    await renderNavbar();
    await act(async () => fx.deliver!({ enabled: true, ...SAVED }));
    expect(bar()!.textContent).toContain(SAVED.textAr);
    // Switched off live → gone without a reload.
    await act(async () => fx.deliver!({ enabled: false, ...SAVED }));
    expect(bar()).toBeNull();
  });

  it('shows the English text on the English site', async () => {
    fx.language = 'en';
    await renderNavbar();
    await act(async () => fx.deliver!({ enabled: true, ...SAVED }));
    expect(bar()!.textContent).toContain(SAVED.textEn);
  });

  it('stays hidden when the setting cannot be loaded (never assumed to be on)', async () => {
    await renderNavbar();
    await act(async () => fx.options!.onError!(new Error('offline')));
    expect(bar()).toBeNull();
  });

  it('asks for a server-confirmed answer (an empty offline cache is not "never configured")', async () => {
    await renderNavbar();
    expect(fx.options).toMatchObject({ serverConfirmed: true });
  });
});
