import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db, doc, getDoc } from '../firebase';
import { useCart } from '../context/CartContext';
import { ShoppingCart, Heart, Share2, ArrowLeft, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

const ProductDetail = () => {
  const { id } = useParams();
  const { addToCart } = useCart();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProduct({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
    setIsAdding(true);
    addToCart(product, quantity);
    setTimeout(() => setIsAdding(false), 1000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#4CAF50]"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h2 className="text-3xl font-black text-gray-900 mb-4">Product not found</h2>
        <Link to="/catalog" className="text-[#4CAF50] font-bold flex items-center gap-2">
          <ArrowLeft size={20} /> Back to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pt-32 md:pt-48 pb-12 md:pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/catalog" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold mb-10 transition-all">
          <ArrowLeft size={20} /> Back to Catalog
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Image Gallery */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-[3/4] bg-gray-100 overflow-hidden"
            >
              <img
                src={product.images?.[selectedImage] || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=1000'}
                alt={product.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="absolute top-4 left-4 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-900">New</span>
            </motion.div>
            <div className="grid grid-cols-4 gap-4">
              {product.images?.map((img: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={cn(
                    "aspect-square rounded-2xl overflow-hidden border-2 transition-all",
                    selectedImage === i ? "border-[#4CAF50] scale-105 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            <div className="mb-10">
              <p className="text-sm text-[#4CAF50] font-black uppercase tracking-[0.2em] mb-4">{product.category}</p>
              <h1 className="text-5xl font-black text-gray-900 mb-6 tracking-tight leading-tight">{product.name}</h1>
              <div className="flex items-center gap-6 mb-8">
                <p className="text-4xl font-black text-gray-900">£{product.price}</p>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider",
                  product.stock > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
                </div>
              </div>
              <p className="text-gray-500 text-xl font-light leading-relaxed mb-10">
                {product.description || "Indulge in the epitome of elegance with our latest collection. This piece is designed to make you feel confident and sophisticated, no matter the occasion."}
              </p>
            </div>

            <div className="space-y-8 mb-12">
              <div className="flex items-center gap-6">
                <div className="flex items-center bg-gray-50 rounded-2xl p-1 border border-gray-100">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-gray-900 font-black text-xl"
                  >
                    -
                  </button>
                  <span className="w-12 text-center font-black text-gray-900">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-gray-900 font-black text-xl"
                  >
                    +
                  </button>
                </div>
                <p className="text-sm text-gray-400 font-bold">{product.stock} items available</p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock === 0 || isAdding}
                  className="flex-1 bg-[#4ba673] text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-[#4ba673]/20 hover:bg-[#3d8a5f] transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShoppingCart size={24} />
                  {isAdding ? 'Added to Bag!' : 'Add to Shopping Bag'}
                </button>
                <button className="p-5 bg-gray-50 text-gray-400 hover:text-red-500 rounded-2xl transition-all border border-gray-100">
                  <Heart size={24} />
                </button>
                <button className="p-5 bg-gray-50 text-gray-400 hover:text-blue-500 rounded-2xl transition-all border border-gray-100">
                  <Share2 size={24} />
                </button>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <ShieldCheck size={20} />
                </div>
                <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Secure Checkout</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <Truck size={20} />
                </div>
                <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Free Shipping</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                  <RotateCcw size={20} />
                </div>
                <p className="text-xs font-black text-gray-900 uppercase tracking-widest">30-Day Returns</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
