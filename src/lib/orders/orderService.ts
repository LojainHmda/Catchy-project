import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  addDoc,
  serverTimestamp,
} from '../../firebase';
import type {
  CartLineItem,
  OrderCustomer,
  OrderLineItem,
  OrderRecord,
  PlaceOrderResult,
} from '../../types/order';
import {
  decrementInventory,
  hasSizedInventory,
  resolveProductInventory,
  stockForSelection,
  totalFromSizeStock,
  type SizeStock,
} from '../productInventory';
import {
  aggregateFromVariants,
  aggregateSizeStockFromVariants,
  decrementColorVariants,
  defaultVariantId,
  parseColorVariants,
  resolveVariantSelection,
} from '../productVariants';
import type { ProductColorVariant } from '../../types/product';
import { isCoordinateCartId, coordinateLookIdFromCart, validateCoordinateItemSizes, coordinateAvailableSets, formatCoordinateItemSizes } from '../coordinateCart';
import { resolveCoordinate } from '../coordinateResolve';
import { getShippingCost } from '../shippingZones';
import { OrderError } from './orderErrors';
import { firstProductImageUrl, parseOrderDocument, sanitizeStoredImageUrl } from './orderUtils';
import { primaryCoordinateImage } from '../coordinateImages';

const PRODUCTS_COLLECTION = 'products';
const COORDINATE_LOOKS_COLLECTION = 'coordinate_looks';

type DocSnap = Awaited<ReturnType<typeof getDoc>>;
type WorkingInventory = {
  sizeStock: SizeStock;
  stock: number;
  sized: boolean;
  colorVariants?: ReturnType<typeof parseColorVariants>;
  hasVariants: boolean;
};

type CoordinateBundle = {
  lookSnap: DocSnap;
  resolved: NonNullable<ReturnType<typeof resolveCoordinate>>;
};

function readProductStockField(data: Record<string, unknown>): number | null {
  const raw = data.stock;
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return null;
  return Math.max(0, Math.floor(Number(raw)));
}

function stockAfterCheckout(
  data: Record<string, unknown>,
  workingStock: number,
  qtyRemoved: number
): number {
  const stored = readProductStockField(data);
  const priorStock = stored ?? workingStock + qtyRemoved;
  return Math.max(0, priorStock - qtyRemoved);
}

function firebaseErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: string }).code)
    : '';
}

async function applyInventoryUpdates(
  updates: {
    productId: string;
    stock: number;
    sizeStock?: SizeStock;
    sized: boolean;
    colorVariants?: ReturnType<typeof parseColorVariants>;
    hasVariants?: boolean;
  }[]
): Promise<void> {
  for (const update of updates) {
    const payload: Record<string, unknown> = { stock: update.stock };
    if (update.hasVariants && update.colorVariants) {
      payload.colorVariants = update.colorVariants;
      payload.sizeStock = aggregateSizeStockFromVariants(update.colorVariants);
    } else if (update.sized && update.sizeStock) {
      payload.sizeStock = update.sizeStock;
    }
    await updateDoc(doc(db, PRODUCTS_COLLECTION, update.productId), payload);
  }
}

async function prepareCheckoutContext(cartItems: CartLineItem[]) {
  const regularIds = [...new Set(cartItems.filter((i) => !isCoordinateCartId(i.id)).map((i) => i.id))];
  const coordCartIds = [...new Set(cartItems.filter((i) => isCoordinateCartId(i.id)).map((i) => i.id))];

  const productSnaps = new Map<string, DocSnap>();
  await Promise.all(
    regularIds.map(async (id) => {
      productSnaps.set(id, await getDoc(doc(db, PRODUCTS_COLLECTION, id)));
    })
  );

  const coordinateBundles = new Map<string, CoordinateBundle>();
  await Promise.all(
    coordCartIds.map(async (cartId) => {
      const lookId = coordinateLookIdFromCart(cartId);
      const lookSnap = await getDoc(doc(db, COORDINATE_LOOKS_COLLECTION, lookId));
      if (!lookSnap.exists()) {
        throw new OrderError('PRODUCT_MISSING', 'A coordinate set in your bag is no longer available.');
      }
      const lookData = lookSnap.data() as Record<string, unknown>;
      const productIds = (lookData.productIds as string[]) ?? [];
      const products: Record<string, unknown>[] = [];
      for (const pid of productIds) {
        if (!productSnaps.has(pid)) {
          productSnaps.set(pid, await getDoc(doc(db, PRODUCTS_COLLECTION, pid)));
        }
        const snap = productSnaps.get(pid)!;
        if (snap.exists()) products.push({ id: snap.id, ...snap.data() });
      }

      const resolved = resolveCoordinate(
        {
          productIds,
          price: Number(lookData.price),
          priceAutoSync: lookData.priceAutoSync !== false,
        },
        products
      );
      if (!resolved) {
        throw new OrderError('PRODUCT_MISSING', 'Items in a coordinate set are no longer available.');
      }
      coordinateBundles.set(cartId, { lookSnap, resolved });
    })
  );

  return { productSnaps, coordinateBundles };
}

function buildCheckoutPayload(
  cartItems: CartLineItem[],
  productSnaps: Map<string, DocSnap>,
  coordinateBundles: Map<string, CoordinateBundle>
) {
  const workingByProductId = new Map<string, WorkingInventory>();
  const initialSnapsByProductId = new Map<string, DocSnap>();
  const qtyRemovedByProductId = new Map<string, number>();

  const initWorking = (productId: string, snap: DocSnap) => {
    if (workingByProductId.has(productId)) return;
    if (!snap.exists()) {
      throw new OrderError('PRODUCT_MISSING', 'A product in your bag is no longer available.');
    }
    const data = snap.data() ?? {};
    const variants = parseColorVariants(data.colorVariants);
    if (variants.length > 0) {
      const agg = aggregateFromVariants(variants);
      workingByProductId.set(productId, {
        colorVariants: variants.map((v) => ({ ...v, sizeStock: { ...v.sizeStock } })),
        hasVariants: true,
        sizeStock: agg.sizeStock,
        stock: agg.stock,
        sized: Object.keys(agg.sizeStock).length > 0,
      });
    } else {
      const { sizeStock, stock } = resolveProductInventory(data);
      workingByProductId.set(productId, {
        sizeStock: { ...sizeStock },
        stock,
        sized: hasSizedInventory(sizeStock),
        hasVariants: false,
      });
    }
    initialSnapsByProductId.set(productId, snap);
  };

  for (const [id, snap] of productSnaps) initWorking(id, snap);

  const bumpRemoved = (productId: string, qty: number) => {
    qtyRemovedByProductId.set(productId, (qtyRemovedByProductId.get(productId) ?? 0) + qty);
  };

  const lineItems = cartItems.map((cartItem) => {
    if (isCoordinateCartId(cartItem.id)) {
      const bundle = coordinateBundles.get(cartItem.id);
      if (!bundle) {
        throw new OrderError('PRODUCT_MISSING', `"${cartItem.name}" is no longer available.`, cartItem.name);
      }
      const { resolved, lookSnap } = bundle;
      const itemSizes = cartItem.itemSizes ?? {};
      const sizeError = validateCoordinateItemSizes(resolved.products, itemSizes);
      if (sizeError) {
        throw new OrderError('OUT_OF_STOCK', sizeError, cartItem.name);
      }

      const available = coordinateAvailableSets(resolved.products, itemSizes);
      if (available < cartItem.quantity) {
        throw new OrderError(
          'OUT_OF_STOCK',
          `Only ${available} left in stock for "${cartItem.name}".`,
          cartItem.name
        );
      }

      for (const product of resolved.products) {
        const pid = String(product.id ?? '');
        if (!pid) continue;
        const working = workingByProductId.get(pid)!;
        const perItemSize = itemSizes[pid]?.trim() || null;
        try {
          const next = decrementInventory(
            working.sizeStock,
            working.stock,
            perItemSize,
            cartItem.quantity
          );
          workingByProductId.set(pid, { ...next, sized: working.sized });
          bumpRemoved(pid, cartItem.quantity);
        } catch {
          throw new OrderError('OUT_OF_STOCK', `Not enough stock for "${cartItem.name}".`, cartItem.name);
        }
      }

      const lookData = (lookSnap.data() ?? {}) as Record<string, unknown>;
      const sizeSummary = formatCoordinateItemSizes(itemSizes, resolved.products);
      const lineName = sizeSummary ? `${cartItem.name} (${sizeSummary})` : cartItem.name;
      const image =
        sanitizeStoredImageUrl(cartItem.image) ||
        sanitizeStoredImageUrl(
          primaryCoordinateImage(lookData as { productIds?: string[]; image?: string; images?: string[] }, resolved.products)
        );

      return {
        productId: cartItem.id,
        name: lineName,
        price: resolved.price,
        quantity: cartItem.quantity,
        image,
        size: sizeSummary || null,
        itemSizes,
      };
    }

    const snap = productSnaps.get(cartItem.id);
    if (!snap?.exists()) {
      throw new OrderError('PRODUCT_MISSING', `"${cartItem.name}" is no longer available.`, cartItem.name);
    }
    const data = snap.data() ?? {};
    const price = Number(data.price ?? cartItem.price);
    const working = workingByProductId.get(cartItem.id)!;

    if (working.hasVariants && !cartItem.colorId) {
      throw new OrderError('OUT_OF_STOCK', `Select a color for "${cartItem.name}".`, cartItem.name);
    }

    if (working.sized && !cartItem.size) {
      throw new OrderError('OUT_OF_STOCK', `Select a size for "${cartItem.name}".`, cartItem.name);
    }

    const available = stockForSelection(working.sizeStock, working.stock, cartItem.size);
    if (working.hasVariants && cartItem.colorId && working.colorVariants) {
      const variant = working.colorVariants.find((v) => v.id === cartItem.colorId);
      const variantStock = variant ? stockForSelection(variant.sizeStock, totalFromSizeStock(variant.sizeStock), cartItem.size) : 0;
      if (variantStock < cartItem.quantity) {
        const sizeLabel = cartItem.size ? ` (${cartItem.size})` : '';
        throw new OrderError(
          'OUT_OF_STOCK',
          `Only ${variantStock} left in stock for "${cartItem.name}"${sizeLabel}.`,
          cartItem.name
        );
      }
    } else if (available < cartItem.quantity) {
      const sizeLabel = cartItem.size ? ` (${cartItem.size})` : '';
      throw new OrderError(
        'OUT_OF_STOCK',
        `Only ${available} left in stock for "${cartItem.name}"${sizeLabel}.`,
        cartItem.name
      );
    }

    try {
      if (working.hasVariants && cartItem.colorId && working.colorVariants) {
        const nextVariants = decrementColorVariants(
          working.colorVariants,
          cartItem.colorId,
          cartItem.size,
          cartItem.quantity
        );
        const agg = aggregateFromVariants(nextVariants);
        workingByProductId.set(cartItem.id, {
          ...working,
          colorVariants: nextVariants,
          sizeStock: agg.sizeStock,
          stock: agg.stock,
        });
      } else {
        const next = decrementInventory(working.sizeStock, working.stock, cartItem.size, cartItem.quantity);
        workingByProductId.set(cartItem.id, { ...next, sized: working.sized, hasVariants: false });
      }
      bumpRemoved(cartItem.id, cartItem.quantity);
    } catch {
      throw new OrderError('OUT_OF_STOCK', `Not enough stock for "${cartItem.name}".`, cartItem.name);
    }

    const colorPart = cartItem.colorName ? `${cartItem.colorName}` : '';
    const sizePart = cartItem.size ?? '';
    const variantPart = [colorPart, sizePart].filter(Boolean).join(' / ');
    const lineName = variantPart ? `${cartItem.name} (${variantPart})` : cartItem.name;
    const image =
      sanitizeStoredImageUrl(cartItem.image) ||
      sanitizeStoredImageUrl(firstProductImageUrl(data as Record<string, unknown>));

    return {
      productId: cartItem.id,
      name: lineName,
      price,
      quantity: cartItem.quantity,
      image,
      size: cartItem.size ?? null,
      colorId: cartItem.colorId ?? null,
      colorName: cartItem.colorName ?? null,
    };
  });

  const inventoryUpdates = [...qtyRemovedByProductId.keys()].map((productId) => {
    const working = workingByProductId.get(productId)!;
    const snap = initialSnapsByProductId.get(productId)!;
    const data = (snap.data?.() ?? {}) as Record<string, unknown>;
    const qtyRemoved = qtyRemovedByProductId.get(productId) ?? 0;

    return {
      productId,
      stock: stockAfterCheckout(data, working.stock, qtyRemoved),
      ...(working.hasVariants && working.colorVariants
        ? {
            hasVariants: true,
            colorVariants: working.colorVariants,
            sizeStock: working.sizeStock,
            sized: true,
          }
        : working.sized
          ? { sizeStock: working.sizeStock, sized: true, hasVariants: false }
          : { sized: false, hasVariants: false }),
    };
  });

  const total = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return { lineItems, inventoryUpdates, total, itemCount };
}

export async function placeOrderFromCart(
  cartItems: CartLineItem[],
  customer: OrderCustomer
): Promise<PlaceOrderResult> {
  if (!customer.uid) {
    throw new OrderError('NOT_SIGNED_IN', 'You must be signed in to place an order.');
  }

  if (!cartItems.length) {
    throw new OrderError('EMPTY_CART', 'Your bag is empty.');
  }

  const { productSnaps, coordinateBundles } = await prepareCheckoutContext(cartItems);
  const { lineItems, inventoryUpdates, total: subtotal, itemCount } = buildCheckoutPayload(
    cartItems,
    productSnaps,
    coordinateBundles
  );

  const delivery = customer.delivery;
  const shippingCost = delivery?.deliveryZone ? getShippingCost(delivery.deliveryZone) : 0;
  const total = subtotal + shippingCost;

  const orderDoc = await addDoc(collection(db, 'orders'), {
    userId: customer.uid,
    isGuest: false,
    email: delivery?.email ?? customer.email,
    customerName: delivery?.customerName ?? customer.displayName,
    customerPhone: delivery?.customerPhone ?? null,
    deliveryAddress: delivery?.deliveryAddress ?? null,
    deliveryZone: delivery?.deliveryZone ?? null,
    status: 'pending',
    subtotal,
    shippingCost,
    total,
    itemCount,
    items: lineItems,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await applyInventoryUpdates(inventoryUpdates);
  } catch (error) {
    const code = firebaseErrorCode(error);
    console.warn(`Order ${orderDoc.id} saved; inventory update issue (${code || 'unknown'}):`, error);
  }

  return { orderId: orderDoc.id, total, itemCount };
}

export async function fetchOrderById(orderId: string): Promise<OrderRecord | null> {
  const snap = await getDoc(doc(db, 'orders', orderId));
  if (!snap.exists()) return null;
  return parseOrderDocument(snap.id, snap.data() as Record<string, unknown>);
}

export async function fetchOrdersForUser(userId: string): Promise<OrderRecord[]> {
  const snap = await getDocs(query(collection(db, 'orders'), where('userId', '==', userId)));
  return snap.docs
    .map((docSnap) => parseOrderDocument(docSnap.id, docSnap.data() as Record<string, unknown>))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function fetchAllOrders(
  userProfiles?: Map<string, { email: string | null; displayName: string | null }>
): Promise<OrderRecord[]> {
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const uid = String(data.userId ?? '');
    return parseOrderDocument(docSnap.id, data, userProfiles?.get(uid) ?? null);
  });
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  await updateDoc(doc(db, 'orders', orderId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export type OrderCustomerDetailsUpdate = {
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deliveryAddress?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin: edit the line items of an existing order (add / change qty / remove).
// Inventory is adjusted alongside the order so stock stays in sync, mirroring the
// checkout flow. Coordinate sets are intentionally out of scope here.
// ─────────────────────────────────────────────────────────────────────────────

/** Money + count fields recomputed from the items, keeping the order's shipping cost. */
export type OrderItemsMutationResult = {
  items: OrderLineItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  itemCount: number;
};

/** Drop runtime-only / undefined fields so the array is safe to persist. */
function toStoredLineItem(item: OrderLineItem): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    productId: item.productId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    image: sanitizeStoredImageUrl(item.image),
  };
  if (item.size) stored.size = item.size;
  if (item.colorId) stored.colorId = item.colorId;
  if (item.colorName) stored.colorName = item.colorName;
  if (item.itemSizes) stored.itemSizes = item.itemSizes;
  return stored;
}

/** Firestore rejects `undefined`; rebuild each variant with only the keys it actually has. */
function cleanVariantForWrite(variant: ProductColorVariant): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: variant.id,
    name: variant.name,
    images: variant.images,
    sizeStock: variant.sizeStock,
  };
  if (variant.nameAr) out.nameAr = variant.nameAr;
  if (variant.hex) out.hex = variant.hex;
  return out;
}

async function persistOrderItems(
  order: OrderRecord,
  items: OrderLineItem[]
): Promise<OrderItemsMutationResult> {
  const normalized = items.map((item) => ({ ...item, lineTotal: item.price * item.quantity }));
  const subtotal = normalized.reduce((sum, item) => sum + item.lineTotal, 0);
  const itemCount = normalized.reduce((sum, item) => sum + item.quantity, 0);
  const total = subtotal + order.shippingCost;

  await updateDoc(doc(db, 'orders', order.id), {
    items: normalized.map(toStoredLineItem),
    subtotal,
    total,
    itemCount,
    updatedAt: serverTimestamp(),
  });

  return { items: normalized, subtotal, shippingCost: order.shippingCost, total, itemCount };
}

/**
 * Apply a signed stock change for one product selection. `consume > 0` reduces stock
 * (item added/increased), `consume < 0` restores it (item removed/decreased). Throws
 * `OrderError('OUT_OF_STOCK')` only when consuming more than is available.
 */
async function applyOrderStockChange(
  productId: string,
  colorId: string | null | undefined,
  size: string | null | undefined,
  consume: number
): Promise<void> {
  if (!productId || isCoordinateCartId(productId) || !consume) return;

  const ref = doc(db, PRODUCTS_COLLECTION, productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() ?? {};

  const variants = parseColorVariants(data.colorVariants);
  if (variants.length > 0) {
    const id = colorId && variants.some((v) => v.id === colorId) ? colorId : defaultVariantId({ colorVariants: variants });
    const idx = variants.findIndex((v) => v.id === id);
    if (idx < 0) return;
    const variant = variants[idx]!;
    const sizeStock = { ...variant.sizeStock };
    const key = size ?? Object.keys(sizeStock)[0];
    if (!key) return;
    const current = Math.max(0, sizeStock[key] ?? 0);
    if (consume > 0 && current < consume) {
      throw new OrderError('OUT_OF_STOCK', 'Not enough stock for this product.');
    }
    sizeStock[key] = Math.max(0, current - consume);
    const next = [...variants];
    next[idx] = { ...variant, sizeStock };
    const agg = aggregateSizeStockFromVariants(next);
    await updateDoc(ref, {
      colorVariants: next.map(cleanVariantForWrite),
      sizeStock: agg,
      stock: totalFromSizeStock(agg),
    });
    return;
  }

  const { sizeStock, stock } = resolveProductInventory(data);
  const sizeKeys = Object.keys(sizeStock);
  if (sizeKeys.length > 0) {
    const key = size ?? sizeKeys[0]!;
    const current = Math.max(0, sizeStock[key] ?? 0);
    if (consume > 0 && current < consume) {
      throw new OrderError('OUT_OF_STOCK', 'Not enough stock for this product.');
    }
    const nextStock = { ...sizeStock, [key]: Math.max(0, current - consume) };
    await updateDoc(ref, { sizeStock: nextStock, stock: totalFromSizeStock(nextStock) });
    return;
  }

  if (consume > 0 && stock < consume) {
    throw new OrderError('OUT_OF_STOCK', 'Not enough stock for this product.');
  }
  await updateDoc(ref, { stock: Math.max(0, stock - consume) });
}

type StockSelection = { productId: string; colorId: string | null; size: string | null };

/** Stock key grouping identical product + color + size selections (unit-separator delimited). */
function lineStockKey(item: StockSelection): string {
  return [item.productId, item.colorId ?? '', item.size ?? ''].join('|~|');
}

function quantitiesByStockKey(
  items: OrderLineItem[],
  meta: Map<string, StockSelection>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (isCoordinateCartId(item.productId)) continue;
    const selection: StockSelection = {
      productId: item.productId,
      colorId: item.colorId ?? null,
      size: item.size ?? null,
    };
    const key = lineStockKey(selection);
    map.set(key, (map.get(key) ?? 0) + item.quantity);
    if (!meta.has(key)) meta.set(key, selection);
  }
  return map;
}

/**
 * Commit an admin's edited line items in one shot: validate any stock increases,
 * persist the new items + recomputed totals, then apply the net inventory delta for
 * every changed product/color/size. Building of new line items happens in the UI
 * (from the live product doc); this is the authoritative save + stock reconciliation.
 */
export async function saveOrderItems(
  order: OrderRecord,
  nextItems: OrderLineItem[]
): Promise<OrderItemsMutationResult> {
  const meta = new Map<string, StockSelection>();
  const before = quantitiesByStockKey(order.items, meta);
  const after = quantitiesByStockKey(nextItems, meta);

  type Delta = StockSelection & { consume: number };
  const deltas: Delta[] = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const consume = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    if (consume === 0) continue;
    deltas.push({ ...meta.get(key)!, consume });
  }

  // Validate every increase against live stock before writing anything.
  for (const delta of deltas) {
    if (delta.consume <= 0) continue;
    const snap = await getDoc(doc(db, PRODUCTS_COLLECTION, delta.productId));
    if (!snap.exists()) {
      throw new OrderError('PRODUCT_MISSING', 'A product in this order is no longer available.');
    }
    const selection = resolveVariantSelection(snap.data() ?? {}, delta.colorId);
    const available = stockForSelection(selection.sizeStock, selection.stock, delta.size);
    if (available < delta.consume) {
      const name = String(snap.data()?.name ?? 'product');
      throw new OrderError('OUT_OF_STOCK', `Only ${available} left in stock for "${name}".`);
    }
  }

  const result = await persistOrderItems(order, nextItems);

  for (const delta of deltas) {
    try {
      await applyOrderStockChange(delta.productId, delta.colorId, delta.size, delta.consume);
    } catch (error) {
      console.warn(`Order ${order.id} saved; stock adjust failed for ${delta.productId}:`, error);
    }
  }

  return result;
}

export async function updateOrderCustomerDetails(
  orderId: string,
  details: OrderCustomerDetailsUpdate
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (details.customerName !== undefined) {
    payload.customerName = details.customerName?.trim() || null;
  }
  if (details.customerPhone !== undefined) {
    payload.customerPhone = details.customerPhone?.trim() || null;
  }
  if (details.customerEmail !== undefined) {
    payload.email = details.customerEmail?.trim() || null;
  }
  if (details.deliveryAddress !== undefined) {
    payload.deliveryAddress = details.deliveryAddress?.trim() || null;
  }

  await updateDoc(doc(db, 'orders', orderId), payload);
}
