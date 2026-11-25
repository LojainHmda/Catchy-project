import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mountCatchyMcp } from './routes.js';
import { createFakeReadDb } from './testing/fakeReadDb.js';
import { storeDayStart } from './catchyData.js';

// End to end over real HTTP: a client registers like claude.ai/ChatGPT do, the owner
// approves on the consent step, the code is exchanged with PKCE, and the official MCP
// client calls every tool. Firestore is an in-memory fake that records writes.

const SECRET = 'integration-secret-'.padEnd(48, 'q');
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const OWNER = 'lojain2077@gmail.com';
const owners = new Set([OWNER]);
const ID_TOKENS = {
  'owner-id-token': { ok: true, uid: 'u-owner', email: OWNER, projectId: 'kartacagenai' },
  'staff-id-token': { ok: false, status: 403, message: 'This account is not an admin.' },
};

const day = (d, h = 12) => new Date(storeDayStart(d).getTime() + h * 3600_000);
const db = createFakeReadDb({
  products: {
    skirt: { name: 'Linen Skirt', nameAr: 'تنورة كتان', price: 120, category: 'Skirts', visible: true, sizeStock: { S: 1, M: 4 }, createdAt: day('2026-10-01') },
    dress: {
      name: 'Silk Dress', price: 300, compareAtPrice: 350, onSale: true, collections: ['Dresses'], visible: true, createdAt: day('2026-10-02'),
      colorVariants: [{ id: 'red', name: 'Red', sizeStock: { M: 0, L: 2 } }, { id: 'blue', name: 'Blue', sizeStock: { M: 5 } }],
    },
    hidden: { name: 'Old Top', price: 50, visible: false, stock: 0, createdAt: day('2026-01-01') },
  },
  orders: {
    web1: {
      source: 'web', status: 'delivered', createdAt: day('2026-11-02'), customerName: 'Lina Haddad', customerPhone: '0591234567', email: 'lina@example.com',
      deliveryAddress: 'Ramallah', deliveryZone: 'west_bank', items: [{ productId: 'skirt', name: 'Linen Skirt (M)', price: 120, quantity: 2, size: 'M' }],
      subtotal: 240, shippingCost: 20, webDiscount: { amount: 20, reason: 'Loyal customer', appliedByName: OWNER }, total: 240,
    },
    pos1: {
      source: 'pos', status: 'completed', createdAt: day('2026-11-03'), items: [{ productId: 'dress', name: 'Silk Dress', colorName: 'Blue', price: 300, quantity: 1, size: 'M' }],
      subtotal: 300, shippingCost: 0, discount: { mode: 'percent', value: 10, amount: 30, reason: 'Staff' }, total: 270,
      payment: { method: 'cash', cashAmount: 300, cardAmount: 0, changeGiven: 30 }, cashierName: 'Cashier',
    },
    cancelled1: { source: 'web', status: 'cancelled', createdAt: day('2026-11-04'), customerName: 'Sami', items: [{ productId: 'skirt', name: 'Linen Skirt', price: 120, quantity: 1 }], subtotal: 120, shippingCost: 20, total: 140 },
    old: { source: 'web', status: 'delivered', createdAt: day('2026-08-01'), customerName: 'Old', items: [], subtotal: 10, shippingCost: 0, total: 10 },
  },
});

const analytics = {
  getStore: async () => ({}),
  handleSummary: async (_g, auth, range) => ({ status: auth.ok ? 200 : 403, body: { ok: true, from: range.from, to: range.to, totals: { pageViews: 42, uniqueVisitors: 7 } } }),
  handleLive: async () => ({ status: 200, body: { ok: true, live: 3, windowMinutes: 5 } }),
};

let server;
let base;
let secret = SECRET;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  mountCatchyMcp(app, {
    getSecret: () => secret,
    getDb: async () => db,
    verifyOwner: async (req) => ID_TOKENS[String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')] ?? { ok: false, status: 401 },
    isAdminEmail: (email) => owners.has(email),
    analytics,
  });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const json = async (path, init = {}) => {
  const r = await fetch(`${base}${path}`, { redirect: 'manual', ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
};

async function signIn(idToken = 'owner-id-token') {
  const reg = await json('/oauth/register', { method: 'POST', body: JSON.stringify({ redirect_uris: [CALLBACK], client_name: 'Claude' }) });
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.body.client_id, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', resource: `${base}/mcp` });
  const auth = await fetch(`${base}/oauth/authorize?${q}`, { redirect: 'manual' });
  const consent = new URL(auth.headers.get('location'), base);
  const approve = await json('/oauth/approve', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ request: consent.searchParams.get('req'), approve: true }) });
  if (approve.status !== 200) return { approve, consent };
  const code = new URL(approve.body.redirect).searchParams.get('code');
  const token = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: reg.body.client_id, code_verifier: verifier }),
  });
  return { approve, consent, auth, token: await token.json(), tokenStatus: token.status };
}

async function connect(accessToken) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }));
  return client;
}
const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: r.isError === true, data: (() => { try { return JSON.parse(r.content[0].text); } catch { return r.content[0].text; } })() };
};

describe('Catchy MCP over HTTP', () => {
  it('discovery documents point clients at this origin', async () => {
    const pr = await json('/.well-known/oauth-protected-resource');
    expect(pr.body).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base] });
    expect((await json('/.well-known/oauth-protected-resource/mcp')).status).toBe(200);
    expect((await json('/.well-known/oauth-authorization-server')).body).toMatchObject({ issuer: base, registration_endpoint: `${base}/oauth/register` });
  });

  it('/mcp without a token → 401 telling the client where to sign in', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it('owner sign-in → consent page → tokens', async () => {
    const r = await signIn();
    expect(r.auth.status).toBe(302);
    expect(r.consent.pathname).toBe('/mcp-authorize');
    expect(new URL(r.approve.body.redirect).searchParams.get('state')).toBe('st-1');
    expect(r.tokenStatus).toBe(200);
    expect(r.token).toMatchObject({ token_type: 'Bearer', scope: 'catchy.read' });
  });

  it('a staff/customer account cannot approve (403) and gets no code', async () => {
    const r = await signIn('staff-id-token');
    expect(r.approve.status).toBe(403);
    expect(r.approve.body.redirect).toBeUndefined();
    expect((await signIn('not-a-token')).approve.status).toBe(401);
  });

  it('read-only tools return real store answers, and nothing is ever written', async () => {
    const { token } = await signIn();
    const client = await connect(token.access_token);

    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['fetch', 'get_order', 'get_product', 'list_orders', 'low_stock_products', 'sales_report', 'search', 'search_products', 'visitor_analytics'].sort()
    );
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);

    const found = await call(client, 'search_products', { query: 'كتان' });
    expect(found.data.products).toEqual([expect.objectContaining({ id: 'skirt', name: 'Linen Skirt', price: 120, stock: 5, url: `${base}/product/skirt` })]);
    expect((await call(client, 'search_products', { visibility: 'hidden' })).data.products.map((p) => p.id)).toEqual(['hidden']);

    const dress = await call(client, 'get_product', { product_id: 'dress' });
    expect(dress.data).toMatchObject({ compareAtPrice: 350, onSale: true, stock: 7, colors: [expect.objectContaining({ name: 'Red', stock: 2 }), expect.objectContaining({ name: 'Blue', stock: 5 })] });
    expect((await call(client, 'get_product', { product_id: 'nope' })).isError).toBe(true);

    const low = await call(client, 'low_stock_products', { threshold: 1 });
    expect(low.data.products.map((p) => p.id).sort()).toEqual(['dress', 'skirt']);

    const orders = await call(client, 'list_orders', { from: '2026-11-01', to: '2026-11-10' });
    expect(orders.data.orders.map((o) => o.id)).toEqual(['cancelled1', 'pos1', 'web1']);
    expect((await call(client, 'list_orders', { from: '2026-11-01', to: '2026-11-10', query: 'lina' })).data.orders.map((o) => o.id)).toEqual(['web1']);
    expect((await call(client, 'list_orders', { from: '2026-11-10', to: '2026-11-01' })).isError).toBe(true);

    const order = await call(client, 'get_order', { order_id: '#web1' });
    expect(order.data).toMatchObject({
      number: '#WEB1', total: 240, discount: { kind: 'website', amount: 20, reason: 'Loyal customer' },
      customer: { name: 'Lina Haddad', phone: '0591234567', address: 'Ramallah' },
    });

    const report = await call(client, 'sales_report', { from: '2026-11-01', to: '2026-11-10' });
    expect(report.data).toMatchObject({
      orders: 3, booked: { count: 2, revenue: 510 }, cancelled: { count: 1, revenue: 140 }, fulfilled: { count: 2, revenue: 510 },
      website: { count: 1, revenue: 240, discountsGiven: 20, shippingCharged: 20 }, pos: { count: 1, revenue: 270, discountsGiven: 30 },
    });
    expect(report.data.topProducts[0]).toMatchObject({ productId: 'skirt', quantity: 2 });

    const visits = await call(client, 'visitor_analytics', { from: '2026-11-01', to: '2026-11-10' });
    expect(visits.data).toMatchObject({ totals: { pageViews: 42 }, liveVisitorsNow: 3 });

    const search = await call(client, 'search', { query: 'skirt' });
    expect(search.data.results[0]).toMatchObject({ id: 'product:skirt' });
    const fetched = await call(client, 'fetch', { id: 'order:pos1' });
    expect(fetched.data).toMatchObject({ id: 'order:pos1', title: 'Order #POS1', metadata: { type: 'order' } });

    await client.close();
    expect(db.writes).toEqual([]);
  });

  it('removing someone as owner cuts off their access immediately', async () => {
    const { token } = await signIn();
    owners.delete(OWNER);
    try {
      const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
      expect(r.status).toBe(401);
    } finally {
      owners.add(OWNER);
    }
  });

  it('fails closed (503) when the signing secret is not configured', async () => {
    secret = undefined;
    try {
      expect((await json('/.well-known/oauth-authorization-server')).status).toBe(503);
      expect((await fetch(`${base}/mcp`, { method: 'POST' })).status).toBe(503);
    } finally {
      secret = SECRET;
    }
  });
});
