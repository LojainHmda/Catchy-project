// POS sale processing via Firestore Admin SDK (atomic inventory + order + session-totals write).
// Inventory helpers are copied from checkoutOrder.js (that file's own precedent: no src/ imports
// server-side) rather than shared, so the two checkout paths can evolve independently.

function sanitizeStoredImageUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (s.startsWith('data:')) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s.slice(0, 2048);
  return s.length <= 512 ? s : '';
}

function firstProductImageUrl(data) {
  const images = data.images;
  if (!Array.isArray(images)) return '';
  const first = images.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
  return typeof first === 'string' ? first : '';
}

function parseSizeStock(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map = {};
  Object.entries(raw).forEach(([key, value]) => {
    const size = String(key).trim();
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    if (size) map[size] = qty;
  });
  return map;
}

function totalFromSizeStock(sizeStock) {
  return Object.values(sizeStock).reduce((sum, n) => sum + Math.max(0, n), 0);
}

function parseColorVariants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!id || !name) return null;
      const images = Array.isArray(entry.images)
        ? entry.images.filter((u) => typeof u === 'string' && u.trim().length > 12)
        : [];
      return {
        id,
        name,
        nameAr: typeof entry.nameAr === 'string' ? entry.nameAr.trim() : undefined,
        hex: typeof entry.hex === 'string' ? entry.hex.trim() : undefined,
        images,
        sizeStock: parseSizeStock(entry.sizeStock),
      };
    })
    .filter(Boolean);
}

function aggregateFromVariants(variants) {
  const sizeStock = {};
  variants.forEach((variant) => {
    Object.entries(variant.sizeStock).forEach(([size, qty]) => {
      sizeStock[size] = (sizeStock[size] ?? 0) + Math.max(0, qty);
    });
  });
  const defaultVariant = variants[0];
  return {
    stock: totalFromSizeStock(sizeStock),
    sizeStock,
    colorVariants: variants,
    hasVariants: true,
    defaultVariant,
  };
}

function resolveProductInventory(data) {
  const colorVariants = parseColorVariants(data.colorVariants);
  if (colorVariants.length) {
    const agg = aggregateFromVariants(colorVariants);
    return {
      sizeStock: agg.sizeStock,
      stock: agg.stock,
      colorVariants: agg.colorVariants,
      hasVariants: true,
    };
  }

  const parsed = parseSizeStock(data.sizeStock);
  if (Object.keys(parsed).length > 0) {
    return { sizeStock: parsed, stock: totalFromSizeStock(parsed), colorVariants: [], hasVariants: false };
  }

  const legacySizes = Array.isArray(data.sizes)
    ? data.sizes.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const legacyStock = Math.max(0, Math.floor(Number(data.stock) || 0));

  if (legacySizes.length === 0) {
    return { sizeStock: {}, stock: legacyStock, colorVariants: [], hasVariants: false };
  }

  const sizeStock = {};
  legacySizes.forEach((size) => {
    sizeStock[size] = 0;
  });
  return { sizeStock, stock: legacyStock, colorVariants: [], hasVariants: false };
}

function decrementColorVariants(variants, colorId, size, quantity) {
  const idx = variants.findIndex((v) => v.id === colorId);
  if (idx < 0) throw new Error('COLOR_REQUIRED');
  const variant = variants[idx];
  const sizeStock = { ...variant.sizeStock };
  if (!size) throw new Error('SIZE_REQUIRED');
  const current = Math.max(0, sizeStock[size] ?? 0);
  if (current < quantity) throw new Error('OUT_OF_STOCK');
  sizeStock[size] = current - quantity;
  const next = [...variants];
  next[idx] = { ...variant, sizeStock };
  return next;
}

function reaggregateVariants(variants) {
  const sizeStock = {};
  variants.forEach((variant) => {
    Object.entries(variant.sizeStock).forEach(([size, qty]) => {
      sizeStock[size] = (sizeStock[size] ?? 0) + Math.max(0, qty);
    });
  });
  return { sizeStock, stock: totalFromSizeStock(sizeStock), colorVariants: variants };
}

function hasSizedInventory(sizeStock) {
  return Object.keys(sizeStock).length > 0;
}

function stockForSelection(sizeStock, totalStock, size) {
  if (hasSizedInventory(sizeStock)) {
    if (!size) return 0;
    return Math.max(0, sizeStock[size] ?? 0);
  }
  return totalStock;
}

function decrementInventory(sizeStock, totalStock, size, quantity) {
  if (hasSizedInventory(sizeStock)) {
    if (!size) throw new Error('SIZE_REQUIRED');
    const current = Math.max(0, sizeStock[size] ?? 0);
    if (current < quantity) throw new Error('OUT_OF_STOCK');
    const next = { ...sizeStock, [size]: current - quantity };
    return { sizeStock: next, stock: totalFromSizeStock(next) };
  }

  if (totalStock < quantity) throw new Error('OUT_OF_STOCK');
  return { sizeStock, stock: totalStock - quantity };
}

function normalizePosCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item) => ({
      id: String(item?.productId ?? item?.id ?? '').trim(),
      name: String(item?.name ?? 'Item').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      size: typeof item?.size === 'string' && item.size.trim() ? item.size.trim() : null,
      colorId: typeof item?.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
      colorName: typeof item?.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
      image: typeof item?.image === 'string' ? item.image.trim() : '',
    }))
    .filter((item) => item.id.length > 0);
}

/** Clamps a manual discount to the sale's subtotal — never negative, never more than 100% off. */
function resolveDiscount(discount, subtotal) {
  if (!discount) return null;
  const mode = discount.mode === 'amount' ? 'amount' : 'percent';
  const rawValue = Number(discount.value);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null;

  let amount;
  if (mode === 'percent') {
    const pct = Math.min(100, Math.max(0, rawValue));
    amount = subtotal * (pct / 100);
  } else {
    amount = Math.max(0, rawValue);
  }
  amount = Math.min(amount, subtotal);
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) return null;

  return {
    mode,
    value: rawValue,
    amount,
    reason: typeof discount.reason === 'string' && discount.reason.trim() ? discount.reason.trim() : null,
  };
}

/**
 * Record-only payment (Phase 1 has no card processor integration — a real terminal
 * handles the actual charge; this just logs what the cashier entered).
 * - cash: cashAmount is what the customer handed over; must cover the total; change is the excess.
 * - card: the terminal charges the exact total; no change.
 * - split: cardAmount is charged on the terminal (must not exceed total); cashAmount covers the rest,
 *   with anything extra given back as change.
 */
function resolvePayment(rawPayment, total) {
  const method = rawPayment?.method === 'card' ? 'card' : rawPayment?.method === 'split' ? 'split' : 'cash';
  const roundedTotal = Math.round(total * 100) / 100;

  if (method === 'card') {
    return { method, cashAmount: 0, cardAmount: roundedTotal, changeGiven: 0 };
  }

  if (method === 'cash') {
    const cashAmount = Math.max(0, Number(rawPayment?.cashAmount) || 0);
    if (cashAmount < roundedTotal - 0.005) throw new Error('PAYMENT_INSUFFICIENT');
    return { method, cashAmount, cardAmount: 0, changeGiven: Math.round((cashAmount - roundedTotal) * 100) / 100 };
  }

  const cardAmount = Math.max(0, Math.min(roundedTotal, Number(rawPayment?.cardAmount) || 0));
  const cashOwed = Math.round((roundedTotal - cardAmount) * 100) / 100;
  const cashAmount = Math.max(0, Number(rawPayment?.cashAmount) || 0);
  if (cashAmount < cashOwed - 0.005) throw new Error('PAYMENT_INSUFFICIENT');
  return { method, cashAmount, cardAmount, changeGiven: Math.round((cashAmount - cashOwed) * 100) / 100 };
}

/**
 * Completes a POS sale inside a single Firestore transaction: verifies the register
 * session is open and owned by this cashier, decrements the same product inventory
 * the website reads, writes a 'completed' order, and increments the session's
 * running totals — mirrors checkoutOrder.js's processGuestCheckout structure.
 */
export async function processPosSale(db, { cashierUid, cashierName, registerSessionId, items, discount, payment, customer }) {
  const cartItems = normalizePosCartItems(items);
  if (!cartItems.length) {
    return { ok: false, code: 'EMPTY_CART', message: 'Cart is empty.' };
  }
  if (!registerSessionId) {
    return { ok: false, code: 'NO_SESSION', message: 'No open register session.' };
  }

  const uniqueProductIds = [...new Set(cartItems.map((item) => item.id))];

  try {
    const result = await db.runTransaction(async (tx) => {
      const sessionRef = db.collection('register_sessions').doc(registerSessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new Error('SESSION_NOT_FOUND');
      const session = sessionSnap.data();
      if (session.status !== 'open') throw new Error('SESSION_CLOSED');
      if (session.cashierUid !== cashierUid) throw new Error('SESSION_FORBIDDEN');

      const productSnaps = new Map();
      for (const productId of uniqueProductIds) {
        const ref = db.collection('products').doc(productId);
        const snap = await tx.get(ref);
        productSnaps.set(productId, snap);
      }

      const workingByProduct = new Map();
      for (const productId of uniqueProductIds) {
        const snap = productSnaps.get(productId);
        if (!snap?.exists) {
          const missing = cartItems.find((item) => item.id === productId);
          const err = new Error('PRODUCT_MISSING');
          err.productName = missing?.name;
          throw err;
        }
        const data = snap.data() ?? {};
        const inventory = resolveProductInventory(data);
        workingByProduct.set(productId, {
          sizeStock: inventory.sizeStock,
          stock: inventory.stock,
          sized: hasSizedInventory(inventory.sizeStock),
          hasVariants: inventory.hasVariants,
          colorVariants: inventory.colorVariants,
        });
      }

      const lineItems = cartItems.map((cartItem) => {
        const snap = productSnaps.get(cartItem.id);
        const data = snap.data() ?? {};
        const price = Number(data.price) || 0;
        const working = workingByProduct.get(cartItem.id);

        if (working.hasVariants && !cartItem.colorId) {
          const err = new Error('OUT_OF_STOCK');
          err.productName = cartItem.name;
          throw err;
        }
        if (working.sized && !cartItem.size) {
          const err = new Error('OUT_OF_STOCK');
          err.productName = cartItem.name;
          throw err;
        }

        let available = stockForSelection(working.sizeStock, working.stock, cartItem.size);
        if (working.hasVariants && cartItem.colorId && working.colorVariants?.length) {
          const variant = working.colorVariants.find((v) => v.id === cartItem.colorId);
          available = variant
            ? stockForSelection(variant.sizeStock, totalFromSizeStock(variant.sizeStock), cartItem.size)
            : 0;
        }
        if (available < cartItem.quantity) {
          const err = new Error('OUT_OF_STOCK');
          err.productName = cartItem.name;
          throw err;
        }

        try {
          if (working.hasVariants && cartItem.colorId && working.colorVariants?.length) {
            const nextVariants = decrementColorVariants(
              working.colorVariants,
              cartItem.colorId,
              cartItem.size,
              cartItem.quantity
            );
            const agg = reaggregateVariants(nextVariants);
            workingByProduct.set(cartItem.id, {
              ...working,
              colorVariants: agg.colorVariants,
              sizeStock: agg.sizeStock,
              stock: agg.stock,
            });
          } else {
            const next = decrementInventory(working.sizeStock, working.stock, cartItem.size, cartItem.quantity);
            workingByProduct.set(cartItem.id, { ...working, sizeStock: next.sizeStock, stock: next.stock });
          }
        } catch {
          const err = new Error('OUT_OF_STOCK');
          err.productName = cartItem.name;
          throw err;
        }

        const colorPart = cartItem.colorName ? `${cartItem.colorName}` : '';
        const sizePart = cartItem.size ?? '';
        const variantPart = [colorPart, sizePart].filter(Boolean).join(' / ');
        const lineName = variantPart ? `${cartItem.name} (${variantPart})` : cartItem.name;
        const image =
          sanitizeStoredImageUrl(cartItem.image) || sanitizeStoredImageUrl(firstProductImageUrl(data));

        return {
          productId: cartItem.id,
          name: lineName,
          price,
          quantity: cartItem.quantity,
          image,
          lineTotal: price * cartItem.quantity,
          size: cartItem.size,
          colorId: cartItem.colorId,
          colorName: cartItem.colorName,
        };
      });

      const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);

      const resolvedDiscount = resolveDiscount(discount, subtotal);
      const total = Math.round((subtotal - (resolvedDiscount?.amount ?? 0)) * 100) / 100;
      const resolvedPayment = resolvePayment(payment, total);

      for (const productId of uniqueProductIds) {
        const working = workingByProduct.get(productId);
        const ref = db.collection('products').doc(productId);
        const payload = { stock: working.stock };
        if (working.sized) payload.sizeStock = working.sizeStock;
        if (working.hasVariants && working.colorVariants?.length) payload.colorVariants = working.colorVariants;
        tx.update(ref, payload);
      }

      const orderRef = db.collection('orders').doc();
      tx.set(orderRef, {
        userId: cashierUid,
        isGuest: false,
        source: 'pos',
        registerSessionId,
        cashierUid,
        cashierName: cashierName || null,
        email: customer?.email ?? null,
        customerName: customer?.name?.trim() || null,
        customerPhone: customer?.phone?.trim() || null,
        deliveryAddress: null,
        deliveryZone: null,
        status: 'completed',
        subtotal,
        shippingCost: 0,
        discount: resolvedDiscount,
        payment: resolvedPayment,
        total,
        itemCount,
        items: lineItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      tx.update(sessionRef, {
        salesCount: (Number(session.salesCount) || 0) + 1,
        cashTotal: Math.round(((Number(session.cashTotal) || 0) + resolvedPayment.cashAmount) * 100) / 100,
        cardTotal: Math.round(((Number(session.cardTotal) || 0) + resolvedPayment.cardAmount) * 100) / 100,
        discountTotal: Math.round(((Number(session.discountTotal) || 0) + (resolvedDiscount?.amount ?? 0)) * 100) / 100,
        grossTotal: Math.round(((Number(session.grossTotal) || 0) + total) * 100) / 100,
      });

      return { orderId: orderRef.id, total, itemCount, changeGiven: resolvedPayment.changeGiven };
    });

    return { ok: true, ...result };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'PRODUCT_MISSING') {
      return {
        ok: false,
        code: 'PRODUCT_MISSING',
        message: 'A product in the cart is no longer available.',
        productName: error.productName,
      };
    }
    if (code === 'OUT_OF_STOCK' || code === 'SIZE_REQUIRED' || code === 'COLOR_REQUIRED') {
      return {
        ok: false,
        code: 'OUT_OF_STOCK',
        message: 'Not enough stock for one of the items in the cart.',
        productName: error.productName,
      };
    }
    if (code === 'SESSION_NOT_FOUND' || code === 'SESSION_CLOSED' || code === 'SESSION_FORBIDDEN') {
      return {
        ok: false,
        code,
        message: 'Register session is not open. Reopen the register and try again.',
      };
    }
    if (code === 'PAYMENT_INSUFFICIENT') {
      return { ok: false, code: 'PAYMENT_INSUFFICIENT', message: 'Amount tendered is less than the total due.' };
    }
    console.error('[pos] sale transaction failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not complete the sale. Please try again.' };
  }
}
