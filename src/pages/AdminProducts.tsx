import React, { useEffect, useState } from 'react';
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from '../firebase';
import { Plus, Search, Edit2, Trash2, X, Upload, Package, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';
import { seedDressPants } from '../lib/seed';
import { fileToAdminImageDataUrl } from '../lib/images';
import { coerceProductImages } from '../lib/productImages';

const MAX_PRODUCT_IMAGES = 6;
const MAX_FILE_BEFORE_COMPRESS = 15 * 1024 * 1024; // 15MB — compressed before save

const AdminProducts = () => {
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
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
      setListLoading(true);
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort(
        (a: any, b: any) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setProducts(list);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setListLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const input = e.target;
    if (!files?.length) return;

    const picked = Array.from(files).filter(
      (f): f is File => f instanceof File && f.type.startsWith('image/')
    );
    if (picked.length === 0) {
      alert('Please choose image files (JPEG, PNG, WebP, GIF).');
      input.value = '';
      return;
    }

    const oversize = picked.find((f) => f.size > MAX_FILE_BEFORE_COMPRESS);
    if (oversize) {
      alert(`"${oversize.name}" is too large (max 15MB per file).`);
      input.value = '';
      return;
    }

    setUploadingImages(true);
    try {
      const capped = picked.slice(0, MAX_PRODUCT_IMAGES);
      const newUrls: string[] = [];
      for (const file of capped) {
        try {
          newUrls.push(await fileToAdminImageDataUrl(file));
        } catch (err) {
          console.error('Image failed:', file.name, err);
          alert(`Could not read "${file.name}". Try another image.`);
        }
      }

      if (newUrls.length > 0) {
        setFormData((prev) => {
          const room = MAX_PRODUCT_IMAGES - prev.images.length;
          if (room <= 0) return prev;
          return {
            ...prev,
            images: [...prev.images, ...newUrls.slice(0, room)],
          };
        });
      }
    } finally {
      setUploadingImages(false);
      input.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const productData = {
      ...formData,
      images: formData.images.filter((u) => typeof u === 'string' && u.trim().length > 12),
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock, 10),
      updatedAt: serverTimestamp(),
      createdAt: editingProduct ? editingProduct.createdAt : serverTimestamp(),
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
      await fetchProducts();
    } catch (error: unknown) {
      console.error('Error saving product:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes('Quota') ||
        (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'QuotaExceededError')
      ) {
        alert(
          'Browser storage is full. Remove some product images or clear site data for this origin, then try again.'
        );
      } else {
        alert('Could not save the product. Check the console for details.');
      }
    } finally {
      setSaving(false);
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
      description: product.description ?? '',
      price: product.price?.toString() ?? '',
      stock: (product.stock ?? 0).toString(),
      category: product.category ?? '',
      images: coerceProductImages(product),
    });
    setIsModalOpen(true);
  };

  const filteredProducts = products.filter((p) =>
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tableThumb = (product: any) =>
    coerceProductImages(product)[0] ||
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200';

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Product Management</h1>
          <p className="text-gray-500 font-medium">Add, edit, and manage your fashion items and stock levels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <button
          type="button"
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
          type="button"
          onClick={async () => {
            await seedDressPants();
            fetchProducts();
          }}
          className="text-sm font-bold text-gray-400 hover:text-gray-600 underline-offset-4 hover:underline transition-colors"
        >
          Load demo products
        </button>
        </div>
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
              {listLoading ? (
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
                          src={tableThumb(product)}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=200';
                          }}
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
                        Product photos ({formData.images.length}/{MAX_PRODUCT_IMAGES})
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        Previews appear in order; upload tile stays on the right. Large photos are resized for saving
                        (this demo stores images in the browser).
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        {formData.images.map((img, i) => (
                          <div
                            key={`img-${i}`}
                            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm group"
                          >
                            <img
                              src={img}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  images: formData.images.filter((_, idx) => idx !== i),
                                })
                              }
                              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:bg-red-600"
                              aria-label="Remove photo"
                            >
                              <X size={14} />
                            </button>
                            <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {i + 1}
                            </span>
                          </div>
                        ))}
                        {formData.images.length < MAX_PRODUCT_IMAGES && (
                          <label
                            className={cn(
                              'relative flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-400 transition-all',
                              'hover:border-[#4CAF50] hover:text-[#4CAF50]',
                              uploadingImages && 'pointer-events-none opacity-60'
                            )}
                          >
                            {uploadingImages ? (
                              <Loader2 className="h-6 w-6 animate-spin text-[#4CAF50]" />
                            ) : (
                              <>
                                <Upload size={20} />
                                <span className="mt-1 text-[10px] font-black uppercase">Add</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleImageUpload}
                              className="hidden"
                            />
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
                    disabled={saving || uploadingImages}
                    className="flex-[2] px-8 py-4 bg-[#4CAF50] text-white rounded-2xl font-black shadow-lg shadow-[#4CAF50]/20 hover:bg-[#45a049] transition-all disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
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
