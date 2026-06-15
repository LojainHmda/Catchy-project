import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, ExternalLink, LayoutGrid, RefreshCw, Pencil, MoveUp, MoveDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, doc, getDoc, getDocs, query, orderBy, limit } from '../firebase';
import { cn } from '../lib/utils';
import { getCoordinateImages, primaryCoordinateImage } from '../lib/coordinateImages';
import {
  createCoordinateLook,
  deleteCoordinateLook,
  fetchAllCoordinateLooks,
  reorderCoordinateLooks,
  subscribeCoordinateLooks,
  updateCoordinateLook,
} from '../lib/coordinatesService';
import { coordinateLookStats, coordinateSizesSummary, coordinateLookStatus } from '../lib/coordinatesValidation';
import { resolveCoordinate } from '../lib/coordinateResolve';
import { toastFirestoreWriteError } from '../lib/firestoreErrors';
import CoordinateEditDrawer, { type CoordinateLookDraft } from '../components/admin/CoordinateEditDrawer';
import type { CoordinateLook } from '../types/coordinates';

const AdminCoordinates = () => {
  const [looks, setLooks] = useState<CoordinateLook[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [linkedCache, setLinkedCache] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [listenError, setListenError] = useState<string | null>(null);
  const [editingLook, setEditingLook] = useState<CoordinateLook | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const finishLoading = () => {
      if (!cancelled) setLoading(false);
    };

    // One-shot fetch so the page never hangs if the listener stalls
    fetchAllCoordinateLooks()
      .then((data) => {
        if (!cancelled) {
          setLooks(data);
          finishLoading();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setListenError(error instanceof Error ? error.message : String(error));
          finishLoading();
        }
      });

    unsub = subscribeCoordinateLooks(
      (data) => {
        if (cancelled) return;
        setLooks(data);
        setListenError(null);
        finishLoading();
      },
      (error) => {
        if (cancelled) return;
        setListenError(error instanceof Error ? error.message : String(error));
        toastFirestoreWriteError(error, 'Could not load coordinates');
        finishLoading();
      }
    );

    const timeout = window.setTimeout(finishLoading, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      unsub?.();
    };
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const pq = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(200));
      const snap = await getDocs(pq);
      setAllProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setAllProducts([]);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const allLinkedIds = useMemo(() => {
    const ids = new Set<string>();
    looks.forEach((l) => l.productIds?.forEach((id) => ids.add(id)));
    return [...ids];
  }, [looks]);

  useEffect(() => {
    const known = new Set(allProducts.map((p) => p.id));
    const missing = allLinkedIds.filter((id) => !known.has(id));
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const fetched: Record<string, any> = {};
      await Promise.all(
        missing.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'products', id));
            if (snap.exists()) fetched[id] = { id: snap.id, ...snap.data() };
          } catch { /* skip */ }
        })
      );
      if (!cancelled) setLinkedCache((p) => ({ ...p, ...fetched }));
    })();
    return () => { cancelled = true; };
  }, [allLinkedIds, allProducts]);

  const productsById = useMemo(() => {
    const map = { ...linkedCache };
    allProducts.forEach((p) => { map[p.id] = p; });
    return map;
  }, [allProducts, linkedCache]);

  const stats = useMemo(() => coordinateLookStats(looks, productsById), [looks, productsById]);

  const closeEditor = () => {
    setEditingLook(null);
    setIsNewDraft(false);
  };

  const openNewSet = () => {
    const maxOrder = looks.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), -1);
    setEditingLook({
      id: '',
      title: 'New Coordinate Set',
      titleAr: 'تنسيق جديد',
      image: '',
      images: [],
      productIds: [],
      priceAutoSync: true,
      sortOrder: maxOrder + 1,
      published: false,
    });
    setIsNewDraft(true);
  };

  const openEdit = (look: CoordinateLook) => {
    setEditingLook(look);
    setIsNewDraft(false);
  };

  const removeLook = async (id: string) => {
    if (isNewDraft) {
      closeEditor();
      return;
    }
    if (!window.confirm('Delete this coordinate set permanently?')) return;
    try {
      await deleteCoordinateLook(id);
      if (editingLook?.id === id) closeEditor();
      toast.success('Deleted');
    } catch (error) {
      toastFirestoreWriteError(error, 'Could not delete');
    }
  };

  const moveLook = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= looks.length) return;
    const reordered = [...looks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await reorderCoordinateLooks(reordered.map((l) => l.id));
    } catch {
      toast.error('Could not reorder');
    }
  };

  const handleSave = async (id: string, draft: CoordinateLookDraft, publish: boolean) => {
    setSaving(true);
    try {
      if (isNewDraft) {
        await createCoordinateLook({
          title: draft.title,
          titleAr: draft.titleAr || undefined,
          image: '',
          images: [],
          productIds: draft.productIds,
          price: draft.price,
          priceAutoSync: draft.priceAutoSync,
          sortOrder: editingLook?.sortOrder ?? looks.length,
          published: publish,
        });
        setIsNewDraft(false);
        setEditingLook(null);
        toast.success(publish ? 'Published to catalog' : 'Set saved');
        return;
      }

      const current = looks.find((l) => l.id === id);
      await updateCoordinateLook(id, {
        title: draft.title,
        titleAr: draft.titleAr || undefined,
        price: draft.price,
        priceAutoSync: draft.priceAutoSync,
        productIds: draft.productIds,
        published: publish ? true : current?.published ?? false,
      });
      toast.success(publish ? 'Published to catalog' : 'Draft saved');
      if (publish) closeEditor();
    } catch (error) {
      toastFirestoreWriteError(error, publish ? 'Could not publish' : 'Could not save');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-catchy" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">Coordinates</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Build sets from product photos — collage and sizes come from linked items. Click Save & publish to go live.
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span><strong className="text-gray-900">{stats.total}</strong> total</span>
            <span><strong className="text-emerald-700">{stats.live}</strong> live</span>
            <span><strong className="text-amber-700">{stats.hidden}</strong> hidden</span>
            <span><strong className="text-gray-500">{stats.draft}</strong> draft</span>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadProducts} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw size={14} /> Products
          </button>
          <Link to="/catalog?category=Coordinates" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink size={14} /> Catalog
          </Link>
          <button type="button" onClick={openNewSet} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white hover:bg-catchy-dark">
            <Plus size={14} />
            Add set
          </button>
        </div>
      </header>

      {listenError ? (
        <p className="mb-3 text-xs text-amber-700">Sync issue — deploy Firestore rules if this persists.</p>
      ) : null}

      {looks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-900">No coordinate sets yet</p>
          <button type="button" onClick={openNewSet} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-catchy px-3 text-xs font-semibold text-white">
            <Plus size={14} /> Add set
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2.5 w-12" />
                <th className="px-3 py-2.5">Set</th>
                <th className="px-3 py-2.5 w-24">Price</th>
                <th className="px-3 py-2.5 w-28">Sizes</th>
                <th className="px-3 py-2.5 w-16">Items</th>
                <th className="px-3 py-2.5 w-20">Status</th>
                <th className="px-3 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {looks.map((look, index) => {
                const linked = (look.productIds ?? []).map((id) => productsById[id]).filter(Boolean);
                const resolved = resolveCoordinate(look, linked);
                const photoCount = getCoordinateImages(look, linked).length;
                const status = coordinateLookStatus(look, productsById);
                return (
                  <tr key={look.id} className="group hover:bg-gray-50/60">
                    <td className="px-2 py-2">
                      <div className="h-10 w-8 overflow-hidden rounded bg-gray-100 ring-1 ring-black/5">
                        <img src={primaryCoordinateImage(look, linked)} alt="" className="h-full w-full object-cover" />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900 line-clamp-1">{look.title}</p>
                      <p className="text-[11px] text-gray-400">{photoCount} photo{photoCount === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-gray-900">
                      {resolved ? `ILS ${resolved.price}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{coordinateSizesSummary(look, linked)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{linked.length}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        status === 'live' && 'bg-emerald-50 text-emerald-700',
                        status === 'hidden' && 'bg-amber-50 text-amber-700',
                        status === 'draft' && 'bg-gray-100 text-gray-500'
                      )}>
                        {status === 'live' ? 'Live' : status === 'hidden' ? 'Hidden' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5 opacity-80 group-hover:opacity-100">
                        <button type="button" onClick={() => moveLook(index, -1)} disabled={index === 0} className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move up">
                          <MoveUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveLook(index, 1)} disabled={index === looks.length - 1} className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move down">
                          <MoveDown size={14} />
                        </button>
                        <button type="button" onClick={() => openEdit(look)} className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:border-catchy">
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button type="button" onClick={() => removeLook(look.id)} className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CoordinateEditDrawer
        look={editingLook}
        open={Boolean(editingLook)}
        isNew={isNewDraft}
        onClose={closeEditor}
        productsById={productsById}
        saving={saving}
        onSave={handleSave}
        onDelete={removeLook}
        onRefreshProducts={loadProducts}
      />
    </div>
  );
};

export default AdminCoordinates;
