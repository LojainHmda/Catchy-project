import { FirebaseError } from 'firebase/app';

export type OrderErrorCode =
  | 'EMPTY_CART'
  | 'NOT_SIGNED_IN'
  | 'OUT_OF_STOCK'
  | 'PRODUCT_MISSING'
  | 'DELIVERY_INVALID'
  | 'UNKNOWN';

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly productName?: string;

  constructor(code: OrderErrorCode, message: string, productName?: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.productName = productName;
  }
}

/** Firestore transactions may not preserve OrderError; use FirebaseError codes instead. */
export function checkoutFailure(
  code: OrderErrorCode,
  message: string,
  productName?: string
): FirebaseError {
  const err = new FirebaseError(code, message);
  (err as FirebaseError & { productName?: string }).productName = productName;
  return err;
}

export function checkoutErrorCode(error: unknown): string {
  if (error instanceof OrderError) return error.code;
  if (error instanceof FirebaseError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) return String((error as { code: string }).code);
  return '';
}

export function checkoutProductName(error: unknown): string | undefined {
  if (error instanceof OrderError) return error.productName;
  if (error && typeof error === 'object' && 'productName' in error) {
    return (error as { productName?: string }).productName;
  }
  return undefined;
}

export function isOrderError(error: unknown): error is OrderError {
  if (error instanceof OrderError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: string };
  const code = String(candidate.code ?? '');
  return candidate.name === 'OrderError' || (ORDER_ERROR_CODES as Set<string>).has(code);
}

const ORDER_ERROR_CODES = new Set<OrderErrorCode>([
  'EMPTY_CART',
  'NOT_SIGNED_IN',
  'OUT_OF_STOCK',
  'PRODUCT_MISSING',
  'DELIVERY_INVALID',
  'UNKNOWN',
]);
