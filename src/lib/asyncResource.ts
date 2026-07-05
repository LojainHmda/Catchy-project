/** In-memory stale-while-revalidate cache with in-flight request deduplication. */

type Entry<T> = {
  value: T;
  at: number;
};

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function readCache<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.at >= ttlMs) return null;
  return entry.value;
}

export function readStaleCache<T>(key: string): T | null {
  const entry = store.get(key) as Entry<T> | undefined;
  return entry?.value ?? null;
}

export function writeCache<T>(key: string, value: T): void {
  store.set(key, { value, at: Date.now() });
}

export function invalidateCache(key: string): void {
  store.delete(key);
  inflight.delete(key);
}

/**
 * Load a resource with deduplicated in-flight requests and optional stale fallback.
 * @param revalidate When true, returns stale data immediately (if any) and refreshes in background.
 */
export async function loadResource<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options?: { revalidate?: boolean }
): Promise<T> {
  const fresh = readCache<T>(key, ttlMs);
  if (fresh) return fresh;

  const stale = options?.revalidate ? readStaleCache<T>(key) : null;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    if (stale) return stale;
    return pending;
  }

  const task = loader()
    .then((value) => {
      writeCache(key, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);

  if (stale) {
    void task.catch(() => undefined);
    return stale;
  }

  return task;
}

export function scheduleIdle(task: () => void, fallbackMs = 1500): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) task();
  };

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 4000 });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const id = window.setTimeout(run, fallbackMs);
  return () => {
    cancelled = true;
    window.clearTimeout(id);
  };
}
