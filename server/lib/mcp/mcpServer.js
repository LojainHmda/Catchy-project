// The Catchy MCP server: READ-ONLY tools over the store's products, orders, reports and
// visitor analytics (see catchyData.js). Built per request (stateless Streamable HTTP),
// and only after the caller's OAuth access token was verified (routes.js).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Store day, YYYY-MM-DD (Asia/Hebron)');

const asText = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const notFound = (what) => ({ content: [{ type: 'text', text: `${what} not found.` }], isError: true });
const failed = (result) => (result?.error ? { content: [{ type: 'text', text: result.error }], isError: true } : null);

export function createCatchyMcpServer(data, { baseUrl } = {}) {
  const server = new McpServer(
    { name: 'catchy-store', version: '1.0.0' },
    {
      instructions:
        'Read-only access to the Catchy fashion store (catchy-ps.com): products and stock, website + POS orders, ' +
        'sales reports and visitor analytics. Money is in ILS. Dates are store days (YYYY-MM-DD, Asia/Hebron). ' +
        'Nothing can be changed through these tools. Orders include customer contact details — handle them with care.',
    }
  );

  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description: 'Find products by name (English/Arabic), barcode or id; filter by category, visibility and stock. Returns price, categories, visibility and total stock.',
      inputSchema: {
        query: z.string().max(100).optional().describe('Text to match in name, Arabic name, barcode or id'),
        category: z.string().max(60).optional().describe('Category or collection name'),
        visibility: z.enum(['all', 'visible', 'hidden']).optional().describe('Default all'),
        in_stock_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
      },
      annotations: { title: 'Search products', ...READ_ONLY },
    },
    async ({ query, category, visibility, in_stock_only, limit }) =>
      asText(await data.searchProducts({ query, category, visibility, inStockOnly: in_stock_only, limit }))
  );

  server.registerTool(
    'get_product',
    {
      title: 'Get product',
      description: 'Full details of one product: prices, description, categories, visibility, stock per size and per colour, images.',
      inputSchema: { product_id: z.string().min(1).max(200) },
      annotations: { title: 'Get product', ...READ_ONLY },
    },
    async ({ product_id }) => {
      const product = await data.getProduct(product_id);
      return product ? asText(product) : notFound('Product');
    }
  );

  server.registerTool(
    'low_stock_products',
    {
      title: 'Low stock',
      description: 'Products whose stock (per colour/size) is at or below a threshold.',
      inputSchema: {
        threshold: z.number().int().min(0).max(100).optional().describe('Default 2'),
        include_hidden: z.boolean().optional(),
      },
      annotations: { title: 'Low stock', ...READ_ONLY },
    },
    async ({ threshold, include_hidden }) => asText(await data.lowStock({ threshold, includeHidden: include_hidden }))
  );

  server.registerTool(
    'list_orders',
    {
      title: 'List orders',
      description: 'Website and POS orders in a date range (default: last 30 days), newest first. Filter by status, source or text (order number, customer name, phone, email).',
      inputSchema: {
        from: day.optional(),
        to: day.optional(),
        status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled']).optional(),
        source: z.enum(['web', 'pos']).optional(),
        query: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
      },
      annotations: { title: 'List orders', ...READ_ONLY },
    },
    async (args) => {
      const result = await data.listOrders(args);
      return failed(result) ?? asText(result);
    }
  );

  server.registerTool(
    'get_order',
    {
      title: 'Get order',
      description: 'Full details of one order: customer contact details, items, subtotal, discount, shipping, total, payment (POS), status history, cancellation and returns.',
      inputSchema: { order_id: z.string().min(1).max(200) },
      annotations: { title: 'Get order', ...READ_ONLY },
    },
    async ({ order_id }) => {
      const order = await data.getOrder(String(order_id).replace(/^#/, ''));
      return order ? asText(order) : notFound('Order');
    }
  );

  server.registerTool(
    'sales_report',
    {
      title: 'Sales report',
      description: 'Sales for a date range (default: last 30 days): booked/fulfilled/cancelled revenue, website vs POS, discounts, shipping, orders by status and top products.',
      inputSchema: { from: day.optional(), to: day.optional() },
      annotations: { title: 'Sales report', ...READ_ONLY },
    },
    async (args) => {
      const result = await data.salesReport(args);
      return failed(result) ?? asText(result);
    }
  );

  server.registerTool(
    'visitor_analytics',
    {
      title: 'Visitor analytics',
      description: 'Storefront visitors for a date range (default: last 30 days): unique visitors (estimate on multi-day ranges), sessions, page views, top products and pages, traffic sources, and live visitors now.',
      inputSchema: { from: day.optional(), to: day.optional() },
      annotations: { title: 'Visitor analytics', ...READ_ONLY },
    },
    async (args) => {
      const result = await data.visitorAnalytics(args);
      return failed(result) ?? asText(result);
    }
  );

  // ChatGPT connectors (deep research / company knowledge) look for these two exact tools.
  server.registerTool(
    'search',
    {
      title: 'Search the store',
      description: 'Search Catchy products by name, and recent orders (last 90 days) by order number or customer. Returns ids for the fetch tool.',
      inputSchema: { query: z.string().min(1).max(100) },
      annotations: { title: 'Search the store', ...READ_ONLY },
    },
    async ({ query }) => {
      const [products, orders] = await Promise.all([
        data.searchProducts({ query, limit: 20 }),
        data.listOrders({ query, limit: 10, from: undefined, to: undefined, ...ninetyDays() }),
      ]);
      const results = [
        ...products.products.map((p) => ({ id: `product:${p.id}`, title: `${p.name} — ${p.price} ILS`, url: p.url })),
        ...(orders.orders ?? []).map((o) => ({ id: `order:${o.id}`, title: `Order ${o.number} — ${o.customerName ?? 'customer'} — ${o.total} ILS (${o.status})`, url: `${baseUrl}/admin/orders?order=${encodeURIComponent(o.id)}` })),
      ];
      return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
    }
  );

  server.registerTool(
    'fetch',
    {
      title: 'Fetch a product or order',
      description: 'Full record for an id returned by search (product:<id> or order:<id>).',
      inputSchema: { id: z.string().min(3).max(220) },
      annotations: { title: 'Fetch a product or order', ...READ_ONLY },
    },
    async ({ id }) => {
      const [kind, ...rest] = String(id).split(':');
      const key = rest.join(':');
      const record = kind === 'product' ? await data.getProduct(key) : kind === 'order' ? await data.getOrder(key) : null;
      if (!record) return notFound('Record');
      const doc = {
        id,
        title: kind === 'product' ? record.name : `Order ${record.number}`,
        text: JSON.stringify(record, null, 2),
        url: kind === 'product' ? record.url : record.adminUrl,
        metadata: { type: kind },
      };
      return { content: [{ type: 'text', text: JSON.stringify(doc) }] };
    }
  );

  return server;
}

function ninetyDays() {
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
