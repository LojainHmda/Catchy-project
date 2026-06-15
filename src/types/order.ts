export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const GUEST_USER_ID = 'guest';

export type CartLineItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  stock: number;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  /** Per-product size picks for coordinate sets (productId → size). */
  itemSizes?: Record<string, string>;
  lineKey: string;
};

export type OrderLineItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  lineTotal: number;
  size?: string | null;
  colorId?: string | null;
  colorName?: string | null;
  itemSizes?: Record<string, string>;
};

export type DeliveryDetails = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryZone: string;
  email?: string | null;
};

export type OrderCustomer = {
  uid: string;
  email: string | null;
  displayName: string | null;
  delivery?: DeliveryDetails;
};

export type OrderRecord = {
  id: string;
  userId: string;
  isGuest: boolean;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryZone: string | null;
  status: OrderStatus;
  subtotal: number;
  shippingCost: number;
  total: number;
  itemCount: number;
  createdAt: Date | null;
  items: OrderLineItem[];
};

export type PlaceOrderResult = {
  orderId: string;
  total: number;
  itemCount: number;
};
