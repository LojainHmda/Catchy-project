import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  approveAuthorization,
  authorizationServerMetadata,
  exchangeToken,
  isAllowedRedirectUri,
  protectedResourceMetadata,
  registerClient,
  signToken,
  startAuthorization,
  usableSecret,
  verifyAccessToken,
  verifyToken,
} from './oauth.js';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const BASE = 'https://catchy-ps.com';
const CLAUDE_CB = 'https://claude.ai/api/mcp/auth_callback';
const T0 = Date.parse('2026-11-10T10:00:00Z');
const owners = new Set(['lojain2077@gmail.com']);
const isAdmin = (email) => owners.has(email);
const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const owner = { ok: true, uid: 'u-owner', email: 'lojain2077@gmail.com', projectId: 'kartacagenai' };

function register(extra = {}) {
  return registerClient({ redirect_uris: [CLAUDE_CB], client_name: 'Claude', ...extra }, SECRET, T0).body;
}
function codeFor(clientId, now = T0) {
  const start = startAuthorization(
    { client_id: clientId, redirect_uri: CLAUDE_CB, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 's1', resource: `${BASE}/mcp` },
    SECRET, BASE, now
  );
  const request = decodeURIComponent(start.page.split('req=')[1]);
  const approved = approveAuthorization({ request, approve: true, owner }, SECRET, BASE, now);
  return new URL(approved.body.redirect);
}

describe('signed tokens', () => {
  it('round-trips, rejects tampering, wrong type and expiry', () => {
    const t = signToken({ typ: 'at', a: 1, exp: T0 / 1000 + 60 }, SECRET);
    expect(verifyToken(t, SECRET, 'at', T0)).toMatchObject({ a: 1 });
    expect(verifyToken(t, SECRET, 'rt', T0)).toBeNull();
    expect(verifyToken(t, SECRET, 'at', T0 + 61_000)).toBeNull();
    expect(verifyToken(t, 'another-secret'.padEnd(40, 'y'), 'at', T0)).toBeNull();
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ typ: 'at', a: 2, exp: T0 / 1000 + 60 })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`, SECRET, 'at', T0)).toBeNull();
    expect(verifyToken(`${body}.${sig}x`, SECRET, 'at', T0)).toBeNull();
  });

  it('requires a secret of at least 32 characters', () => {
    expect(usableSecret('short')).toBeNull();
    expect(usableSecret(undefined)).toBeNull();
    expect(usableSecret(SECRET)).toBe(SECRET);
  });
});

describe('discovery and registration', () => {
  it('publishes RFC 9728 / 8414 metadata pointing at this origin', () => {
    expect(protectedResourceMetadata(BASE)).toMatchObject({ resource: `${BASE}/mcp`, authorization_servers: [BASE] });
    expect(authorizationServerMetadata(BASE)).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/oauth/token`,
      registration_endpoint: `${BASE}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('only claude.ai / ChatGPT callbacks and loopback addresses may receive codes', () => {
    for (const ok of [CLAUDE_CB, 'https://claude.com/api/mcp/auth_callback', 'https://chatgpt.com/connector_platform_oauth_redirect', 'http://localhost:6274/oauth/callback', 'http://127.0.0.1:33418/cb']) {
      expect(isAllowedRedirectUri(ok)).toBe(true);
    }
    for (const bad of ['https://evil.example/cb', 'http://claude.ai/api/mcp/auth_callback', 'https://claude.ai.evil.io/cb', 'https://claude.ai/cb#frag', 'javascript:alert(1)']) {
      expect(isAllowedRedirectUri(bad)).toBe(false);
    }
    expect(registerClient({ redirect_uris: ['https://evil.example/cb'] }, SECRET, T0)).toMatchObject({ status: 400, body: { error: 'invalid_redirect_uri' } });
    expect(registerClient({}, SECRET, T0).status).toBe(400);
  });

  it('public clients get no secret; confidential ones get a derived secret', () => {
    expect(register()).toMatchObject({ token_endpoint_auth_method: 'none', redirect_uris: [CLAUDE_CB] });
    expect(register()).not.toHaveProperty('client_secret');
    expect(register({ token_endpoint_auth_method: 'client_secret_post' }).client_secret).toEqual(expect.any(String));
  });
});

describe('authorization code + PKCE', () => {
  it('full flow: consent → code → tokens → /mcp access', () => {
    const client = register();
    const redirect = codeFor(client.client_id);
    expect(redirect.origin + redirect.pathname).toBe(CLAUDE_CB);
    expect(redirect.searchParams.get('state')).toBe('s1');
    expect(redirect.searchParams.get('iss')).toBe(BASE);
    const tokens = exchangeToken(
      { grant_type: 'authorization_code', code: redirect.searchParams.get('code'), redirect_uri: CLAUDE_CB, client_id: client.client_id, code_verifier: verifier },
      {}, SECRET, BASE, isAdmin, T0
    );
    expect(tokens).toMatchObject({ status: 200, body: { token_type: 'Bearer', expires_in: 3600, scope: 'catchy.read' } });
    expect(verifyAccessToken(`Bearer ${tokens.body.access_token}`, SECRET, BASE, isAdmin, T0)).toMatchObject({ ok: true, owner: { email: 'lojain2077@gmail.com' } });
    // A token for another origin is not accepted here.
    expect(verifyAccessToken(`Bearer ${tokens.body.access_token}`, SECRET, 'https://other.example', isAdmin, T0).ok).toBe(false);
  });

  it('refuses a wrong PKCE verifier, a reused code, another client, and an expired code', () => {
    const client = register();
    const other = register({ client_name: 'Another client' }); // identical registrations share one stateless id
    const code = () => codeFor(client.client_id).searchParams.get('code');
    const body = (c, extra = {}) => ({ grant_type: 'authorization_code', code: c, redirect_uri: CLAUDE_CB, client_id: client.client_id, code_verifier: verifier, ...extra });
    expect(exchangeToken(body(code(), { code_verifier: 'x'.repeat(50) }), {}, SECRET, BASE, isAdmin, T0).body.error).toBe('invalid_grant');
    const once = code();
    expect(exchangeToken(body(once), {}, SECRET, BASE, isAdmin, T0).status).toBe(200);
    expect(exchangeToken(body(once), {}, SECRET, BASE, isAdmin, T0).body.error).toBe('invalid_grant');
    expect(exchangeToken(body(code(), { client_id: other.client_id }), {}, SECRET, BASE, isAdmin, T0).body.error).toBe('invalid_grant');
    expect(exchangeToken(body(code()), {}, SECRET, BASE, isAdmin, T0 + 3 * 60_000).body.error).toBe('invalid_grant');
  });

  it('a request without PKCE S256 goes back to the client as an error; unknown clients are never redirected to', () => {
    const client = register();
    const noPkce = startAuthorization({ client_id: client.client_id, redirect_uri: CLAUDE_CB, response_type: 'code', state: 'z' }, SECRET, BASE, T0);
    expect(new URL(noPkce.redirect).searchParams.get('error')).toBe('invalid_request');
    expect(startAuthorization({ client_id: 'forged', redirect_uri: 'https://evil.example/cb', response_type: 'code' }, SECRET, BASE, T0)).toMatchObject({ status: 400 });
    expect(startAuthorization({ client_id: client.client_id, redirect_uri: 'https://chatgpt.com/other', response_type: 'code' }, SECRET, BASE, T0)).toMatchObject({ status: 400 });
  });

  it('consent: only an owner gets a code; "Deny" returns access_denied', () => {
    const client = register();
    const start = startAuthorization({ client_id: client.client_id, redirect_uri: CLAUDE_CB, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'q' }, SECRET, BASE, T0);
    const request = decodeURIComponent(start.page.split('req=')[1]);
    expect(approveAuthorization({ request, approve: true, owner: { ok: false, status: 403 } }, SECRET, BASE, T0)).toMatchObject({ status: 403 });
    expect(approveAuthorization({ request, approve: true, owner: { ok: false, status: 401 } }, SECRET, BASE, T0)).toMatchObject({ status: 401 });
    const denied = approveAuthorization({ request, approve: false }, SECRET, BASE, T0);
    expect(new URL(denied.body.redirect).searchParams.get('error')).toBe('access_denied');
    expect(approveAuthorization({ request, approve: true, owner }, SECRET, BASE, T0 + 11 * 60_000)).toMatchObject({ status: 400, body: { code: 'EXPIRED' } });
  });

  it('confidential clients must authenticate at the token endpoint (post or basic)', () => {
    const client = register({ token_endpoint_auth_method: 'client_secret_basic' });
    const code = codeFor(client.client_id).searchParams.get('code');
    const body = { grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CB, code_verifier: verifier };
    expect(exchangeToken({ ...body, client_id: client.client_id }, {}, SECRET, BASE, isAdmin, T0).body.error).toBe('invalid_client');
    const basic = `Basic ${Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString('base64')}`;
    expect(exchangeToken(body, { authorization: basic }, SECRET, BASE, isAdmin, T0).status).toBe(200);
  });
});

describe('refresh and revocation', () => {
  it('refresh issues new tokens; removing someone as owner revokes refresh and /mcp access', () => {
    const client = register();
    const code = codeFor(client.client_id).searchParams.get('code');
    const first = exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CB, client_id: client.client_id, code_verifier: verifier }, {}, SECRET, BASE, isAdmin, T0).body;
    const later = T0 + 2 * 60 * 60_000; // access token expired by now
    expect(verifyAccessToken(`Bearer ${first.access_token}`, SECRET, BASE, isAdmin, later).ok).toBe(false);
    const refreshed = exchangeToken({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: client.client_id }, {}, SECRET, BASE, isAdmin, later);
    expect(refreshed.status).toBe(200);
    expect(verifyAccessToken(`Bearer ${refreshed.body.access_token}`, SECRET, BASE, isAdmin, later).ok).toBe(true);

    const noLongerOwner = () => false;
    expect(verifyAccessToken(`Bearer ${refreshed.body.access_token}`, SECRET, BASE, noLongerOwner, later).ok).toBe(false);
    expect(exchangeToken({ grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token, client_id: client.client_id }, {}, SECRET, BASE, noLongerOwner, later).body.error).toBe('invalid_grant');
    // Rotating the secret revokes everything.
    expect(verifyAccessToken(`Bearer ${refreshed.body.access_token}`, 'rotated-secret'.padEnd(40, 'z'), BASE, isAdmin, later).ok).toBe(false);
  });

  it('an access token cannot be used as a refresh token (and vice versa)', () => {
    const client = register();
    const code = codeFor(client.client_id).searchParams.get('code');
    const t = exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE_CB, client_id: client.client_id, code_verifier: verifier }, {}, SECRET, BASE, isAdmin, T0).body;
    expect(exchangeToken({ grant_type: 'refresh_token', refresh_token: t.access_token, client_id: client.client_id }, {}, SECRET, BASE, isAdmin, T0).body.error).toBe('invalid_grant');
    expect(verifyAccessToken(`Bearer ${t.refresh_token}`, SECRET, BASE, isAdmin, T0).ok).toBe(false);
  });
});
