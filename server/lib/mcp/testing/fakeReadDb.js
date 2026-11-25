// In-memory, query-capable stand-in for the Admin SDK used by the MCP tests. Supports the
// read calls catchyData.js makes (collection/where/orderBy/limit/get, doc().get()) and
// RECORDS any write attempt, so tests can prove the MCP tools never write.
const cmp = (a, op, b) => {
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x === undefined || x === null) return false;
  if (op === '>=') return x >= y;
  if (op === '<') return x < y;
  if (op === '==') return x === y;
  throw new Error(`fakeReadDb: unsupported operator ${op}`);
};

export function createFakeReadDb(collections) {
  const writes = [];
  const query = (name, filters = [], order = null, lim = Infinity) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]], order, lim),
    orderBy: (field, dir = 'asc') => query(name, filters, [field, dir], lim),
    limit: (n) => query(name, filters, order, n),
    get: async () => {
      let rows = Object.entries(collections[name] ?? {}).filter(([, d]) => filters.every(([f, op, v]) => cmp(d[f], op, v)));
      if (order) {
        const [f, dir] = order;
        const key = (d) => (d[f] instanceof Date ? d[f].getTime() : d[f]);
        rows = rows.sort((a, b) => (key(a[1]) < key(b[1]) ? -1 : key(a[1]) > key(b[1]) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      return { docs: rows.slice(0, lim).map(([id, d]) => ({ id, data: () => structuredClone(d) })) };
    },
    doc: (id) => ({
      get: async () => ({ exists: Object.hasOwn(collections[name] ?? {}, id), id, data: () => structuredClone(collections[name]?.[id]) }),
      set: async (...a) => writes.push(['set', name, id, a]),
      update: async (...a) => writes.push(['update', name, id, a]),
      delete: async () => writes.push(['delete', name, id]),
    }),
    add: async (...a) => writes.push(['add', name, a]),
  });
  return {
    collection: (name) => query(name),
    runTransaction: async () => {
      writes.push(['transaction']);
      throw new Error('fakeReadDb: transactions are not expected in read-only code');
    },
    batch: () => {
      writes.push(['batch']);
      throw new Error('fakeReadDb: batches are not expected in read-only code');
    },
    writes,
  };
}
