import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The home-page "Offers & Discounts" ticker against a stand-in Firestore listener.
const fx = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  error: null as null | ((error: unknown) => void),
}));

vi.mock('../firebase', () => ({
  db: {},
  doc: () => ({ path: 'site_settings/site' }),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void, error: (e: unknown) => void) => {
    fx.next = next;
    fx.error = error;
    return () => {};
  },
}));

import TickerBanner from './TickerBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const ticker = () => container.querySelector('[data-testid="ticker-banner"]');
const send = (snap: unknown) => act(async () => fx.next!(snap));

beforeEach(async () => {
  fx.next = null;
  fx.error = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(h(TickerBanner)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('home-page ticker banner', () => {
  it('shows nothing before its setting has loaded', () => {
    expect(ticker()).toBeNull();
  });

  it('stays hidden when switched off', async () => {
    await send({ exists: () => true, data: () => ({ tickerBannerEnabled: false }), metadata: { fromCache: false } });
    expect(ticker()).toBeNull();
  });

  it('appears normally, with the saved text, when switched on', async () => {
    await send({ exists: () => true, data: () => ({ tickerBannerEnabled: true, tickerBannerText: ' SALE ' }), metadata: { fromCache: false } });
    expect(ticker()!.textContent).toContain('SALE');
  });

  it('stays hidden when its setting cannot be loaded', async () => {
    await act(async () => fx.error!(new Error('offline')));
    expect(ticker()).toBeNull();
  });

  it('waits for the server instead of treating an empty offline cache as "never configured"', async () => {
    await send({ exists: () => false, data: () => undefined, metadata: { fromCache: true } });
    expect(ticker()).toBeNull();
    // The server confirms there is no setting at all: the long-standing default (on) applies.
    await send({ exists: () => false, data: () => undefined, metadata: { fromCache: false } });
    expect(ticker()).not.toBeNull();
  });
});
