import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: { user: null as null | { uid: string }, role: null as null | string },
  language: 'en' as 'en' | 'ar',
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => state.auth }));
// Real translation tables; only the active language is switched by the test.
vi.mock('../context/LanguageContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/LanguageContext')>();
  return {
    ...actual,
    useLanguage: () => ({
      language: state.language,
      isRTL: state.language === 'ar',
      t: (k: string) => actual.translations[state.language][k] ?? k,
    }),
  };
});

import WhatsAppButton, { STORE_WHATSAPP_URL, showsWhatsAppButton } from './WhatsAppButton';
import { translations } from '../context/LanguageContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  state.auth = { user: null, role: null };
  state.language = 'en';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderAt = (path: string) =>
  act(() => root.render(h(MemoryRouter, { key: `${path}|${state.language}|${state.auth.role}`, initialEntries: [path] }, h(WhatsAppButton))));
const link = () => container.querySelector<HTMLAnchorElement>('a[data-testid="whatsapp-float"]');
const classes = () => link()!.className.split(/\s+/);

describe('floating WhatsApp button', () => {
  it('opens the store chat with the exact link, in a new tab, without giving the chat page access to the store tab', () => {
    renderAt('/');
    const a = link()!;
    expect(STORE_WHATSAPP_URL).toBe('https://wa.me/message/5PDMN46QGMGQC1');
    expect(a.getAttribute('href')).toBe('https://wa.me/message/5PDMN46QGMGQC1');
    expect(a.target).toBe('_blank');
    expect(a.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(a.querySelector('svg path')).not.toBeNull();
  });

  it('names the chat and the store number for screen readers and in the hover label', () => {
    renderAt('/');
    expect(link()!.getAttribute('aria-label')).toBe('Chat with us on WhatsApp +970 593 227 556');
    expect(link()!.textContent).toContain('Chat with us on WhatsApp');
    expect(link()!.textContent).toContain('+970 593 227 556');
  });

  it('is fixed to the bottom-left: above the phone bottom bar, in the corner on larger screens, under drawers and dialogs', () => {
    renderAt('/catalog');
    expect(classes()).toEqual(expect.arrayContaining(['fixed', 'left-4', 'sm:left-6', 'bottom-20', 'sm:bottom-6', 'z-40']));
  });

  it.each(['/', '/catalog', '/product/p1', '/coordinate/c1', '/cart', '/login', '/orders', '/orders/o1', '/orders/confirmation/o1'])(
    'shows on the storefront page %s',
    (path) => {
      expect(showsWhatsAppButton(path)).toBe(true);
      renderAt(path);
      expect(link()).not.toBeNull();
    }
  );

  it.each(['/admin', '/admin/products', '/admin/orders', '/pos', '/pos/close', '/mcp-authorize'])('never shows on %s', (path) => {
    expect(showsWhatsAppButton(path)).toBe(false);
    renderAt(path);
    expect(container.innerHTML).toBe('');
  });

  it('stacks above the owner live-visitor badge for admin sign-ins in English (the badge sits bottom-left there)', () => {
    state.auth = { user: { uid: 'owner' }, role: 'admin' };
    renderAt('/');
    expect(classes()).toEqual(expect.arrayContaining(['bottom-32', 'sm:bottom-16']));
    expect(classes()).not.toContain('bottom-20');
  });

  it('keeps the corner position in Arabic (the badge moves to the right) and for signed-in customers', () => {
    state.auth = { user: { uid: 'owner' }, role: 'admin' };
    state.language = 'ar';
    renderAt('/');
    expect(classes()).toEqual(expect.arrayContaining(['left-4', 'bottom-20', 'sm:bottom-6']));
    expect(link()!.getAttribute('aria-label')).toBe('تواصل معنا عبر واتساب +970 593 227 556');

    state.auth = { user: { uid: 'customer' }, role: 'customer' };
    state.language = 'en';
    renderAt('/cart');
    expect(classes()).toEqual(expect.arrayContaining(['bottom-20', 'sm:bottom-6']));
  });

  it('has its label in both languages', () => {
    expect(translations.en['whatsapp.float.label']).toBe('Chat with us on WhatsApp');
    expect(translations.ar['whatsapp.float.label']).toBe('تواصل معنا عبر واتساب');
  });
});
