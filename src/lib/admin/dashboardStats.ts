import type { OrderRecord } from '../../types/order';
import { resolveProductInventory } from '../productInventory';
import { parseColorVariants } from '../productVariants';
import { resolveDateRange, type DateRange } from '../orders/orderListFilters';
import { buildSalesReport, percentChange } from '../reports/salesReport';

/** Approved low-stock threshold: any color/size cell (or a size-less product's total) at or below this. */
export const LOW_STOCK_THRESHOLD = 3;

export type StockCell = { color: string | null; colorAr: string | null; size: string | null; quantity: number };

export type LowStockProduct = {
  id: string;
  name: string;
  /** Cells at or below the threshold, lowest first (0 = sold out). */
  lowCells: StockCell[];
  lowestQuantity: number;
  totalStock: number;
};

/**
 * Every inventory cell of a product, using the same source of truth as the
 * storefront: color variants when present (each color × size), otherwise the
 * per-size map, otherwise the product's single total.
 */
export function productStockCells(data: Record<string, unknown>): StockCell[] {
  const variants = parseColorVariants(data.colorVariants);
  if (variants.length > 0) {
    return variants.flatMap((variant) => {
      const sizes = Object.entries(variant.sizeStock);
      if (sizes.length === 0) return [{ color: variant.name, colorAr: variant.nameAr ?? null, size: null, quantity: 0 }];
      return sizes.map(([size, quantity]) => ({ color: variant.name, colorAr: variant.nameAr ?? null, size, quantity }));
    });
  }
  const { sizeStock, stock } = resolveProductInventory(data);
  const sizes = Object.entries(sizeStock);
  if (sizes.length > 0) return sizes.map(([size, quantity]) => ({ color: null, colorAr: null, size, quantity }));
  return [{ color: null, colorAr: null, size: null, quantity: stock }];
}

/**
 * Products with at least one cell at or below `threshold`. Hidden products
 * (`visible === false`) are skipped — they are not on sale.
 */
export function findLowStockProducts(
  products: { id: string; data: Record<string, unknown> }[],
  threshold = LOW_STOCK_THRESHOLD
): LowStockProduct[] {
  const rows: LowStockProduct[] = [];
  for (const { id, data } of products) {
    if (data.visible === false) continue;
    const cells = productStockCells(data);
    const lowCells = cells.filter((cell) => cell.quantity <= threshold).sort((a, b) => a.quantity - b.quantity);
    if (lowCells.length === 0) continue;
    rows.push({
      id,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id,
      lowCells,
      lowestQuantity: lowCells[0]!.quantity,
      totalStock: cells.reduce((sum, cell) => sum + cell.quantity, 0),
    });
  }
  return rows.sort((a, b) => a.lowestQuantity - b.lowestQuantity || a.totalStock - b.totalStock || a.name.localeCompare(b.name));
}

export type Trend = { current: number; previous: number; changePct: number | null };

export type DashboardOrderStats = {
  today: { orders: number; booked: number; web: number; pos: number };
  last30: { bookedRevenue: Trend; orders: Trend; fulfilledRevenue: Trend };
};

/** The window the dashboard needs: the last 60 days, so 30 days can be compared with the 30 before. */
export function dashboardOrdersWindow(now: Date = new Date()): DateRange {
  const last30 = resolveDateRange('30d', now);
  const start = new Date(last30.start!.getFullYear(), last30.start!.getMonth(), last30.start!.getDate() - 30);
  return { start, end: last30.end };
}

/** Today's snapshot and last-30-days-vs-previous-30 trends (booked = all except cancelled). */
export function computeDashboardOrderStats(orders: OrderRecord[], now: Date = new Date()): DashboardOrderStats {
  const today = buildSalesReport(orders, resolveDateRange('today', now));
  const currentRange = resolveDateRange('30d', now);
  const previousRange: DateRange = {
    start: new Date(currentRange.start!.getFullYear(), currentRange.start!.getMonth(), currentRange.start!.getDate() - 30),
    end: currentRange.start,
  };
  const current = buildSalesReport(orders, currentRange);
  const previous = buildSalesReport(orders, previousRange);
  const trend = (c: number, p: number): Trend => ({ current: c, previous: p, changePct: percentChange(c, p) });

  return {
    // Booked (non-cancelled) orders — the same definition as the 30-day card. web/pos are booked counts too.
    today: { orders: today.booked.count, booked: today.booked.revenue, web: today.web.count, pos: today.pos.count },
    last30: {
      bookedRevenue: trend(current.booked.revenue, previous.booked.revenue),
      orders: trend(current.booked.count, previous.booked.count),
      fulfilledRevenue: trend(current.fulfilled.revenue, previous.fulfilled.revenue),
    },
  };
}
