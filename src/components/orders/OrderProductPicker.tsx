import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { db, doc, getDoc } from '../../firebase';
import { loadCatalogIndex } from '../../lib/catalog/catalogService';
import type { CatalogListProduct } from '../../lib/catalogProductList';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../lib/productImages';
import {
  parseColorVariants,
  resolveVariantSelection,
  variantLabel,
} from '../../lib/productVariants';
import {
  hasSizedInventory,
  sortedSizeStockEntries,
  stockForSelection,
} from '../../lib/productInventory';
import { formatOrderMoney } from '../../lib/orders';
import type { ProductColorVariant } from '../../types/product';
import type { OrderLineItem } from '../../types/order';
import { cn } from '../../lib/utils';

type OrderProductPickerProps = {
  /** Hand a staged line item up to the editor (not yet saved to Firestore). */
  onAdd: (item: OrderLineItem) => void;
  onClose: () => void;
};

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-catchy focus:ring-1 focus:ring-catchy/20';

const OrderProductPicker: React.FC<OrderProductPickerProps> = ({ onAdd, onClose }) => {
  const [products, setProducts] = useState<CatalogListProduct[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');

  // The chosen product's full doc — needed for color variants + per-size stock.
  const [selected, setSelected] = useState<{ id: string; data: Record<string, unknown> } | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [colorId, setColorId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const index = await loadCatalogIndex();
        if (!cancelled) setProducts(index.products);
      } catch {
        /* keep empty list */
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) => p.name.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q) ?? false)
        )
      : products;
    return list.slice(0, 30);
  }, [products, search]);

  const selectProduct = async (id: string) => {
    setLoadingProduct(true);
    setSelected(null);
    try {
      const snap = await getDoc(doc(db, 'products', id));
      const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
      const variants = parseColorVariants(data.colorVariants);
      const firstColor = variants.length ? resolveVariantSelection(data, null).variant?.id ?? null : null;
      const selection = resolveVariantSelection(data, firstColor);
      const firstSize = hasSizedInventory(selection.sizeStock)
        ? sortedSizeStockEntries(selection.sizeStock, { includeZero: false })[0]?.[0] ?? null
        : null;
      setSelected({ id, data });
      setColorId(firstColor);
      setSize(firstSize);
      setQuantity(1);
    } finally {
      setLoadingProduct(false);
    }
  };

  const selection = selected ? resolveVariantSelection(selected.data, colorId) : null;
  const variants: ProductColorVariant[] = selected ? parseColorVariants(selected.data.colorVariants) : [];
  const sizeEntries = selection ? sortedSizeStockEntries(selection.sizeStock, { includeZero: false }) : [];
  const sized = selection ? hasSizedInventory(selection.sizeStock) : false;
  const available = selection ? stockForSelection(selection.sizeStock, selection.stock, size) : 0;
  const canAdd =
    !!selected &&
    (variants.length === 0 || !!colorId) &&
    (!sized || !!size) &&
    available >= quantity &&
    quantity >= 1;

  const pickColor = (id: string) => {
    setColorId(id);
    const sel = resolveVariantSelection(selected!.data, id);
    const firstSize = hasSizedInventory(sel.sizeStock)
      ? sortedSizeStockEntries(sel.sizeStock, { includeZero: false })[0]?.[0] ?? null
      : null;
    setSize(firstSize);
    setQuantity(1);
  };

  const confirm = () => {
    if (!selected || !selection || !canAdd) return;
    const productName = String(selected.data.name ?? 'Item');
    const price = Number(selected.data.price) || 0;
    const colorName = selection.hasVariants ? selection.variant?.name ?? null : null;
    const variantPart = [colorName, size].filter(Boolean).join(' / ');
    const name = variantPart ? `${productName} (${variantPart})` : productName;
    const item: OrderLineItem = {
      productId: selected.id,
      name,
      price,
      quantity,
      image: selection.images[0] ?? '',
      lineTotal: price * quantity,
      size,
      colorId: selection.hasVariants ? colorId : null,
      colorName,
    };
    onAdd(item);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Add a product</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          aria-label="Cancel adding a product"
        >
          <X size={14} />
        </button>
      </div>

      {!selected ? (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className={cn(INPUT, 'pl-8')}
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white">
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No products found.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => selectProduct(p.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-gray-50"
                    >
                      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-black/5">
                        <img
                          src={p.images[0] || PRODUCT_IMAGE_PLACEHOLDER}
                          alt={p.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (el.src.includes('product-placeholder.svg')) return;
                            el.onerror = null;
                            el.src = PRODUCT_IMAGE_PLACEHOLDER;
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs tabular-nums text-gray-500">{formatOrderMoney(p.price)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : loadingProduct ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-gray-900">
              {String(selected.data.name ?? 'Product')}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 text-xs font-medium text-catchy hover:underline"
            >
              Change
            </button>
          </div>

          {variants.length > 0 ? (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Color</p>
              <div className="flex flex-wrap gap-1.5">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => pickColor(v.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition',
                      colorId === v.id
                        ? 'border-catchy bg-catchy/5 text-catchy-dark'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: v.hex || '#d1d5db' }}
                    />
                    {variantLabel(v, false)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {sized ? (
            <div className="mb-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Size</p>
              <div className="flex flex-wrap gap-1.5">
                {sizeEntries.map(([s, qty]) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSize(s);
                      setQuantity(1);
                    }}
                    className={cn(
                      'inline-flex min-w-[2.25rem] items-center justify-center rounded-md border px-2 py-1 text-xs font-semibold transition',
                      size === s
                        ? 'border-catchy bg-catchy/5 text-catchy-dark'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    )}
                  >
                    {s}
                    <span className="ml-1 text-[10px] font-normal text-gray-400">{qty}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Qty</p>
              <input
                type="number"
                min={1}
                max={Math.max(1, available)}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className={cn(INPUT, 'w-20')}
              />
              <p className="mt-1 text-[11px] text-gray-400">{available} in stock</p>
            </div>
            <button
              type="button"
              onClick={confirm}
              disabled={!canAdd}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white transition hover:bg-catchy-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} />
              Add to order
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProductPicker;
