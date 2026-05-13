import React, { useEffect, useState } from 'react';
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from '../firebase';
import { Plus, Search, Edit2, Trash2, X, Upload, Package, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';
import { seedDressPants } from '../lib/seed';

const AdminProducts = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    images: [] as string[]
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      if (file.size > 100 * 1024) { // 100KB limit
          alert('Image too large. Please select an image smaller than 100KB.');
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, reader.result as string].slice(0, 4)
        }));
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const productData = {
      ...formData,
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock),
      updatedAt: serverTimestamp(),
      createdAt: editingProduct ? editingProduct.createdAt : serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), productData);
      } else {
        await addDoc(collection(db, 'products'), productData);
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', stock: '', category: '', images: [] });
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
      }
    }
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      stock: product.stock.toString(),
      category: product.category,
      images: product.images || []
    });
    setIsModalOpen(true);
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-10 pt-32 md:pt-40 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Product Management</h1>
          <p className="text-gray-500 font-medium">Add, edit, and manage your fashion items and stock levels.</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setFormData({ name: '', description: '', price: '', stock: '', category: '', images: [] });
            setIsModalOpen(true);
          }}
          className="bg-[#4CAF50] text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-[#4CAF50]/20 hover:bg-[#45a049] transition-all transform hover:scale-105"
        >
          <Plus size={24} />
          Add New Product
        </button>
        <button
          onClick={async () => {
             await seedDressPants();
             fetchProducts();
          }}
          className="bg-blue-500 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-all transform hover:scale-105"
        >
          Seed Mock Data
        </button>
      </header>

      {/* Search & Filter */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium"
          />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 text-gray-400 text-xs font-black uppercase tracking-widest">
                <th className="px-8 py-5">Product</th>
                <th className="px-8 py-5">Category</th>
                <th className="px-8 py-5">Price</th>
                <th className="px-8 py-5">Stock</th>
                <th className="px-8 py-5">Actions</th>
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
              ) : filteredProducts.length > 0 ? filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-100">
                        <img
                          src={product.images?.[0] || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200'}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div>
                        <h4 className="font-black text-gray-900">{product.name}</h4>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">ID: {product.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      {CATEGORY_ICONS[product.category] && React.createElement(CATEGORY_ICONS[product.category], { size: 14, className: "text-gray-400" })}
                      <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-wider">
                        {t(CATEGORY_KEYS[product.category] || product.category)}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 font-black text-gray-900">£{product.price}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        product.stock > 10 ? "bg-emerald-500" : product.stock > 0 ? "bg-orange-500" : "bg-red-500"
                      )} />
                      <span className={cn(
                        "font-black",
                        product.stock > 10 ? "text-emerald-600" : product.stock > 0 ? "text-orange-600" : "text-red-600"
                      )}>
                        {product.stock} in stock
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2.5 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-300">
                      <Package size={40} />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">No products found</h3>
                    <p className="text-gray-500 font-medium">Start by adding your first fashion item to the catalog.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-10">
                <div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                  </h2>
                  <p className="text-gray-500 font-medium">Fill in the details below to update your catalog.</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-10 overflow-y-auto space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">Product Name</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium"
                        placeholder="e.g. Silk Evening Dress"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">Category</label>
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium appearance-none"
                      >
                        <option value="">Select Category</option>
                        {Object.keys(CATEGORY_ICONS).filter(k => k !== 'All').map(cat => (
                          <option key={cat} value={cat}>
                            {cat} ({t(CATEGORY_KEYS[cat])})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">Price (£)</label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">Stock</label>
                        <input
                          required
                          type="number"
                          value={formData.stock}
                          onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                          className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">Description</label>
                      <textarea
                        rows={4}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#4CAF50] transition-all font-medium resize-none"
                        placeholder="Describe the product details, fabric, fit..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-black text-gray-900 uppercase tracking-widest mb-3">
                        Product Photos (Max 4)
                      </label>
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        {formData.images.map((img, i) => (
                          <div key={i} className="relative aspect-square w-12 h-12 rounded-lg overflow-hidden bg-gray-100 group border border-gray-100">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, images: formData.images.filter((_, idx) => idx !== i) })}
                              className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        {formData.images.length < 4 && (
                          <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-[#4CAF50] hover:text-[#4CAF50] transition-all cursor-pointer">
                            <Upload size={20} />
                            <span className="text-[10px] font-black uppercase mt-1">Upload</span>
                            <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-8 py-4 bg-gray-50 text-gray-500 rounded-2xl font-black hover:bg-gray-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] px-8 py-4 bg-[#4CAF50] text-white rounded-2xl font-black shadow-lg shadow-[#4CAF50]/20 hover:bg-[#45a049] transition-all disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminProducts;
