import React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  newSizeRow,
  parseSizeStock,
  rowsToSizeStock,
  sizeStockToRows,
  totalFromSizeStock,
  type SizeRow,
} from '../../lib/productInventory';

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'];

const INPUT =
  'h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 focus:ring-0';

export type CoordinateSizeInventoryProps = {
  rows: SizeRow[];
  onChange: (rows: SizeRow[]) => void;
  onPersist: (sizeStock: Record<string, number>, sizes: string[], stock: number) => void;
};

const CoordinateSizeInventory: React.FC<CoordinateSizeInventoryProps> = ({ rows, onChange, onPersist }) => {
  const [customSize, setCustomSize] = React.useState('');

  const addRow = (size: string) => {
    const label = size.trim();
    if (!label) return;
    if (rows.some((r) => r.size.trim().toLowerCase() === label.toLowerCase())) return;
    onChange([...rows, newSizeRow(label, '0')]);
    setCustomSize('');
  };

  const updateRow = (id: string, patch: Partial<Pick<SizeRow, 'size' | 'quantity'>>) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  const commit = () => {
    const { sizeStock, error } = rowsToSizeStock(rows);
    if (error) return;
    const sizes = Object.keys(sizeStock);
    onPersist(sizeStock, sizes, totalFromSizeStock(sizeStock));
  };

  React.useEffect(() => {
    const t = window.setTimeout(commit, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const total = totalFromSizeStock(rowsToSizeStock(rows).sizeStock);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-700">Size inventory</span>
        <span className="text-xs tabular-nums text-gray-500">
          Total: <strong className="text-gray-900">{total}</strong>
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {PRESET_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => addRow(size)}
            className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:border-catchy hover:text-catchy"
          >
            + {size}
          </button>
        ))}
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_4rem_1.75rem] gap-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            <span>Size</span>
            <span>Qty</span>
            <span />
          </div>
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_4rem_1.75rem] items-center gap-1.5">
              <input
                type="text"
                value={row.size}
                onChange={(e) => updateRow(row.id, { size: e.target.value })}
                className={INPUT}
                placeholder="M"
              />
              <input
                type="number"
                min={0}
                step={1}
                value={row.quantity}
                onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                className={cn(INPUT, 'tabular-nums')}
              />
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="inline-flex h-8 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove size"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Add sizes with stock counts — same as regular products.</p>
      )}
      <div className="mt-2 flex gap-1.5">
        <input
          type="text"
          value={customSize}
          onChange={(e) => setCustomSize(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addRow(customSize);
            }
          }}
          className={cn(INPUT, 'flex-1')}
          placeholder="Custom size"
        />
        <button
          type="button"
          onClick={() => addRow(customSize)}
          className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:border-catchy"
        >
          Add
        </button>
      </div>
    </div>
  );
};

export function sizeRowsFromLook(look: { sizeStock?: unknown; sizes?: unknown }): SizeRow[] {
  const parsed = parseSizeStock(look.sizeStock);
  if (Object.keys(parsed).length > 0) return sizeStockToRows(parsed);
  if (Array.isArray(look.sizes) && look.sizes.length > 0) {
    return look.sizes.map((s: string) => newSizeRow(String(s), '0'));
  }
  return [];
}

export default CoordinateSizeInventory;
