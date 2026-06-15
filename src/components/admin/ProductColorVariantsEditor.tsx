import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { uploadProductImageFile } from '../../lib/productImageUpload';
import { newColorVariantRow, type ColorVariantFormRow } from '../../lib/productVariants';
import { newSizeRow, type SizeRow } from '../../lib/productInventory';

const MAX_IMAGES = 6;
const MAX_FILE = 15 * 1024 * 1024;

type ProductColorVariantsEditorProps = {
  variants: ColorVariantFormRow[];
  onChange: (variants: ColorVariantFormRow[]) => void;
  presetSizes: string[];
};

function variantStockTotal(rows: SizeRow[]) {
  return rows.reduce((sum, row) => {
    const qty = Math.floor(Number(row.quantity));
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
}

const ProductColorVariantsEditor: React.FC<ProductColorVariantsEditorProps> = ({
  variants,
  onChange,
  presetSizes,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(variants[0]?.id ?? null);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [customSizeByVariant, setCustomSizeByVariant] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateVariant = (id: string, patch: Partial<ColorVariantFormRow>) => {
    onChange(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVariant = () => {
    const row = newColorVariantRow({ name: '', sizeRows: [newSizeRow('S', ''), newSizeRow('M', ''), newSizeRow('L', '')] });
    onChange([...variants, row]);
    setExpandedId(row.id);
  };

  const removeVariant = (id: string) => {
    if (variants.length <= 1) {
      toast.error('Keep at least one color');
      return;
    }
    onChange(variants.filter((v) => v.id !== id));
    if (expandedId === id) setExpandedId(variants.find((v) => v.id !== id)?.id ?? null);
  };

  const addSizeRow = (variantId: string, size: string) => {
    const label = size.trim();
    if (!label) return;
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    if (variant.sizeRows.some((r) => r.size.trim().toLowerCase() === label.toLowerCase())) {
      toast.error('Size already added');
      return;
    }
    updateVariant(variantId, { sizeRows: [...variant.sizeRows, newSizeRow(label, '0')] });
    setCustomSizeByVariant((prev) => ({ ...prev, [variantId]: '' }));
  };

  const updateSizeRow = (variantId: string, rowId: string, patch: Partial<Pick<SizeRow, 'size' | 'quantity'>>) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    updateVariant(variantId, {
      sizeRows: variant.sizeRows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    });
  };

  const removeSizeRow = (variantId: string, rowId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return;
    updateVariant(variantId, { sizeRows: variant.sizeRows.filter((r) => r.id !== rowId) });
  };

  const handleImageUpload = async (variantId: string, files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) return;
    const oversize = picked.find((f) => f.size > MAX_FILE);
    if (oversize) {
      toast.error('File too large', { description: 'Max 15 MB per image.' });
      return;
    }

    setUploadingVariantId(variantId);
    try {
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) return;
      const room = MAX_IMAGES - variant.images.length;
      if (room <= 0) {
        toast.error('Maximum photos reached', { description: `Up to ${MAX_IMAGES} photos per color.` });
        return;
      }
      const urls: string[] = [];
      for (const file of picked.slice(0, room)) {
        try {
          urls.push(await uploadProductImageFile(file));
        } catch (err) {
          console.error(err);
          toast.error('Upload failed', { description: file.name });
        }
      }
      if (urls.length) {
        updateVariant(variantId, { images: [...variant.images, ...urls] });
      }
    } finally {
      setUploadingVariantId(null);
    }
  };

  const totalUnits = variants.reduce((sum, v) => sum + variantStockTotal(v.sizeRows), 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">Colors & inventory</p>
          <p className="text-xs text-gray-500">
            Each color has its own photos and size quantities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-gray-500">
            {variants.length} color{variants.length === 1 ? '' : 's'} ·{' '}
            <strong className="text-gray-900">{totalUnits}</strong> units
          </span>
          <button
            type="button"
            onClick={addVariant}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-catchy/30 bg-white px-3 text-xs font-semibold text-catchy shadow-sm hover:bg-catchy/5"
          >
            <Plus size={14} />
            Add color
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {variants.map((variant, index) => {
          const open = expandedId === variant.id;
          const stock = variantStockTotal(variant.sizeRows);
          const thumb = variant.images[0];
          return (
            <div
              key={variant.id}
              className={cn(
                'overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow',
                open && 'md:col-span-2 ring-1 ring-catchy/20'
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : variant.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-start hover:bg-gray-50/80"
              >
                {thumb ? (
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                    <span
                      className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-tl border border-white shadow-sm"
                      style={{ backgroundColor: variant.hex || '#d1d5db' }}
                      aria-hidden
                    />
                  </span>
                ) : (
                  <span
                    className="h-12 w-12 shrink-0 rounded-md border border-gray-200 shadow-inner"
                    style={{ backgroundColor: variant.hex || '#d1d5db' }}
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {variant.name.trim() || `Color ${index + 1}`}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {variant.images.length} photo{variant.images.length === 1 ? '' : 's'} · {stock} in stock
                  </p>
                </div>
                {open ? (
                  <ChevronUp size={16} className="shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="shrink-0 text-gray-400" />
                )}
              </button>

              {open ? (
                <div className="space-y-4 border-t border-gray-100 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Color name (EN)
                      </label>
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => updateVariant(variant.id, { name: e.target.value })}
                        className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
                        placeholder="Black"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Color name (AR)
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={variant.nameAr}
                        onChange={(e) => updateVariant(variant.id, { nameAr: e.target.value })}
                        className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
                        placeholder="أسود"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        Swatch
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={variant.hex || '#9ca3af'}
                          onChange={(e) => updateVariant(variant.id, { hex: e.target.value })}
                          className="h-9 w-12 cursor-pointer rounded-md border border-gray-200 bg-white p-0.5"
                          aria-label="Color swatch"
                        />
                        <input
                          type="text"
                          value={variant.hex}
                          onChange={(e) => updateVariant(variant.id, { hex: e.target.value })}
                          className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 px-2 font-mono text-xs"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700">Photos for this color</label>
                        <button
                          type="button"
                          disabled={uploadingVariantId === variant.id || variant.images.length >= MAX_IMAGES}
                          onClick={() => fileRefs.current[variant.id]?.click()}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {uploadingVariantId === variant.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Upload size={12} />
                          )}
                          Upload
                        </button>
                        <input
                          ref={(el) => {
                            fileRefs.current[variant.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void handleImageUpload(variant.id, e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      {variant.images.length ? (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {variant.images.map((url, imgIdx) => (
                            <div
                              key={url}
                              className="relative aspect-[4/5] overflow-hidden rounded-md bg-gray-100 ring-1 ring-black/5 hover:[&_.photo-remove-btn]:pointer-events-auto hover:[&_.photo-remove-btn]:opacity-100"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() =>
                                  updateVariant(variant.id, {
                                    images: variant.images.filter((_, i) => i !== imgIdx),
                                  })
                                }
                                className="photo-remove-btn pointer-events-none absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity"
                                aria-label="Remove photo"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex aspect-[5/2] items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-400">
                          <ImageIcon size={20} />
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700">Sizes & quantities</label>
                        <span className="text-[11px] tabular-nums text-gray-500">{stock} units</span>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {presetSizes.map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={() => addSizeRow(variant.id, size)}
                            className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:border-catchy hover:text-catchy"
                          >
                            + {size}
                          </button>
                        ))}
                      </div>
                      {variant.sizeRows.length ? (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            <span>Size</span>
                            <span>Qty</span>
                            <span />
                          </div>
                          {variant.sizeRows.map((row) => (
                            <div key={row.id} className="grid grid-cols-[1fr_5rem_2rem] items-center gap-2">
                              <input
                                type="text"
                                value={row.size}
                                onChange={(e) => updateSizeRow(variant.id, row.id, { size: e.target.value })}
                                className="h-8 rounded-md border border-gray-200 px-2 text-sm"
                              />
                              <input
                                type="number"
                                min={0}
                                value={row.quantity}
                                onChange={(e) => updateSizeRow(variant.id, row.id, { quantity: e.target.value })}
                                className="h-8 rounded-md border border-gray-200 px-2 text-sm tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => removeSizeRow(variant.id, row.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 flex gap-1.5">
                        <input
                          type="text"
                          value={customSizeByVariant[variant.id] ?? ''}
                          onChange={(e) =>
                            setCustomSizeByVariant((prev) => ({ ...prev, [variant.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addSizeRow(variant.id, customSizeByVariant[variant.id] ?? '');
                            }
                          }}
                          className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm"
                          placeholder="Custom size"
                        />
                        <button
                          type="button"
                          onClick={() => addSizeRow(variant.id, customSizeByVariant[variant.id] ?? '')}
                          className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {variants.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeVariant(variant.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={12} />
                      Remove color
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProductColorVariantsEditor;
