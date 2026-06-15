import type { OrderLineItem, OrderRecord, OrderStatus } from '../../types/order';
import { ORDER_STATUSES } from '../../types/order';
import { getShippingCost } from '../shippingZones';

export const ORDER_STATUS_FLOW: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

export function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') return maybe.toDate();
  }
  if (value instanceof Date) return value;
  return null;
}

export function normalizeOrderStatus(raw: unknown): OrderStatus {
  const status = String(raw ?? 'pending').toLowerCase();
  return ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : 'pending';
}

export function orderStatusStep(status: OrderStatus): number {
  if (status === 'cancelled') return 0;
  const index = ORDER_STATUS_FLOW.indexOf(status);
  return index >= 0 ? index + 1 : 1;
}

export function isOrderActive(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

export function formatOrderMoney(amount: number, locale = 'en-GB'): string {
  return `ILS ${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatOrderDate(date: Date | null, locale = 'en-GB'): string {
  if (!date) return '—';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatOrderDateTime(date: Date | null, locale = 'en-GB'): string {
  if (!date) return '—';
  return date.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortOrderId(id: string): string {
  return id.length > 8 ? `#${id.slice(0, 8).toUpperCase()}` : `#${id.toUpperCase()}`;
}

/** Firestore docs are capped at 1 MiB — never persist base64 blobs on order line items. */
export function sanitizeStoredImageUrl(url: unknown): string {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s.slice(0, 2048);
  return s.length <= 512 ? s : '';
}

export function firstProductImageUrl(data: Record<string, unknown>): string {
  const images = data.images;
  if (!Array.isArray(images)) return '';
  const first = images.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
  return typeof first === 'string' ? first : '';
}

export function parseOrderLineItems(raw: unknown): OrderLineItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return {
          productId: '',
          name: String(entry),
          price: 0,
          quantity: 1,
          image: '',
          lineTotal: 0,
        };
      }

      const item = entry as Record<string, unknown>;
      const price = Number(item.price) || 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);

      return {
        productId: String(item.productId ?? item.id ?? ''),
        name: String(item.name ?? 'Item'),
        price,
        quantity,
        image: sanitizeStoredImageUrl(item.image),
        lineTotal: price * quantity,
        size: typeof item.size === 'string' && item.size.trim() ? item.size.trim() : null,
        colorId: typeof item.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
        colorName: typeof item.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
        itemSizes:
          item.itemSizes && typeof item.itemSizes === 'object' && !Array.isArray(item.itemSizes)
            ? (item.itemSizes as Record<string, string>)
            : undefined,
      };
    })
    .filter((item) => item.name.trim().length > 0);
}

/** Split stored line name into product title + color + size for display tables. */
export function parseLineItemDisplay(item: Pick<OrderLineItem, 'name' | 'size' | 'colorName'>) {
  let color = item.colorName?.trim() || null;
  let size = item.size?.trim() || null;
  let productName = item.name.trim();

  const suffixMatch = productName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (suffixMatch) {
    productName = suffixMatch[1]!.trim();
    if (!color && !size) {
      const inner = suffixMatch[2]!.trim();
      const parts = inner.split('/').map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        color = parts[0] ?? null;
        size = parts[1] ?? null;
      } else if (parts.length === 1) {
        size = parts[0] ?? null;
      }
    }
  }

  return { productName, color, size };
}

export function parseOrderDocument(
  id: string,
  data: Record<string, unknown>,
  profile?: { email: string | null; displayName: string | null } | null
): OrderRecord {
  const items = parseOrderLineItems(data.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const userId = String(data.userId ?? '');
  const isGuest = data.isGuest === true || userId === 'guest';
  const itemsSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const subtotal = Number(data.subtotal) || itemsSubtotal;
  const deliveryZone =
    typeof data.deliveryZone === 'string' && data.deliveryZone.trim() ? data.deliveryZone.trim() : null;
  const shippingCost =
    Number.isFinite(Number(data.shippingCost)) && data.shippingCost !== null && data.shippingCost !== undefined
      ? Number(data.shippingCost)
      : deliveryZone
        ? getShippingCost(deliveryZone)
        : 0;
  const total = Number(data.total) || subtotal + shippingCost;

  return {
    id,
    userId,
    isGuest,
    customerEmail: profile?.email ?? (typeof data.email === 'string' ? data.email : null),
    customerName:
      profile?.displayName ?? (typeof data.customerName === 'string' ? data.customerName : null),
    customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : null,
    deliveryAddress: typeof data.deliveryAddress === 'string' ? data.deliveryAddress : null,
    deliveryZone,
    status: normalizeOrderStatus(data.status),
    subtotal,
    shippingCost,
    total,
    itemCount,
    createdAt: toDate(data.createdAt),
    items,
  };
}

export function orderStatusTone(status: OrderStatus): {
  badge: string;
  dot: string;
} {
  switch (status) {
    case 'delivered':
      return { badge: 'bg-catchy/10 text-catchy-dark ring-catchy/20', dot: 'bg-catchy' };
    case 'shipped':
      return { badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' };
    case 'processing':
      return { badge: 'bg-amber-50 text-amber-800 ring-amber-600/20', dot: 'bg-amber-500' };
    case 'cancelled':
      return { badge: 'bg-gray-100 text-gray-600 ring-gray-500/20', dot: 'bg-gray-400' };
    default:
      return { badge: 'bg-orange-50 text-orange-800 ring-orange-600/20', dot: 'bg-orange-500' };
  }
}
