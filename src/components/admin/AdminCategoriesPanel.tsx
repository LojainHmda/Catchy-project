import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStoreCategories } from '../../hooks/useStoreCategories';
import { saveStoreCategories, type StoreCategory } from '../../lib/categoriesService';
import {
  CATEGORY_ICON_KEYS,
  DEFAULT_CATEGORY_ICON,
  getCategoryIcon,
} from '../../lib/categoryIcons';
import { cn } from '../../lib/utils';

type DraftRow = StoreCategory & { _key: string };

let keySeq = 0;
const nextKey = () => `cat-${Date.now()}-${keySeq++}`;

function toDraft(cats: StoreCategory[]): DraftRow[] {
  return cats.map((c) => ({ ...c, _key: nextKey() }));
}

const INPUT =
  'h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-catchy focus:ring-1 focus:ring-catchy/20';

const AdminCategoriesPanel: React.FC = () => {
  const { categories } = useStoreCategories();
  const [draft, setDraft] = useState<DraftRow[]>(() => toDraft(categories));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);

  // Sync from server only while there are no unsaved local edits.
  useEffect(() => {
    if (!dirty) setDraft(toDraft(categories));
  }, [categories, dirty]);

  const update = (key: string, patch: Partial<DraftRow>) => {
    setDraft((prev) => prev.map((row) => (row._key === key ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const move = (key: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const index = prev.findIndex((r) => r._key === key);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  const removeRow = (row: DraftRow) => {
    if (row.locked) return;
    if (row.id && !window.confirm(`Delete category "${row.name}"? Products in it keep the tag until reassigned.`)) {
      return;
    }
    setDraft((prev) => prev.filter((r) => r._key !== row._key));
    setDirty(true);
  };

  const addRow = () => {
    setDraft((prev) => [
      ...prev,
      {
        _key: nextKey(),
        id: '',
        name: '',
        nameAr: '',
        icon: DEFAULT_CATEGORY_ICON,
        hidden: false,
        order: prev.length,
      },
    ]);
    setDirty(true);
  };

  const reset = () => {
    setDraft(toDraft(categories));
    setDirty(false);
  };

  const handleSave = async () => {
    const cleaned: StoreCategory[] = [];
    const seen = new Set<string>();
    for (const row of draft) {
      const name = row.name.trim();
      if (!name) {
        toast.error('Every category needs an English name.');
        return;
      }
      // New rows derive their permanent id from the name; existing rows keep their id.
      const id = (row.id || name).trim();
      const key = id.toLowerCase();
      if (seen.has(key)) {
        toast.error(`Duplicate category "${id}". Names must be unique.`);
        return;
      }
      seen.add(key);
      cleaned.push({
        id,
        name,
        nameAr: row.nameAr.trim(),
        icon: row.icon || DEFAULT_CATEGORY_ICON,
        hidden: row.hidden,
        ...(row.locked ? { locked: true } : {}),
        order: cleaned.length,
      });
    }

    setSaving(true);
    try {
      await saveStoreCategories(cleaned);
      setDirty(false);
      toast.success('Categories saved');
    } catch (error) {
      console.error('Saving categories failed:', error);
      toast.error('Could not save categories', {
        description: error instanceof Error ? error.message : 'Check your connection and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const pickerRow = useMemo(
    () => draft.find((r) => r._key === iconPickerFor) ?? null,
    [draft, iconPickerFor]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
          <p className="text-xs text-gray-500">
            Add, rename, hide, reorder, or remove the categories shown across the store.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw size={13} />
              Discard
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-catchy-dark disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save changes
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {draft.map((row, index) => {
          const Icon = getCategoryIcon(row.icon);
          return (
            <div
              key={row._key}
              className={cn(
                'flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center',
                row.hidden ? 'border-gray-200 bg-gray-50/70' : 'border-gray-200'
              )}
            >
              <button
                type="button"
                onClick={() => setIconPickerFor(row._key)}
                title="Change icon"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-catchy transition hover:border-catchy hover:bg-catchy/5"
              >
                <Icon className="h-6 w-6" strokeWidth={1.3} />
              </button>

              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <div>
                  <input
                    value={row.name}
                    onChange={(e) => update(row._key, { name: e.target.value })}
                    placeholder="English name"
                    className={INPUT}
                  />
                  <p className="mt-0.5 ps-0.5 text-[10px] text-gray-400">
                    {row.id ? `id: ${row.id}` : 'new — id is set on save'}
                    {row.locked ? ' · system' : ''}
                  </p>
                </div>
                <input
                  value={row.nameAr}
                  onChange={(e) => update(row._key, { nameAr: e.target.value })}
                  placeholder="الاسم بالعربية"
                  dir="rtl"
                  className={cn(INPUT, 'font-arabic')}
                />
              </div>

              <div className="flex shrink-0 items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => update(row._key, { hidden: !row.hidden })}
                  title={row.hidden ? 'Hidden — click to show' : 'Visible — click to hide'}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-md border transition',
                    row.hidden
                      ? 'border-gray-200 text-gray-400 hover:bg-gray-100'
                      : 'border-catchy/30 text-catchy hover:bg-catchy/5'
                  )}
                >
                  {row.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(row._key, -1)}
                    disabled={index === 0}
                    className="inline-flex h-5 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(row._key, 1)}
                    disabled={index === draft.length - 1}
                    className="inline-flex h-5 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row)}
                  disabled={row.locked}
                  title={row.locked ? 'System category — cannot be deleted' : 'Delete category'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 transition hover:border-catchy hover:text-catchy"
      >
        <Plus size={16} />
        Add category
      </button>

      {pickerRow ? (
        <IconPickerModal
          selected={pickerRow.icon}
          onClose={() => setIconPickerFor(null)}
          onSelect={(icon) => {
            update(pickerRow._key, { icon });
            setIconPickerFor(null);
          }}
        />
      ) : null}
    </div>
  );
};

type IconPickerModalProps = {
  selected: string;
  onClose: () => void;
  onSelect: (icon: string) => void;
};

const IconPickerModal: React.FC<IconPickerModalProps> = ({ selected, onClose, onSelect }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close icon picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">Choose an icon</h4>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid max-h-[60vh] grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-6">
          {CATEGORY_ICON_KEYS.map((key) => {
            const Icon = getCategoryIcon(key);
            const active = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                title={key}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg border transition',
                  active
                    ? 'border-catchy bg-catchy/10 text-catchy ring-2 ring-catchy/25'
                    : 'border-gray-200 text-gray-600 hover:border-catchy hover:text-catchy'
                )}
              >
                <Icon className="h-6 w-6" strokeWidth={1.3} />
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminCategoriesPanel;
