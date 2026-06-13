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
import type { CartLineItem, OrderCustomer, OrderRecord, PlaceOrderResult } from '../../types/order';
import {
  decrementInventory,
  hasSizedInventory,
  resolveProductInventory,
  stockForSelection,
  type SizeStock,
} from '../productInventory';
import { isCoordinateCartId, coordinateLookIdFromCart, validateCoordinateItemSizes, coordinateAvailableSets, formatCoordinateItemSizes } from '../coordinateCart';
import { resolveCoordinate } from '../coordinateResolve';
import { getShippingCost } from '../shippingZones';
import { OrderError } from './orderErrors';
import { firstProductImageUrl, parseOrderDocument, sanitizeStoredImageUrl } from './orderUtils';
import { primaryCoordinateImage } from '../coordinateImages';

const PRODUCTS_COLLECTION = 'products';
const COORDINATE_LOOKS_COLLECTION = 'coordinate_looks';

type DocSnap = Awaited<ReturnType<typeof getDoc>>;
type WorkingInventory = { sizeStock: SizeStock; stock: number; sized: boolean };

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
  updates: { productId: string; stock: number; sizeStock?: SizeStock; sized: boolean }[]
): Promise<void> {
  for (const update of updates) {
    const payload: Record<string, unknown> = { stock: update.stock };
    if (update.sized && update.sizeStock) {
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
    const { sizeStock, stock } = resolveProductInventory(snap.data() ?? {});
    workingByProductId.set(productId, {
      sizeStock: { ...sizeStock },
      stock,
      sized: hasSizedInventory(sizeStock),
    });
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

    if (working.sized && !cartItem.size) {
      throw new OrderError('OUT_OF_STOCK', `Select a size for "${cartItem.name}".`, cartItem.name);
    }

    const available = stockForSelection(working.sizeStock, working.stock, cartItem.size);
    if (available < cartItem.quantity) {
      const sizeLabel = cartItem.size ? ` (${cartItem.size})` : '';
      throw new OrderError(
        'OUT_OF_STOCK',
        `Only ${available} left in stock for "${cartItem.name}"${sizeLabel}.`,
        cartItem.name
      );
    }

    try {
      const next = decrementInventory(working.sizeStock, working.stock, cartItem.size, cartItem.quantity);
      workingByProductId.set(cartItem.id, { ...next, sized: working.sized });
      bumpRemoved(cartItem.id, cartItem.quantity);
    } catch {
      throw new OrderError('OUT_OF_STOCK', `Not enough stock for "${cartItem.name}".`, cartItem.name);
    }

    const lineName = cartItem.size ? `${cartItem.name} (${cartItem.size})` : cartItem.name;
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
      ...(working.sized ? { sizeStock: working.sizeStock, sized: true } : { sized: false }),
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
