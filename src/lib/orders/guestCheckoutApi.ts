import type { CartLineItem, DeliveryDetails, PlaceOrderResult } from '../../types/order';
import { OrderError } from './orderErrors';

type GuestCheckoutPayload = {
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    size?: string | null;
  }>;
  delivery: DeliveryDetails;
};

type GuestCheckoutResponse =
  | { ok: true; orderId: string; total: number; itemCount: number }
  | { ok: false; code: string; message: string; productName?: string };

export async function placeGuestOrderFromCart(
  cartItems: CartLineItem[],
  delivery: DeliveryDetails
): Promise<PlaceOrderResult> {
  const payload: GuestCheckoutPayload = {
    items: cartItems.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      size: item.size ?? null,
    })),
    delivery,
  };

  const response = await fetch('/api/orders/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body: GuestCheckoutResponse;
  try {
    body = (await response.json()) as GuestCheckoutResponse;
  } catch {
    throw new OrderError('UNKNOWN', 'Could not place your order. Please try again.');
  }

  if (!response.ok || !body.ok) {
    const failure = body as Extract<GuestCheckoutResponse, { ok: false }>;
    throw new OrderError(
      (failure.code as
        | 'OUT_OF_STOCK'
        | 'PRODUCT_MISSING'
        | 'EMPTY_CART'
        | 'DELIVERY_INVALID'
        | 'UNKNOWN') || 'UNKNOWN',
      failure.message || 'Could not place your order.',
      failure.productName
    );
  }

  return {
    orderId: body.orderId,
    total: body.total,
    itemCount: body.itemCount,
  };
}
