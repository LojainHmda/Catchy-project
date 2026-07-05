import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, collection, getDocs, updateDoc, doc, query, orderBy, limit, startAfter } from '../firebase';
import { Search, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

type ProductRow = {
  id: string;
  name: string;
  category: string;
  stock: number;
  image: string;
};

const PAGE_SIZE = 50;

type StockFilter = 'all' | 'low' | 'out';

function stockStatus(stock: number): { label: string; tone: string } {
  if (stock === 0) return { label: 'Out of stock', tone: 'bg-gray-300' };
  if (stock <= 10) return { label: 'Low', tone: 'bg-gray-500' };
  return { label: 'In stock', tone: 'bg-gray-900' };
}

const AdminStock = () => {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stockUpdates, setStockUpdates] = useState<Record<string, number>>({});

  const lastDocRef = useRef<any>(null);

  const mapRow = useCallback((d: any): ProductRow => {
    const data = d.data();
    const imgs = coerceProductImages(data);
    return {
      id: d.id,
      name: String(data.name ?? ''),
      category: String(data.category ?? ''),
      stock: Number(data.stock) || 0,
      image: imgs[0] ?? PRODUCT_IMAGE_PLACEHOLDER,
    };
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    lastDocRef.current = null;
    try {
      const q = query(collection(db, 'products'), orderBy('name', 'asc'), limit(PAGE_SIZE));
      const snapshot = await getDocs(q);
      const productsData: ProductRow[] = snapshot.docs.map(mapRow);
      lastDocRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setProducts(productsData);
      const initial: Record<string, number> = {};
      productsData.forEach((p) => { initial[p.id] = p.stock; });
      setStockUpdates(initial);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [mapRow]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'products'),
        orderBy('name', 'asc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(q);
      const newRows: ProductRow[] = snapshot.docs.map(mapRow);
      if (snapshot.docs.length > 0) lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...newRows.filter((r) => !seen.has(r.id))];
      });
      setStockUpdates((prev) => {
        const next = { ...prev };
        newRows.forEach((p) => { if (!(p.id in next)) next[p.id] = p.stock; });
        return next;
      });
    } catch (error) {
      console.error('Error loading more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, mapRow]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleStockChange = (id: string, value: string) => {
    const numValue = Math.max(0, parseInt(value, 10) || 0);
    setStockUpdates((prev) => ({ ...prev, [id]: numValue }));
  };

  const saveStock = async (id: string) => {
    setSavingId(id);
    try {
      const next = stockUpdates[id] ?? 0;
      await updateDoc(doc(db, 'products', id), { stock: next });
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, stock: next } : p)));
    } catch (error) {
      console.error('Error updating stock:', error);
    } finally {
      setSavingId(null);
    }
  };

  const summary = useMemo(() => {
    const low = products.filter((p) => p.stock > 0 && p.stock <= 10).length;
    const out = products.filter((p) => p.stock === 0).length;
    return { total: products.length, low, out };
  }, [products]);

  const filterCounts = useMemo(
    () => ({
      all: products.length,
      low: products.filter((p) => p.stock > 0 && p.stock <= 10).length,
      out: products.filter((p) => p.stock === 0).length,
    }),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === 'low' && !(p.stock > 0 && p.stock <= 10)) return false;
      if (stockFilter === 'out' && p.stock !== 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, stockFilter]);

  const stockFilters: { key: StockFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'low', label: 'Low' },
    { key: 'out', label: 'Out' },
  ];

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Stock</h1>
        <p className="mt-0.5 text-sm text-gray-500">Update inventory levels across the catalog.</p>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Products</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.total}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Low</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.low}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-gray-500">Out of stock</dt>
            <dd className="font-medium tabular-nums text-gray-900">{summary.out}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-4">
        <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search products…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {stockFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStockFilter(f.key)}
                className={cn(
                  'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                  stockFilter === f.key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {f.label}
                <span className="ml-1 tabular-nums opacity-70">{filterCounts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-0 overflow-hidden rounded-md border border-gray-200 bg-white">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No products match your filters.</p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                      <th className="px-4 py-2.5 font-medium">Product</th>
                      <th className="px-4 py-2.5 font-medium">On hand</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">New qty</th>
                      <th className="px-4 py-2.5 text-right font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProducts.map((product) => {
                      const currentVal = stockUpdates[product.id] ?? product.stock;
                      const hasChanged = currentVal !== product.stock;
                      const status = stockStatus(product.stock);

                      return (
                        <tr key={product.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <img
                                src={product.image}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded object-cover bg-gray-100"
                                referrerPolicy="no-referrer" loading="lazy"/>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{product.name}</p>
                                <p className="truncate text-xs text-gray-500">{product.category}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-gray-900">{product.stock}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                              <span className={cn('h-1.5 w-1.5 rounded-full', status.tone)} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              min={0}
                              value={currentVal}
                              onChange={(e) => handleStockChange(product.id, e.target.value)}
                              className="h-8 w-20 rounded-md border border-gray-200 px-2 text-center text-sm tabular-nums text-gray-900 outline-none focus:border-gray-400"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => saveStock(product.id)}
                              disabled={!hasChanged || savingId === product.id}
                              className={cn(
                                'h-8 rounded-md px-3 text-xs font-medium transition-colors',
                                hasChanged
                                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                                  : 'cursor-not-allowed text-gray-300'
                              )}
                            >
                              {savingId === product.id ? 'Saving…' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-gray-100 md:hidden">
                {filteredProducts.map((product) => {
                  const currentVal = stockUpdates[product.id] ?? product.stock;
                  const hasChanged = currentVal !== product.stock;
                  const status = stockStatus(product.stock);

                  return (
                    <li key={product.id} className="px-4 py-3">
                      <div className="flex gap-2.5">
                        <img
                          src={product.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover bg-gray-100"
                          referrerPolicy="no-referrer" loading="lazy"/>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">
                            {product.stock} on hand · {status.label}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="number"
                                          min={0}
                              value={currentVal}
                              onChange={(e) => handleStockChange(product.id, e.target.value)}
                              className="h-8 w-20 rounded-md border border-gray-200 px-2 text-center text-sm tabular-nums outline-none focus:border-gray-400"
                            />
                            <button
                              type="button"
                              onClick={() => saveStock(product.id)}
                              disabled={!hasChanged || savingId === product.id}
                              className={cn(
                                'h-8 rounded-md px-3 text-xs font-medium',
                                hasChanged
                                  ? 'bg-gray-900 text-white'
                                  : 'cursor-not-allowed text-gray-300'
                              )}
                            >
                              {savingId === product.id ? '…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
            Load more products
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

export default AdminStock;