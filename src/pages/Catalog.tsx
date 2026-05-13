import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, collection, getDocs, query, orderBy } from '../firebase';
import ProductCard from '../components/ProductCard';
import { Filter, Search } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS, CATEGORY_ICONS } from '../constants';
import { cn } from '../lib/utils';

const Catalog = () => {
  const { t, isRTL } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'All');
  const [categories, setCategories] = useState<string[]>(['All']);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setProducts(productsData);

        const cats = Array.from(new Set(productsData.map((p: any) => p.category?.charAt(0).toUpperCase() + p.category?.slice(1).toLowerCase())));
        setCategories(['All', ...cats]);
      } catch (error) {
        console.error('Error fetching catalog:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const categoryFromUrl = searchParams.get('category');
    if (categoryFromUrl) {
      setSelectedCategory(categoryFromUrl);
    }
  }, [searchParams]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === 'All') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', cat);
    }
    setSearchParams(searchParams);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || (product.category && product.category.toLowerCase() === selectedCategory.toLowerCase());
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#F5F3EF] pt-32 md:pt-48 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 mb-12">
          <div className={cn("flex flex-col md:flex-row justify-between items-start md:items-center gap-6", isRTL ? "md:flex-row-reverse" : "")}>
            <div className={isRTL ? "text-right" : "text-left"}>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">{t('catalog.title')}</h1>
              <p className="text-gray-500 font-light">{t('catalog.subtitle')}</p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className={cn("absolute top-1/2 -translate-y-1/2 text-gray-400", isRTL ? "right-4" : "left-4")} size={20} />
              <input
                type="text"
                placeholder={t('catalog.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(
                  "w-full pr-4 py-3 bg-white rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#4ba673] transition-all shadow-sm",
                  isRTL ? "pr-12 pl-4" : "pl-12 pr-4"
                )}
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div className={cn("flex items-center gap-3 overflow-x-auto pb-4 scrollbar-hide", isRTL ? "flex-row-reverse" : "")}>
            {categories.map(cat => {
              const Icon = CATEGORY_ICONS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={cn(
                    "px-8 py-4 rounded-[1.5rem] text-sm font-black whitespace-nowrap transition-all duration-300 flex items-center gap-4",
                    selectedCategory === cat
                      ? "bg-[#4ba673] text-white shadow-xl shadow-[#4ba673]/30 scale-105"
                      : "bg-white text-gray-500 border border-gray-100 hover:border-[#4ba673]/30 hover:text-gray-900"
                  )}
                >
                  {Icon && <Icon size={28} strokeWidth={selectedCategory === cat ? 2.5 : 1.5} />}
                  {t(CATEGORY_KEYS[cat] || cat)}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="animate-pulse bg-gray-100 rounded-2xl aspect-[3/4]" />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {filteredProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-gray-200">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
              <Search size={40} />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No products found</h3>
            <p className="text-gray-500">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Catalog;
