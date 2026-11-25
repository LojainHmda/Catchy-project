// HTTP routes for the read-only Catchy MCP server and its OAuth sign-in, mounted on the
// main Express app (server/index.js). Fails closed: without CATCHY_MCP_SECRET (>= 32
// chars) every route answers 503 and nothing is exposed.
//
//   GET  /.well-known/oauth-protected-resource[/mcp]  RFC 9728 metadata
//   GET  /.well-known/oauth-authorization-server      RFC 8414 metadata
//   POST /oauth/register                              dynamic client registration
//   GET  /oauth/authorize                             → consent page /mcp-authorize (SPA)
//   POST /oauth/approve                               consent page answer (owner's Firebase ID token)
//   POST /oauth/token                                 code (PKCE) / refresh → tokens
//   POST /mcp                                         MCP Streamable HTTP (stateless, JSON responses)

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRateLimiter } from '../analytics.js';
import {
  approveAuthorization,
  authorizationServerMetadata,
  exchangeToken,
  protectedResourceMetadata,
  registerClient,
  startAuthorization,
  usableSecret,
  verifyAccessToken,
} from './oauth.js';
import { createCatchyData } from './catchyData.js';
import { createCatchyMcpServer } from './mcpServer.js';

const clientIp = (req) => String(req.get('x-forwarded-for') || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

/** Public origin of this request (or the configured one), e.g. https://catchy-ps.com. */
export function baseUrlOf(req, configured) {
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param {import('express').Express} app
 * @param {{
 *   getSecret: () => string | undefined,
 *   getDb: () => Promise<any>,
 *   verifyOwner: (req: any) => Promise<{ ok: boolean, status?: number, uid?: string, email?: string, projectId?: string }>,
 *   isAdminEmail: (email: string, projectId?: string | null) => boolean,
 *   analytics?: { getStore: Function, handleSummary: Function, handleLive: Function },
 *   baseUrl?: string,
 *   now?: () => number,
 * }} deps
 */
export function mountCatchyMcp(app, deps) {
  const oauthLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
  const mcpLimiter = createRateLimiter({ limit: 240, windowMs: 60_000 });
  const now = () => (deps.now ? deps.now() : Date.now());
  const base = (req) => baseUrlOf(req, deps.baseUrl);

  // Every route: refuse when not configured (fail closed) or rate-limited.
  const guard = (limiter) => (req, res, next) => {
    const secret = usableSecret(deps.getSecret());
    if (!secret) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'The Catchy MCP server is not configured.' });
    if (!limiter(clientIp(req))) return res.status(429).json({ error: 'slow_down', error_description: 'Too many requests.' });
    req.mcpSecret = secret;
    next();
  };
  const oauth = guard(oauthLimiter);

  const resourceMeta = (req, res) => res.json(protectedResourceMetadata(base(req)));
  app.get('/.well-known/oauth-protected-resource', oauth, resourceMeta);
  app.get('/.well-known/oauth-protected-resource/mcp', oauth, resourceMeta);
  app.get('/.well-known/oauth-authorization-server', oauth, (req, res) => res.json(authorizationServerMetadata(base(req))));

  app.post('/oauth/register', oauth, (req, res) => {
    const result = registerClient(req.body, req.mcpSecret, now());
    res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
  });

  app.get('/oauth/authorize', oauth, (req, res) => {
    const result = startAuthorization(req.query, req.mcpSecret, base(req), now());
    if (result.page) return res.redirect(302, result.page);
    if (result.redirect) return res.redirect(302, result.redirect);
    res
      .status(result.status ?? 400)
      .type('html')
      .send(`<!doctype html><meta charset="utf-8"><title>Catchy</title><p style="font-family:sans-serif;padding:2rem">${escapeHtml(result.error)}</p>`);
  });

  app.post('/oauth/approve', oauth, async (req, res) => {
    const approve = req.body?.approve === true;
    const owner = approve ? await deps.verifyOwner(req) : null;
    const result = approveAuthorization({ request: req.body?.request, approve, owner }, req.mcpSecret, base(req), now());
    res.status(result.status).set('Cache-Control', 'no-store').json(result.body);
  });

  app.post('/oauth/token', oauth, express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
    const result = exchangeToken(req.body ?? {}, req.headers, req.mcpSecret, base(req), deps.isAdminEmail, now());
    res.status(result.status).set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }).json(result.body);
  });

  const mcp = guard(mcpLimiter);
  app.post('/mcp', mcp, async (req, res) => {
    const origin = base(req);
    const auth = verifyAccessToken(req.get('authorization'), req.mcpSecret, origin, deps.isAdminEmail, now());
    if (!auth.ok) {
      return res
        .status(401)
        .set('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="${auth.error}"`)
        .json({ error: auth.error, error_description: auth.message });
    }
    try {
      const db = await deps.getDb();
      if (!db) return res.status(503).json({ error: 'temporarily_unavailable', error_description: 'Store data is unavailable.' });
      const server = createCatchyMcpServer(createCatchyData(db, { baseUrl: origin, analytics: deps.analytics }), { baseUrl: origin });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err?.message || err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });
  const notAllowed = (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
