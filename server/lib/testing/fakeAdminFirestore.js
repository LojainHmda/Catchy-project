// In-memory Admin SDK fake for server tests, with OPTIMISTIC concurrency control
// (same model as webOrderCancel.test.js): every document has a version; a
// transaction records the version of each doc it reads and, if any changed
// before it commits, the whole callback is retried against fresh data — like
// Firestore's retry-on-contention. `tx.get` yields to the event loop so two
// transactions started together genuinely interleave.
//
// What this CAN show: callbacks are retry-safe and concurrent requests cannot
// both pass a check that only one of them should pass.
// What it CANNOT show: the real Admin SDK's server-side locking, timeouts or
// network failures — those are Firestore's documented guarantees.
export function createFakeAdminFirestore(seed = {}) {
  const store = new Map();
  const versions = new Map();
  let attempts = 0;
  let autoId = 0;
  for (const [path, data] of Object.entries(seed)) {
    store.set(path, structuredClone(data));
    versions.set(path, 1);
  }
  const ref = (collectionName, id) => ({ id, path: `${collectionName}/${id}` });

  async function runTransaction(fn) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      attempts += 1;
      const readVersions = new Map();
      const pendingWrites = new Map();
      let wrote = false;
      const tx = {
        get: async (r) => {
          if (wrote) throw new Error('READ_AFTER_WRITE'); // Firestore requires all reads before writes
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (!readVersions.has(r.path)) readVersions.set(r.path, versions.get(r.path) ?? 0);
          const data = store.get(r.path);
          return { exists: data !== undefined, id: r.id, data: () => (data ? structuredClone(data) : undefined) };
        },
        update: (r, patch) => {
          wrote = true;
          const current = pendingWrites.has(r.path) ? pendingWrites.get(r.path) : store.get(r.path);
          if (current === undefined) throw new Error(`NOT_FOUND ${r.path}`); // update() requires an existing doc
          pendingWrites.set(r.path, { ...current, ...structuredClone(patch) });
        },
        set: (r, data) => {
          wrote = true;
          pendingWrites.set(r.path, structuredClone(data));
        },
      };
      const result = await fn(tx);
      const conflict = [...readVersions].some(([path, version]) => (versions.get(path) ?? 0) !== version);
      if (conflict) continue;
      for (const [path, data] of pendingWrites) {
        store.set(path, data);
        versions.set(path, (versions.get(path) ?? 0) + 1);
      }
      return result;
    }
    throw new Error('TRANSACTION_ABORTED');
  }

  return {
    collection: (name) => ({ doc: (id) => ref(name, id ?? `auto-${(autoId += 1)}`) }),
    runTransaction,
    _get: (collectionName, id) => store.get(`${collectionName}/${id}`),
    _set: (collectionName, id, data) => {
      store.set(`${collectionName}/${id}`, structuredClone(data));
      versions.set(`${collectionName}/${id}`, (versions.get(`${collectionName}/${id}`) ?? 0) + 1);
    },
    _list: (collectionName) =>
      [...store.entries()].filter(([path]) => path.startsWith(`${collectionName}/`)).map(([path, data]) => ({ id: path.split('/')[1], ...data })),
    _attempts: () => attempts,
  };
}

/** True when any nested value is `undefined` (the Admin SDK rejects such writes). */
export function containsUndefined(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.values(value).some(containsUndefined);
  return false;
}
