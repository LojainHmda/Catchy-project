import { createElement as h, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Renders the real MCP consent page. useAuth() is mocked with the SAME plain profile
// record the app really provides ({ uid, email, displayName } — no getIdToken), so the
// page must take the ID token from Firebase Auth. Regression: it once called
// useAuth().user.getIdToken(), which crashed before any request was sent.
const fx = vi.hoisted(() => ({
  getIdToken: vi.fn(async () => 'firebase-id-token'),
  currentUser: null as null | { uid: string; getIdToken: () => Promise<string> },
  user: null as null | { uid: string; email: string; displayName: string | null },
  navigate: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../firebase', () => ({ auth: { get currentUser() { return fx.currentUser; } } }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: fx.user, loading: false, sessionResolving: false, logout: vi.fn() }),
}));
vi.mock('../context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en', isRTL: false, setLanguage: () => {} }),
}));
vi.mock('../lib/externalNavigation', () => ({ navigateToExternal: fx.navigate }));

import McpAuthorize from './McpAuthorize';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const requestToken = (exp = Math.floor(Date.now() / 1000) + 600) =>
  `${Buffer.from(JSON.stringify({ typ: 'areq', n: 'Claude', ru: 'https://claude.ai/api/mcp/auth_callback', exp })).toString('base64url')}.signature`;

let container: HTMLDivElement;
let root: Root;
const render = (req: string) =>
  act(() => root.render(h(MemoryRouter, { initialEntries: [`/mcp-authorize?req=${encodeURIComponent(req)}`] }, h(McpAuthorize))));
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
const click = (label: string) => act(async () => { button(label)!.click(); await new Promise((r) => setTimeout(r, 0)); });
const reply = (status: number, body: unknown) => fx.fetch.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  fx.user = { uid: 'owner-1', email: 'admin@gmail.com', displayName: null };
  fx.currentUser = { uid: 'owner-1', getIdToken: fx.getIdToken };
  fx.navigate.mockReset();
  fx.fetch.mockReset();
  vi.stubGlobal('fetch', fx.fetch);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('MCP consent page', () => {
  it('Allow sends the Firebase ID token and returns to claude.ai with the code', async () => {
    const req = requestToken();
    render(req);
    expect(document.body.textContent).toContain('mcp.request');
    reply(200, { ok: true, redirect: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s' });
    await click('mcp.allow');
    expect(fx.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fx.fetch.mock.calls[0];
    expect(url).toBe('/oauth/approve');
    expect(init.headers.Authorization).toBe('Bearer firebase-id-token');
    expect(JSON.parse(init.body)).toEqual({ request: req, approve: true });
    expect(fx.navigate).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=s');
    expect(document.body.textContent).not.toContain('mcp.failed');
  });

  it('Deny is sent too and returns to claude.ai', async () => {
    render(requestToken());
    reply(200, { ok: true, redirect: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' });
    await click('mcp.deny');
    expect(JSON.parse(fx.fetch.mock.calls[0][1].body).approve).toBe(false);
    expect(fx.navigate).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?error=access_denied');
  });

  it('a non-owner account sees the "owners only" message, and stays on the page', async () => {
    render(requestToken());
    reply(403, { ok: false, code: 'FORBIDDEN' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await click('mcp.allow');
    expect(document.body.textContent).toContain('mcp.notOwner');
    expect(fx.navigate).not.toHaveBeenCalled();
  });

  it('signed out: offers the owner sign-in and sends nothing', () => {
    fx.user = null;
    fx.currentUser = null;
    render(requestToken());
    expect(button('mcp.signIn')).toBeTruthy();
    expect(button('mcp.allow')).toBeUndefined();
    expect(fx.fetch).not.toHaveBeenCalled();
  });

  it('an expired request shows the "start again" message', () => {
    render(requestToken(Math.floor(Date.now() / 1000) - 5));
    expect(document.body.textContent).toContain('mcp.expired');
    expect(button('mcp.allow')).toBeUndefined();
  });
});
