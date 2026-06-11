import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { db, doc, getDoc } from '../firebase';
import { useAuth } from './AuthContext';
import {
  cartLineKey,
  hasSizedInventory,
  resolveProductInventory,
  stockForSelection,
} from '../lib/productInventory';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  stock: number;
  size?: string | null;
  lineKey: string;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: any, quantity: number, size?: string | null) => void;
  removeFromCart: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  refreshCartStock: () => Promise<CartItem[]>;
  cartTotal: number;
  cartCount: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function cartStorageKey(ownerId: string) {
  return `catchy_cart_${ownerId}`;
}

function normalizeCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? '');
  if (!id) return null;
  const size = typeof item.size === 'string' && item.size.trim() ? item.size : null;
  return {
    id,
    name: String(item.name ?? 'Item'),
    price: Number(item.price) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    image: typeof item.image === 'string' ? item.image : '',
    stock: Math.max(0, Number(item.stock) || 0),
    size,
    lineKey: typeof item.lineKey === 'string' ? item.lineKey : cartLineKey(id, size),
  };
}

function readCartFromStorage(key: string): CartItem[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCartItem).filter((item): item is CartItem => item !== null);
  } catch {
    return [];
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.uid ?? 'guest';

  useEffect(() => {
    localStorage.removeItem('catchy_cart');
  }, []);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((open) => !open), []);
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const ownerIdRef = useRef(ownerId);
  const prevOwnerIdRef = useRef<string | null>(null);

  const persistCart = useCallback((items: CartItem[], forOwnerId: string) => {
    localStorage.setItem(cartStorageKey(forOwnerId), JSON.stringify(items));
  }, []);

  useEffect(() => {
    if (authLoading) {
      setCart([]);
      setCartReady(false);
      prevOwnerIdRef.current = null;
      return;
    }

    const prevOwnerId = prevOwnerIdRef.current;
    if (prevOwnerId !== null && prevOwnerId !== ownerId) {
      persistCart(cartRef.current, prevOwnerId);
    }

    const loaded = readCartFromStorage(cartStorageKey(ownerId));
    setCart(loaded);
    ownerIdRef.current = ownerId;
    prevOwnerIdRef.current = ownerId;
    setCartReady(true);
  }, [authLoading, ownerId, persistCart]);

  const addToCart = (product: any, quantity: number, size?: string | null) => {
    if (!cartReady || authLoading || !product?.id) return;
    const activeOwner = ownerIdRef.current;

    const { sizeStock, stock: totalStock } = resolveProductInventory(product);
    const sized = hasSizedInventory(sizeStock);
    const selectedSize = size?.trim() || null;
    const available = stockForSelection(sizeStock, totalStock, selectedSize);
    const lineKey = cartLineKey(product.id, selectedSize);

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.lineKey === lineKey);
      const next = existingItem
        ? prevCart.map((item) =>
            item.lineKey === lineKey
              ? {
                  ...item,
                  stock: available,
                  quantity: Math.min(available, item.quantity + quantity),
                }
              : item
          )
        : [
            ...prevCart,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              quantity: Math.min(available, quantity),
              image: product.images?.[0] || '',
              stock: available,
              size: sized ? selectedSize : null,
              lineKey,
            },
          ];
      persistCart(next, activeOwner);
      return next;
    });
  };

  const removeFromCart = (lineKey: string) => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;

    setCart((prevCart) => {
      const next = prevCart.filter((item) => item.lineKey !== lineKey);
      persistCart(next, activeOwner);
      return next;
    });
  };

  const updateQuantity = (lineKey: string, quantity: number) => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;

    setCart((prevCart) => {
      const next = prevCart.map((item) =>
        item.lineKey === lineKey
          ? { ...item, quantity: Math.max(1, Math.min(item.stock, quantity)) }
          : item
      );
      persistCart(next, activeOwner);
      return next;
    });
  };

  const clearCart = () => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;
    setCart([]);
    persistCart([], activeOwner);
  };

  const refreshCartStock = useCallback(async (): Promise<CartItem[]> => {
    if (!cartReady || authLoading) return cartRef.current;
    const activeOwner = ownerIdRef.current;
    const current = cartRef.current;
    if (!current.length) return [];

    const synced = (
      await Promise.all(
        current.map(async (item) => {
          try {
            const snap = await getDoc(doc(db, 'products', item.id));
            if (!snap.exists()) return null;
            const { sizeStock, stock } = resolveProductInventory(snap.data() ?? {});
            const available = stockForSelection(sizeStock, stock, item.size);
            if (available <= 0) return null;
            return {
              ...item,
              stock: available,
              quantity: Math.min(item.quantity, available),
            };
          } catch {
            return item;
          }
        })
      )
    ).filter((item): item is CartItem => item !== null);

    setCart(synced);
    persistCart(synced, activeOwner);
    cartRef.current = synced;
    return synced;
  }, [authLoading, cartReady, persistCart]);

  const cartTotal = cartReady
    ? cart.reduce((total, item) => total + item.price * item.quantity, 0)
    : 0;
  const cartCount = cartReady ? cart.reduce((count, item) => count + item.quantity, 0) : 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        refreshCartStock,
        cartTotal,
        cartCount,
        isCartOpen,
        openCart,
        closeCart,
        toggleCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
