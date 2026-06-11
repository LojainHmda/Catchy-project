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
};

export type DeliveryDetails = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
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
  status: OrderStatus;
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
