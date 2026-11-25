// OAuth 2.1 authorization server for the read-only Catchy MCP endpoint (/mcp), so that
// claude.ai and ChatGPT "custom connectors" can connect: they discover it through the
// metadata documents below, register themselves (dynamic client registration), send
// the store owner to a Catchy sign-in + consent page, and exchange the code (PKCE S256).
//
// Stateless by design — nothing is written to Firestore. Every artefact (client id,
// pending request, code, access/refresh token) is a small payload signed with
// HMAC-SHA256 using CATCHY_MCP_SECRET:
//   - revoke everything: rotate CATCHY_MCP_SECRET;
//   - revoke one person: remove them as an owner — every MCP request re-checks that the
//     signed-in email is still a store owner (verifyAccessToken → isAdminEmail).
// Codes live 2 minutes, are bound to the client, redirect URI and PKCE challenge, and are
// refused if seen twice on the same server instance (best effort across instances —
// a replayed code is still useless without the PKCE verifier).

import crypto from 'node:crypto';

export const MCP_SCOPE = 'catchy.read';
const TTL_S = { request: 10 * 60, code: 2 * 60, access: 60 * 60, refresh: 30 * 24 * 60 * 60 };
const MIN_SECRET_LENGTH = 32;

// Where an authorization code may be sent: the claude.ai / ChatGPT connector callbacks,
// and loopback addresses (desktop clients, MCP Inspector). Anything else is refused at
// registration, so a stranger cannot register a client that redirects codes elsewhere.
const REDIRECT_HOSTS = new Set(['claude.ai', 'claude.com', 'chatgpt.com', 'chat.openai.com', 'platform.openai.com']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const nowS = (now) => Math.floor((now ?? Date.now()) / 1000);
const b64u = (value) => Buffer.from(value).toString('base64url');
const sha256b64u = (value) => crypto.createHash('sha256').update(value).digest('base64url');

export function usableSecret(secret) {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export function signToken(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** The payload when `token` is ours, of type `typ` and not expired; else null. */
export function verifyToken(token, secret, typ, now) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('base64url'));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.typ !== typ) return null;
  if (typeof payload.exp === 'number' && nowS(now) >= payload.exp) return null;
  return payload;
}

export function isAllowedRedirectUri(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'https:' && REDIRECT_HOSTS.has(host)) return true;
  return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK_HOSTS.has(host);
}

// ── Discovery metadata ───────────────────────────────────────────────────────

export const resourceUrl = (base) => `${base}/mcp`;

/** RFC 9728 — tells the client which authorization server protects /mcp. */
export function protectedResourceMetadata(base) {
  return {
    resource: resourceUrl(base),
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Catchy store (read-only)',
  };
}

/** RFC 8414 — the authorization server's endpoints and capabilities. */
export function authorizationServerMetadata(base) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [MCP_SCOPE],
  };
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────

const clientSecretFor = (clientId, secret) => crypto.createHmac('sha256', secret).update(`client-secret:${clientId}`).digest('base64url');

export function registerClient(body, secret, now) {
  const redirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirectUris.length || redirectUris.length > 5) {
    return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'Provide 1–5 redirect_uris.' } };
  }
  const refused = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (refused) {
    return { status: 400, body: { error: 'invalid_redirect_uri', error_description: `Redirect URI not allowed: ${refused}` } };
  }
  const name = String(body?.client_name ?? 'MCP client').trim().slice(0, 100) || 'MCP client';
  const requested = String(body?.token_endpoint_auth_method ?? 'none');
  const method = ['client_secret_post', 'client_secret_basic'].includes(requested) ? requested : 'none';
  const issuedAt = nowS(now);
  const clientId = signToken({ typ: 'client', ru: redirectUris, n: name, am: method, iat: issuedAt }, secret);
  return {
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
      scope: MCP_SCOPE,
      ...(method === 'none' ? {} : { client_secret: clientSecretFor(clientId, secret), client_secret_expires_at: 0 }),
    },
  };
}

// ── Authorization (GET /oauth/authorize → consent page → POST /oauth/approve) ─

const withParams = (uri, params) => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
};

/**
 * Validates an authorization request. Returns { page } to send the browser to the
 * consent page, { redirect } to send an OAuth error back to the client, or
 * { status, error } when the client/redirect itself is untrustworthy (never redirected).
 */
export function startAuthorization(query, secret, base, now) {
  const client = verifyToken(String(query?.client_id ?? ''), secret, 'client', now);
  if (!client) return { status: 400, error: 'Unknown client. Remove the connector and add it again.' };
  const redirectUri = query?.redirect_uri ? String(query.redirect_uri) : client.ru.length === 1 ? client.ru[0] : '';
  if (!redirectUri || !client.ru.includes(redirectUri)) return { status: 400, error: 'This redirect address was not registered for the client.' };

  const state = query?.state ? String(query.state).slice(0, 512) : undefined;
  const fail = (error, description) => ({ redirect: withParams(redirectUri, { error, error_description: description, state, iss: base }) });
  if (query?.response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
  if (!query?.code_challenge || query?.code_challenge_method !== 'S256') return fail('invalid_request', 'PKCE with S256 is required.');
  const resource = query?.resource ? String(query.resource) : resourceUrl(base);
  if (resource !== resourceUrl(base) && resource !== base) return fail('invalid_target', 'Unknown resource.');

  const request = signToken(
    {
      typ: 'areq',
      cid: String(query.client_id),
      n: client.n,
      ru: redirectUri,
      st: state,
      cc: String(query.code_challenge).slice(0, 128),
      res: resourceUrl(base),
      exp: nowS(now) + TTL_S.request,
    },
    secret
  );
  return { page: `/mcp-authorize?req=${encodeURIComponent(request)}` };
}

/**
 * The store owner answered the consent page. `owner` is the verifyAdminRequest() result
 * for the signed-in user (owners only). Returns { status, body: { redirect } }.
 */
export function approveAuthorization({ request, approve, owner }, secret, base, now) {
  const req = verifyToken(String(request ?? ''), secret, 'areq', now);
  if (!req) return { status: 400, body: { ok: false, code: 'EXPIRED', message: 'This sign-in request expired. Start again from claude.ai / ChatGPT.' } };
  if (!approve) {
    return { status: 200, body: { ok: true, redirect: withParams(req.ru, { error: 'access_denied', state: req.st, iss: base }) } };
  }
  if (!owner?.ok) {
    return { status: owner?.status === 401 ? 401 : 403, body: { ok: false, code: 'FORBIDDEN', message: 'Only a store owner account can connect.' } };
  }
  const code = signToken(
    {
      typ: 'code',
      cid: req.cid,
      ru: req.ru,
      cc: req.cc,
      res: req.res,
      sub: owner.uid,
      em: owner.email,
      fp: owner.projectId ?? null,
      jti: crypto.randomUUID(),
      exp: nowS(now) + TTL_S.code,
    },
    secret
  );
  return { status: 200, body: { ok: true, redirect: withParams(req.ru, { code, state: req.st, iss: base }) } };
}

// ── Token endpoint ───────────────────────────────────────────────────────────

const usedCodes = new Map(); // jti → expiry (s); best-effort single use per instance

function rememberCode(jti, exp, now) {
  for (const [k, e] of usedCodes) if (e <= nowS(now)) usedCodes.delete(k);
  if (usedCodes.has(jti)) return false;
  usedCodes.set(jti, exp);
  return true;
}

function clientCredentials(body, headers) {
  const auth = String(headers?.authorization ?? '');
  if (/^basic\s+/i.test(auth)) {
    try {
      const [id, sec] = Buffer.from(auth.replace(/^basic\s+/i, ''), 'base64').toString('utf8').split(':');
      return { clientId: decodeURIComponent(id ?? ''), clientSecret: decodeURIComponent(sec ?? '') };
    } catch {
      /* fall through */
    }
  }
  return { clientId: String(body?.client_id ?? ''), clientSecret: body?.client_secret ? String(body.client_secret) : '' };
}

const tokenError = (status, error, description) => ({ status, body: { error, error_description: description } });

function issueTokens({ sub, em, fp, cid, res }, secret, now) {
  const t = nowS(now);
  const claims = { sub, em, fp, cid, aud: res, scope: MCP_SCOPE };
  return {
    status: 200,
    body: {
      access_token: signToken({ typ: 'at', ...claims, exp: t + TTL_S.access }, secret),
      token_type: 'Bearer',
      expires_in: TTL_S.access,
      refresh_token: signToken({ typ: 'rt', ...claims, jti: crypto.randomUUID(), exp: t + TTL_S.refresh }, secret),
      scope: MCP_SCOPE,
    },
  };
}

/**
 * POST /oauth/token (authorization_code with PKCE, or refresh_token).
 * `isAdminEmail(email, projectId)` re-checks the person is still a store owner on refresh.
 */
export function exchangeToken(body, headers, secret, base, isAdminEmail, now) {
  const { clientId, clientSecret } = clientCredentials(body, headers);
  const client = verifyToken(clientId, secret, 'client', now);
  if (!client) return tokenError(401, 'invalid_client', 'Unknown client.');
  if (client.am !== 'none' && clientSecret !== clientSecretFor(clientId, secret)) {
    return tokenError(401, 'invalid_client', 'Client authentication failed.');
  }

  if (body?.grant_type === 'authorization_code') {
    const code = verifyToken(String(body?.code ?? ''), secret, 'code', now);
    if (!code || code.cid !== clientId) return tokenError(400, 'invalid_grant', 'The code is invalid or expired.');
    if (String(body?.redirect_uri ?? code.ru) !== code.ru) return tokenError(400, 'invalid_grant', 'redirect_uri does not match.');
    const verifier = String(body?.code_verifier ?? '');
    if (verifier.length < 43 || verifier.length > 128 || sha256b64u(verifier) !== code.cc) {
      return tokenError(400, 'invalid_grant', 'PKCE verification failed.');
    }
    if (body?.resource && String(body.resource) !== code.res && String(body.resource) !== base) {
      return tokenError(400, 'invalid_target', 'Unknown resource.');
    }
    if (!rememberCode(code.jti, code.exp, now)) return tokenError(400, 'invalid_grant', 'The code was already used.');
    if (!isAdminEmail(code.em, code.fp)) return tokenError(400, 'invalid_grant', 'This account is no longer a store owner.');
    return issueTokens(code, secret, now);
  }

  if (body?.grant_type === 'refresh_token') {
    const rt = verifyToken(String(body?.refresh_token ?? ''), secret, 'rt', now);
    if (!rt || rt.cid !== clientId) return tokenError(400, 'invalid_grant', 'The refresh token is invalid or expired.');
    if (!isAdminEmail(rt.em, rt.fp)) return tokenError(400, 'invalid_grant', 'This account is no longer a store owner.');
    return issueTokens({ ...rt, res: rt.aud }, secret, now);
  }

  return tokenError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.');
}

// ── Protecting /mcp ──────────────────────────────────────────────────────────

/** { ok: true, owner } for a valid, unexpired access token of a current store owner. */
export function verifyAccessToken(authorizationHeader, secret, base, isAdminEmail, now) {
  const m = /^Bearer\s+(.+)$/i.exec(String(authorizationHeader ?? ''));
  if (!m) return { ok: false, error: 'invalid_token', message: 'Missing bearer token.' };
  const at = verifyToken(m[1].trim(), secret, 'at', now);
  if (!at || at.aud !== resourceUrl(base)) return { ok: false, error: 'invalid_token', message: 'Invalid or expired token.' };
  if (!isAdminEmail(at.em, at.fp)) return { ok: false, error: 'invalid_token', message: 'This account is no longer a store owner.' };
  return { ok: true, owner: { uid: at.sub, email: at.em, clientId: at.cid } };
}

export const _test = { TTL_S, clientSecretFor, usedCodes };
