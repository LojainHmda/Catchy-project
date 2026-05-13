import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Cart = () => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-10 text-gray-200">
            <ShoppingBag size={64} />
          </div>
          <h1 className="font-serif text-5xl text-gray-900 mb-6">Your bag is empty</h1>
          <p className="text-gray-500 text-lg mb-12 max-w-md mx-auto">
            Looks like you haven't added anything to your bag yet. Explore our latest collections and find something you'll love.
          </p>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-3 bg-catchy text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-catchy/20 hover:bg-catchy-dark transition-all"
          >
            Start Shopping <ArrowRight size={20} />
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-32 md:pt-48 pb-20 md:py-32">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <header className="mb-20 flex flex-col md:flex-row justify-between items-end gap-8">
          <div>
            <p className="uppercase tracking-[0.4em] text-[10px] mb-4 text-catchy opacity-60">Your Selection</p>
            <h1 className="font-serif text-6xl md:text-8xl text-gray-900 font-light italic">Shopping Bag</h1>
          </div>
          <p className="text-xl font-light text-gray-500 italic">
            {cartCount} {cartCount === 1 ? 'item' : 'items'} in your bag
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
          {/* Items List */}
          <div className="lg:col-span-8 space-y-12">
            <AnimatePresence mode="popLayout">
              {cart.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex flex-col sm:flex-row gap-8 pb-12 border-b border-gray-100 group"
                >
                  <Link to={`/product/${item.id}`} className="w-full sm:w-48 aspect-[3/4] rounded-3xl overflow-hidden bg-gray-50 flex-shrink-0 shadow-lg group-hover:shadow-xl transition-all">
                    <img
                      src={item.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=400'}
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  </Link>

                  <div className="flex-1 flex flex-col justify-between py-2">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <Link to={`/product/${item.id}`} className="hover:text-catchy transition-colors">
                          <h3 className="font-serif text-3xl text-gray-900 leading-tight">{item.name}</h3>
                        </Link>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                      <p className="text-2xl font-black text-gray-900 mb-8">£{item.price}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-900"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-12 text-center font-black text-gray-900">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-900"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <p className="text-xl font-black text-gray-900">£{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <Link to="/catalog" className="inline-flex items-center gap-3 text-gray-400 hover:text-catchy font-black uppercase tracking-widest text-[10px] transition-all">
              <ArrowLeft size={16} /> Continue Shopping
            </Link>
          </div>

          {/* Summary */}
          <div className="lg:col-span-4">
            <div className="bg-gray-50 rounded-[3rem] p-10 sticky top-32 border border-gray-100">
              <h2 className="font-serif text-4xl text-gray-900 mb-10">Order Summary</h2>
              
              <div className="space-y-6 mb-10">
                <div className="flex justify-between text-gray-500 uppercase tracking-widest text-[10px] font-black">
                  <span>Subtotal</span>
                  <span className="text-gray-900">£{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500 uppercase tracking-widest text-[10px] font-black">
                  <span>Shipping</span>
                  <span className="text-emerald-600">Free</span>
                </div>
                <div className="pt-6 border-t border-gray-200 flex justify-between items-end">
                  <span className="font-serif text-2xl text-gray-900">Total</span>
                  <span className="text-4xl font-black text-gray-900">£{cartTotal.toFixed(2)}</span>
                </div>
              </div>

              <button className="w-full bg-catchy text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-catchy/20 hover:bg-catchy-dark transition-all transform hover:scale-[1.02] active:scale-95">
                Proceed to Checkout
              </button>

              <div className="mt-10 space-y-4">
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">Secure Payments Guaranteed</p>
                <div className="flex justify-center gap-4 opacity-30 grayscale">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-4" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg" alt="PayPal" className="h-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
