import React, { useEffect, useState } from 'react';
import { db, collection, getDocs, updateDoc, doc, query, orderBy } from '../firebase';
import { Search, Package, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

const AdminStock = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stockUpdates, setStockUpdates] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const q = query(collection(db, 'products'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setProducts(productsData);
      
      const initialUpdates: { [key: string]: number } = {};
      productsData.forEach(p => {
        initialUpdates[p.id] = p.stock || 0;
      });
      setStockUpdates(initialUpdates);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockChange = (id: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setStockUpdates(prev => ({ ...prev, [id]: numValue }));
  };

  const saveStock = async (id: string) => {
    setSavingId(id);
    try {
      await updateDoc(doc(db, 'products', id), {
        stock: stockUpdates[id]
      });
      // Update local state
      setProducts(prev => prev.map(p => p.id === id ? { ...p, stock: stockUpdates[id] } : p));
    } catch (error) {
      console.error('Error updating stock:', error);
    } finally {
      setSavingId(null);
    }
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Stock Management</h1>
        <p className="text-gray-500 font-medium">Quickly update inventory levels for all products.</p>
      </header>

      {/* Search */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4ba673] transition-all font-medium"
          />
        </div>
      </div>

      {/* Stock List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 text-gray-400 text-xs font-black uppercase tracking-widest">
                <th className="px-8 py-5">Product</th>
                <th className="px-8 py-5">Current Stock</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Update Inventory</th>
                <th className="px-8 py-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-10">
                      <div className="h-12 bg-gray-50 rounded-2xl w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredProducts.length > 0 ? filteredProducts.map((product) => {
                const currentVal = stockUpdates[product.id];
                const hasChanged = currentVal !== product.stock;
                
                return (
                  <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                          <img
                            src={product.images?.[0] || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200'}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="font-black text-gray-900 text-sm">{product.name}</h4>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{product.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={cn(
                        "font-black text-lg",
                        product.stock > 10 ? "text-emerald-600" : product.stock > 0 ? "text-orange-600" : "text-red-600"
                      )}>
                        {product.stock}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      {product.stock === 0 ? (
                        <div className="flex items-center gap-2 text-red-500 text-xs font-black uppercase tracking-widest">
                          <AlertTriangle size={14} /> Out of Stock
                        </div>
                      ) : product.stock <= 10 ? (
                        <div className="flex items-center gap-2 text-orange-500 text-xs font-black uppercase tracking-widest">
                          <AlertTriangle size={14} /> Low Stock
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase tracking-widest">
                          <CheckCircle2 size={14} /> Healthy
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <input
                        type="number"
                        value={currentVal}
                        onChange={(e) => handleStockChange(product.id, e.target.value)}
                        className="w-24 px-4 py-2 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#4ba673] transition-all font-black text-center"
                      />
                    </td>
                    <td className="px-8 py-6">
                      <button
                        onClick={() => saveStock(product.id)}
                        disabled={!hasChanged || savingId === product.id}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                          hasChanged 
                            ? "bg-[#4ba673] text-white shadow-lg shadow-[#4ba673]/20 hover:bg-[#3d8a5f]" 
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        )}
                      >
                        <Save size={14} />
                        {savingId === product.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                      <Package size={40} />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">No products found</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminStock;
