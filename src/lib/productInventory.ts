export type SizeStock = Record<string, number>;

export type SizeRow = {
  id: string;
  size: string;
  quantity: string;
};

const SIZE_KEY = /^[^\s].{0,19}$/;

export function newSizeRow(size = '', quantity = ''): SizeRow {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, size, quantity };
}

export function parseSizeStock(raw: unknown): SizeStock {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map: SizeStock = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const size = String(key).trim();
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    if (size) map[size] = qty;
  });
  return map;
}

/** Build sizeStock from legacy `sizes[]` + total `stock` when no map exists yet. */
export function resolveProductInventory(data: {
  sizeStock?: unknown;
  sizes?: unknown;
  stock?: unknown;
}): { sizeStock: SizeStock; stock: number } {
  const parsed = parseSizeStock(data.sizeStock);
  if (Object.keys(parsed).length > 0) {
    return { sizeStock: parsed, stock: totalFromSizeStock(parsed) };
  }

  const legacySizes = Array.isArray(data.sizes)
    ? data.sizes.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const legacyStock = Math.max(0, Math.floor(Number(data.stock) || 0));

  if (legacySizes.length === 0) {
    return { sizeStock: {}, stock: legacyStock };
  }

  // Legacy: sizes listed but no per-size qty — treat as unavailable per size until admin sets counts
  const sizeStock: SizeStock = {};
  legacySizes.forEach((size) => {
    sizeStock[size] = 0;
  });
  return { sizeStock, stock: legacyStock };
}

export function totalFromSizeStock(sizeStock: SizeStock): number {
  return Object.values(sizeStock).reduce((sum, n) => sum + Math.max(0, n), 0);
}

export function sizeStockToRows(sizeStock: SizeStock): SizeRow[] {
  return Object.entries(sizeStock).map(([size, quantity]) =>
    newSizeRow(size, String(quantity))
  );
}

export function rowsToSizeStock(rows: SizeRow[]): { sizeStock: SizeStock; error?: string } {
  const sizeStock: SizeStock = {};
  for (const row of rows) {
    const size = row.size.trim();
    if (!size) continue;
    if (!SIZE_KEY.test(size)) {
      return { sizeStock: {}, error: `Invalid size label "${size}".` };
    }
    if (sizeStock[size] !== undefined) {
      return { sizeStock: {}, error: `Duplicate size "${size}".` };
    }
    const qty = Math.floor(Number(row.quantity));
    if (!Number.isFinite(qty) || qty < 0) {
      return { sizeStock: {}, error: `Invalid quantity for size "${size}".` };
    }
    sizeStock[size] = qty;
  }
  return { sizeStock };
}

export function hasSizedInventory(sizeStock: SizeStock): boolean {
  return Object.keys(sizeStock).length > 0;
}

export function availableSizes(sizeStock: SizeStock): string[] {
  return Object.entries(sizeStock)
    .filter(([, qty]) => qty > 0)
    .map(([size]) => size);
}

export function getSizeQuantity(sizeStock: SizeStock, size: string | null | undefined): number {
  if (!size) return 0;
  return Math.max(0, sizeStock[size] ?? 0);
}

export function stockForSelection(
  sizeStock: SizeStock,
  totalStock: number,
  size: string | null | undefined
): number {
  if (hasSizedInventory(sizeStock)) {
    return getSizeQuantity(sizeStock, size);
  }
  return totalStock;
}

export function decrementInventory(
  sizeStock: SizeStock,
  totalStock: number,
  size: string | null | undefined,
  quantity: number
): { sizeStock: SizeStock; stock: number } {
  if (hasSizedInventory(sizeStock)) {
    if (!size) throw new Error('SIZE_REQUIRED');
    const current = getSizeQuantity(sizeStock, size);
    if (current < quantity) throw new Error('OUT_OF_STOCK');
    const next: SizeStock = { ...sizeStock, [size]: current - quantity };
    return { sizeStock: next, stock: totalFromSizeStock(next) };
  }

  if (totalStock < quantity) throw new Error('OUT_OF_STOCK');
  return { sizeStock, stock: totalStock - quantity };
}

export function cartLineKey(
  productId: string,
  size?: string | null,
  colorId?: string | null
): string {
  const parts = [productId];
  if (colorId) parts.push(colorId);
  if (size) parts.push(size);
  return parts.join('::');
}

const SIZE_SORT_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'One Size'];

export function sortedSizeStockEntries(
  sizeStock: SizeStock,
  options: { includeZero?: boolean } = {}
): [string, number][] {
  const { includeZero = true } = options;
  const entries = Object.entries(sizeStock).filter(([, qty]) => includeZero || qty > 0);
  return entries.sort(([a], [b]) => {
    const ai = SIZE_SORT_ORDER.findIndex((s) => s.toLowerCase() === a.toLowerCase());
    const bi = SIZE_SORT_ORDER.findIndex((s) => s.toLowerCase() === b.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function formatSizeStockSummary(sizeStock: SizeStock, max = 4): string {
  const entries = sortedSizeStockEntries(sizeStock, { includeZero: false });
  if (!entries.length) return '—';
  const parts = entries.slice(0, max).map(([s, q]) => `${s}×${q}`);
  if (entries.length > max) parts.push(`+${entries.length - max}`);
  return parts.join(', ');
}
