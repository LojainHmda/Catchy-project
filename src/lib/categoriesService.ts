import { db, doc, onSnapshot, serverTimestamp, setDoc } from '../firebase';
import { setKnownCategories } from './category';
import { CATEGORY_ICON_REGISTRY, DEFAULT_CATEGORY_ICON } from './categoryIcons';

/** A storefront category managed from the admin Categories tab. `id` is what products store. */
export type StoreCategory = {
  /** Canonical value saved on each product's `category` field. Immutable once created. */
  id: string;
  name: string;
  nameAr: string;
  /** Icon registry slug (see categoryIcons). */
  icon: string;
  /** When true, the category is hidden from the storefront (still visible in admin). */
  hidden: boolean;
  /** System category that cannot be deleted (e.g. Coordinates). */
  locked?: boolean;
  order: number;
};

/** Seed used when the Firestore doc does not exist yet — mirrors the original hardcoded set. */
export const DEFAULT_STORE_CATEGORIES: StoreCategory[] = [
  { id: 'Dresses', name: 'Dresses', nameAr: 'فساتين', icon: 'dresses', hidden: false, order: 0 },
  { id: 'Tops', name: 'Tops', nameAr: 'بلايز', icon: 'tops', hidden: false, order: 1 },
  { id: 'Shirts', name: 'Shirts', nameAr: 'قمصان', icon: 'shirts', hidden: false, order: 2 },
  { id: 'Pants', name: 'Pants', nameAr: 'بلاطين', icon: 'pants', hidden: false, order: 3 },
  { id: 'Skirts', name: 'Skirts', nameAr: 'تنانير', icon: 'skirts', hidden: false, order: 4 },
  { id: 'Long Skirt Sets', name: 'Long Skirt Sets', nameAr: 'طقم تنورة طويل', icon: 'longSkirtSets', hidden: false, order: 5 },
  { id: 'Jackets', name: 'Jackets', nameAr: 'جاكيتات', icon: 'jackets', hidden: false, order: 6 },
  { id: 'Formal Sets', name: 'Formal Sets', nameAr: 'طقوم رسمية', icon: 'formalSets', hidden: false, order: 7 },
  { id: 'Practical Sets', name: 'Practical Sets', nameAr: 'طقم عملي', icon: 'practicalSets', hidden: false, order: 8 },
  { id: 'Coordinates', name: 'Coordinates', nameAr: 'تنسيقات', icon: 'coordinates', hidden: false, locked: true, order: 9 },
];

const CATEGORIES_COLLECTION = 'site_settings';
const CATEGORIES_DOC = 'categories';

function clone(cats: StoreCategory[]): StoreCategory[] {
  return cats.map((c) => ({ ...c }));
}

/** Validate/normalize raw Firestore data into a clean category list. */
export function parseStoreCategories(raw: unknown): StoreCategory[] {
  if (!Array.isArray(raw)) return clone(DEFAULT_STORE_CATEGORIES);
  const seen = new Set<string>();
  const items: StoreCategory[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!id || !name) return;
    const key = id.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const icon = typeof row.icon === 'string' && CATEGORY_ICON_REGISTRY[row.icon] ? row.icon : DEFAULT_CATEGORY_ICON;
    items.push({
      id,
      name,
      nameAr: typeof row.nameAr === 'string' ? row.nameAr.trim() : '',
      icon,
      hidden: row.hidden === true,
      locked: row.locked === true,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
    });
  });
  if (!items.length) return clone(DEFAULT_STORE_CATEGORIES);
  return items.sort((a, b) => a.order - b.order);
}

// ── Shared single subscription (all consumers share one Firestore listener) ──
let cache: StoreCategory[] = clone(DEFAULT_STORE_CATEGORIES);
let started = false;
const listeners = new Set<(cats: StoreCategory[]) => void>();

function emit(cats: StoreCategory[]): void {
  cache = cats;
  setKnownCategories(cats.map((c) => c.id));
  listeners.forEach((listener) => listener(cats));
}

function ensureSubscription(): void {
  if (started) return;
  started = true;
  const ref = doc(db, CATEGORIES_COLLECTION, CATEGORIES_DOC);
  onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      emit(data ? parseStoreCategories(data.items) : clone(DEFAULT_STORE_CATEGORIES));
    },
    () => emit(clone(DEFAULT_STORE_CATEGORIES))
  );
}

export function subscribeStoreCategories(callback: (cats: StoreCategory[]) => void): () => void {
  ensureSubscription();
  listeners.add(callback);
  callback(cache);
  return () => {
    listeners.delete(callback);
  };
}

export function peekStoreCategories(): StoreCategory[] {
  return cache;
}

export async function saveStoreCategories(items: StoreCategory[]): Promise<void> {
  const normalized = items.map((item, index) => ({
    id: item.id,
    name: item.name,
    nameAr: item.nameAr ?? '',
    icon: item.icon || DEFAULT_CATEGORY_ICON,
    hidden: item.hidden === true,
    ...(item.locked ? { locked: true } : {}),
    order: index,
  }));
  await setDoc(
    doc(db, CATEGORIES_COLLECTION, CATEGORIES_DOC),
    { items: normalized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Display label for the active language. */
export function categoryLabel(cat: Pick<StoreCategory, 'name' | 'nameAr'>, isAr: boolean): string {
  if (isAr && cat.nameAr) return cat.nameAr;
  return cat.name;
}

/**
 * True when a category tile should open the sale-filtered catalog (`/catalog?sale=1`)
 * instead of its own listing — e.g. the "سلة العروض" / "Sale" category.
 * Matched by name so it keeps working if reordered; rename away from these words to opt out.
 */
export function isSaleCategory(cat: Pick<StoreCategory, 'id' | 'name' | 'nameAr'>): boolean {
  const haystack = `${cat.id ?? ''} ${cat.name ?? ''} ${cat.nameAr ?? ''}`.toLowerCase();
  return ['عروض', 'sale', 'offer'].some((needle) => haystack.includes(needle));
}

/** Find a category by its product-facing id (case-insensitive). */
export function findCategoryById(cats: StoreCategory[], id: string | null | undefined): StoreCategory | null {
  if (!id) return null;
  const needle = id.trim().toLowerCase();
  return cats.find((c) => c.id.toLowerCase() === needle) ?? null;
}
