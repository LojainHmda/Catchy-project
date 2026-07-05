const GUEST_USER_ID = 'guest';

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

function normalizePhone(raw) {
  return String(raw ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function validateDelivery(delivery) {
  const customerName = String(delivery?.customerName ?? '').trim();
  if (customerName.length < 2) {
    return { ok: false, code: 'DELIVERY_INVALID', message: 'Please enter your full name.' };
  }

  const customerPhone = normalizePhone(delivery?.customerPhone);
  const digits = customerPhone.replace(/\D/g, '');
  if (digits.length !== 10) {
    return { ok: false, code: 'DELIVERY_INVALID', message: 'Please enter a 10-digit phone number.' };
  }

  const deliveryAddress = String(delivery?.deliveryAddress ?? '').trim();
  if (deliveryAddress.length < 8) {
    return { ok: false, code: 'DELIVERY_INVALID', message: 'Please enter your full delivery address.' };
  }

  const deliveryZone = String(delivery?.deliveryZone ?? '').trim();
  const validZones = ['west_bank', 'jerusalem', 'abu_ghosh', 'inside_israel'];
  if (!validZones.includes(deliveryZone)) {
    return { ok: false, code: 'DELIVERY_INVALID', message: 'Please select a delivery area.' };
  }

  const email = String(delivery?.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: 'DELIVERY_INVALID', message: 'Please enter a valid email address.' };
  }

  return {
    ok: true,
    details: {
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryZone,
      email: email || null,
    },
  };
}

function normalizeCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((item) => ({
      id: String(item?.id ?? '').trim(),
      name: String(item?.name ?? 'Item').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      size: typeof item?.size === 'string' && item.size.trim() ? item.size.trim() : null,
      colorId: typeof item?.colorId === 'string' && item.colorId.trim() ? item.colorId.trim() : null,
      colorName: typeof item?.colorName === 'string' && item.colorName.trim() ? item.colorName.trim() : null,
      image: typeof item?.image === 'string' ? item.image.trim() : '',
    }))
    .filter((item) => item.id.length > 0);
}

/**
 * Guest checkout via Firestore Admin SDK (atomic inventory + order write).
 */
export async function processGuestCheckout(db, { items, delivery }) {
  const cartItems = normalizeCartItems(items);
  if (!cartItems.length) {
    return { ok: false, code: 'EMPTY_CART', message: 'Your bag is empty.' };
  }

  const deliveryCheck = validateDelivery(delivery);
  if (!deliveryCheck.ok) return deliveryCheck;

  const uniqueProductIds = [...new Set(cartItems.map((item) => item.id))];

  try {
    const result = await db.runTransaction(async (tx) => {
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
            const next = decrementInventory(
              working.sizeStock,
              working.stock,
              cartItem.size,
              cartItem.quantity
            );
            workingByProduct.set(cartItem.id, {
              ...working,
              sizeStock: next.sizeStock,
              stock: next.stock,
            });
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
          sanitizeStoredImageUrl(cartItem.image) ||
          sanitizeStoredImageUrl(firstProductImageUrl(data));

        return {
          productId: cartItem.id,
          name: lineName,
          price,
          quantity: cartItem.quantity,
          image,
          size: cartItem.size,
          colorId: cartItem.colorId,
          colorName: cartItem.colorName,
        };
      });

      const subtotal = lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
      const shippingCosts = {
        west_bank: 20,
        jerusalem: 30,
        abu_ghosh: 50,
        inside_israel: 70,
      };
      const shippingCost = shippingCosts[deliveryCheck.details.deliveryZone] ?? 0;
      const total = subtotal + shippingCost;

      for (const productId of uniqueProductIds) {
        const working = workingByProduct.get(productId);
        const ref = db.collection('products').doc(productId);
        const payload = { stock: working.stock };
        if (working.sized) payload.sizeStock = working.sizeStock;
        if (working.hasVariants && working.colorVariants?.length) {
          payload.colorVariants = working.colorVariants;
        }
        tx.update(ref, payload);
      }

      const orderRef = db.collection('orders').doc();
      tx.set(orderRef, {
        userId: GUEST_USER_ID,
        isGuest: true,
        email: deliveryCheck.details.email,
        customerName: deliveryCheck.details.customerName,
        customerPhone: deliveryCheck.details.customerPhone,
        deliveryAddress: deliveryCheck.details.deliveryAddress,
        deliveryZone: deliveryCheck.details.deliveryZone,
        status: 'pending',
        subtotal,
        shippingCost,
        total,
        itemCount,
        items: lineItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { orderId: orderRef.id, total, itemCount };
    });

    return { ok: true, ...result };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'PRODUCT_MISSING') {
      return {
        ok: false,
        code: 'PRODUCT_MISSING',
        message: 'A product in your bag is no longer available.',
        productName: error.productName,
      };
    }
    if (code === 'OUT_OF_STOCK' || code === 'SIZE_REQUIRED' || code === 'COLOR_REQUIRED') {
      return {
        ok: false,
        code: 'OUT_OF_STOCK',
        message: 'Not enough stock for one of the items in your bag.',
        productName: error.productName,
      };
    }
    console.error('[checkout] guest transaction failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not place your order. Please try again.' };
  }
}
