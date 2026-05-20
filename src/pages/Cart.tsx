import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

/** /cart opens the bag drawer and returns to browsing (no full-page cart). */
const Cart = () => {
  const { openCart } = useCart();

  useEffect(() => {
    openCart();
  }, [openCart]);

  return <Navigate to="/catalog" replace />;
};

export default Cart;
