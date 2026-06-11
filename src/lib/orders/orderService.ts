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
import { OrderError } from './orderErrors';
import { firstProductImageUrl, parseOrderDocument, sanitizeStoredImageUrl } from './orderUtils';

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

type InventoryUpdate = {
  productId: string;
  stock: number;
  sizeStock?: SizeStock;
  sized: boolean;
};

async function applyInventoryUpdates(updates: InventoryUpdate[]): Promise<void> {
  for (const update of updates) {
    const payload: Record<string, unknown> = { stock: update.stock };
    if (update.sized && update.sizeStock) {
      payload.sizeStock = update.sizeStock;
    }
    await updateDoc(doc(db, 'products', update.productId), payload);
  }
}

function buildCheckoutPayload(
  cartItems: CartLineItem[],
  productSnaps: Map<string, Awaited<ReturnType<typeof getDoc>>>
) {
  const uniqueProductIds = [...new Set(cartItems.map((item) => item.id))];

  type WorkingInventory = { sizeStock: SizeStock; stock: number; sized: boolean };
  const workingByProduct = new Map<string, WorkingInventory>();

  for (const productId of uniqueProductIds) {
    const snap = productSnaps.get(productId);
    if (!snap?.exists()) {
      const missing = cartItems.find((item) => item.id === productId);
      throw new OrderError(
        'PRODUCT_MISSING',
        'A product in your bag is no longer available.',
        missing?.name
      );
    }

    const data = snap.data() ?? {};
    const { sizeStock, stock } = resolveProductInventory(data);
    workingByProduct.set(productId, {
      sizeStock,
      stock,
      sized: hasSizedInventory(sizeStock),
    });
  }

  const lineItems = cartItems.map((cartItem) => {
    const snap = productSnaps.get(cartItem.id);
    const data = (snap?.data() ?? {}) as Record<string, unknown>;
    const price = Number(data.price ?? cartItem.price);
    const working = workingByProduct.get(cartItem.id)!;

    if (working.sized && !cartItem.size) {
      throw new OrderError(
        'OUT_OF_STOCK',
        `Select a size for "${cartItem.name}".`,
        cartItem.name
      );
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
      workingByProduct.set(cartItem.id, {
        sizeStock: next.sizeStock,
        stock: next.stock,
        sized: working.sized,
      });
    } catch {
      throw new OrderError(
        'OUT_OF_STOCK',
        `Not enough stock for "${cartItem.name}".`,
        cartItem.name
      );
    }

    const lineName = cartItem.size ? `${cartItem.name} (${cartItem.size})` : cartItem.name;

    const image =
      sanitizeStoredImageUrl(cartItem.image) ||
      sanitizeStoredImageUrl(firstProductImageUrl(data));

    return {
      productId: cartItem.id,
      name: lineName,
      price,
      quantity: cartItem.quantity,
      image,
      size: cartItem.size ?? null,
    };
  });

  const inventoryUpdates: InventoryUpdate[] = uniqueProductIds.map((productId) => {
    const working = workingByProduct.get(productId)!;
    const snap = productSnaps.get(productId)!;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const qtyRemoved = cartItems
      .filter((item) => item.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);

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

  const uniqueProductIds = [...new Set(cartItems.map((item) => item.id))];
  const productSnaps = new Map(
    await Promise.all(
      uniqueProductIds.map(async (id) => {
        const snap = await getDoc(doc(db, 'products', id));
        return [id, snap] as const;
      })
    )
  );

  const { lineItems, inventoryUpdates, total, itemCount } = buildCheckoutPayload(
    cartItems,
    productSnaps
  );

  const delivery = customer.delivery;
  const orderDoc = await addDoc(collection(db, 'orders'), {
    userId: customer.uid,
    isGuest: false,
    email: delivery?.email ?? customer.email,
    customerName: delivery?.customerName ?? customer.displayName,
    customerPhone: delivery?.customerPhone ?? null,
    deliveryAddress: delivery?.deliveryAddress ?? null,
    status: 'pending',
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
