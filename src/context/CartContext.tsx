import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  stock: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: any, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
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

function readCartFromStorage(key: string): CartItem[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const ownerId = user?.uid ?? 'guest';

  // Drop the old shared cart key so it cannot attach to the wrong account.
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

  // Re-bind cart whenever auth finishes loading or the signed-in user changes.
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

  const addToCart = (product: any, quantity: number) => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      const next = existingItem
        ? prevCart.map((item) =>
            item.id === product.id
              ? { ...item, quantity: Math.min(item.stock, item.quantity + quantity) }
              : item
          )
        : [
            ...prevCart,
            {
              id: product.id,
              name: product.name,
              price: product.price,
              quantity,
              image: product.images?.[0] || '',
              stock: product.stock,
            },
          ];
      persistCart(next, activeOwner);
      return next;
    });
  };

  const removeFromCart = (productId: string) => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;

    setCart((prevCart) => {
      const next = prevCart.filter((item) => item.id !== productId);
      persistCart(next, activeOwner);
      return next;
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (!cartReady || authLoading) return;
    const activeOwner = ownerIdRef.current;

    setCart((prevCart) => {
      const next = prevCart.map((item) =>
        item.id === productId
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
