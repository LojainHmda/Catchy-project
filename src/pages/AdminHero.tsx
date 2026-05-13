import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, collection, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, getDocs, limit } from '../firebase';
import { Plus, Trash2, Image as ImageIcon, MoveUp, MoveDown, Loader2, Upload, ExternalLink, Eye, EyeOff, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { fileToAdminImageDataUrl } from '../lib/images';
import { coerceProductImages, PRODUCT_IMAGE_PLACEHOLDER } from '../lib/productImages';

const SHOWCASE_MAX_PRODUCTS = 4;
const SEARCH_RESULTS_CAP = 12;

const AdminHero = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  /** Per showcase slide: search query for picking products (not a full catalog list). */
  const [pickerQuery, setPickerQuery] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = query(collection(db, 'hero_slides'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      setSlides(snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pq = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(pq);
        if (cancelled) return;
        setAllProducts(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) setAllProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addSlide = async (type: 'standard' | 'new_arrivals' = 'standard') => {
    const maxOrder = slides.reduce((m, s) => Math.max(m, Number(s.order) ?? 0), -1);
    const newSlide = {
      title: type === 'new_arrivals' ? 'New Arrivals' : 'New Slide Title',
      subtitle: type === 'new_arrivals' ? 'Explore Latest Pieces' : 'New Slide Subtitle',
      url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1000',
      order: maxOrder + 1,
      type: type,
      enabled: true,
      productIds: type === 'new_arrivals' ? [] : undefined,
      createdAt: serverTimestamp()
    };
    try {
      await addDoc(collection(db, 'hero_slides'), newSlide);
    } catch (error) {
      console.error('Error adding slide:', error);
    }
  };

  const updateSlide = async (id: string, data: any) => {
    try {
      await updateDoc(doc(db, 'hero_slides', id), data);
    } catch (error) {
      console.error('Error updating slide:', error);
    }
  };

  const deleteSlide = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hero_slides', id));
    } catch (error) {
      console.error('Error deleting slide:', error);
    }
  };

  const moveSlide = async (index: number, direction: 'up' | 'down') => {
    const newSlides = [...slides];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const temp = newSlides[index];
    newSlides[index] = newSlides[targetIndex];
    newSlides[targetIndex] = temp;

    setSlides(newSlides);
    try {
      await Promise.all(
        newSlides.map((s, idx) => updateDoc(doc(db, 'hero_slides', s.id), { order: idx }))
      );
    } catch (error) {
      console.error('Error moving slide:', error);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-catchy" size={48} /></div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight sm:text-3xl">Hero Management</h1>
          <p className="mt-1 text-sm text-gray-500">Homepage hero updates in real time.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 hover:border-catchy hover:text-catchy transition-colors"
          >
            <ExternalLink size={14} />
            Preview home
          </Link>
          <button
            onClick={() => addSlide('standard')}
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow transition-all hover:bg-black"
          >
            <Plus size={16} />
            Add Standard
          </button>
          <button
            onClick={() => addSlide('new_arrivals')}
            className="flex items-center gap-1.5 rounded-xl bg-catchy px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow shadow-catchy/20 transition-all hover:bg-catchy-dark"
          >
            <Plus size={16} />
            Add showcase
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence>
          {slides.map((slide, index) => {
            const isLive = slide.enabled !== false;
            return (
            <motion.div
              key={slide.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm md:flex-row md:items-start',
                isLive ? 'border-gray-100' : 'border-amber-200/80 opacity-[0.88] ring-2 ring-amber-100'
              )}
            >
              <div className="group relative h-36 w-full shrink-0 md:h-auto md:w-40 md:self-stretch md:min-h-[8rem] md:max-h-40">
                <img src={slide.url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="rounded-full bg-white/20 p-2 text-white backdrop-blur-sm">
                    <ImageIcon size={18} />
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-3 p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest',
                      slide.type === 'new_arrivals' ? 'bg-catchy/10 text-catchy' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {slide.type === 'new_arrivals' ? 'Showcase' : 'Standard'}
                  </span>
                  {!isLive && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">
                      Hidden
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Title
                    </label>
                    <input
                      type="text"
                      value={slide.title ?? ''}
                      onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-catchy/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={slide.subtitle ?? ''}
                      onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value })}
                      className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-catchy/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {slide.type === 'new_arrivals' ? 'Background URL' : 'Image URL'}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      type="text"
                      value={slide.url ?? ''}
                      onChange={(e) => updateSlide(slide.id, { url: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-catchy/20"
                      placeholder="https://… or upload"
                    />
                    <label className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-colors hover:border-catchy hover:text-catchy">
                      {uploadingSlideId === slide.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !file.type.startsWith('image/')) return;
                          if (file.size > 15 * 1024 * 1024) {
                            alert('Image must be under 15MB.');
                            return;
                          }
                          setUploadingSlideId(slide.id);
                          try {
                            const dataUrl = await fileToAdminImageDataUrl(file, {
                              maxWidth: 2200,
                              quality: 0.85,
                            });
                            await updateSlide(slide.id, { url: dataUrl });
                          } catch (err) {
                            console.error(err);
                            alert('Could not process that image.');
                          } finally {
                            setUploadingSlideId(null);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {slide.type === 'new_arrivals' && (() => {
                  const q = pickerQuery[slide.id] ?? '';
                  const needle = q.trim().toLowerCase();
                  const selectedIds = Array.isArray(slide.productIds)
                    ? slide.productIds.filter(Boolean)
                    : [];
                  const searchHits =
                    needle.length > 0
                      ? allProducts
                          .filter((p) => !selectedIds.includes(p.id))
                          .filter((p) => String(p.name ?? '').toLowerCase().includes(needle))
                          .slice(0, SEARCH_RESULTS_CAP)
                      : [];
                  return (
                  <div className="space-y-2 rounded-xl border border-catchy/20 bg-catchy/5 p-3">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-catchy">
                        Products (max {SHOWCASE_MAX_PRODUCTS})
                      </label>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => {
                            const ids = allProducts.slice(0, SHOWCASE_MAX_PRODUCTS).map((p) => p.id);
                            updateSlide(slide.id, { productIds: ids });
                          }}
                          disabled={allProducts.length === 0}
                          className="text-catchy hover:text-catchy-dark disabled:opacity-40"
                        >
                          Newest {SHOWCASE_MAX_PRODUCTS}
                        </button>
                        <span className="text-gray-300">·</span>
                        <button
                          type="button"
                          onClick={() => {
                            updateSlide(slide.id, { productIds: [] });
                            setPickerQuery((prev) => ({ ...prev, [slide.id]: '' }));
                          }}
                          className="text-gray-500 hover:text-gray-800"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {selectedIds.length > SHOWCASE_MAX_PRODUCTS && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                        <span>Only the first {SHOWCASE_MAX_PRODUCTS} appear on the homepage.</span>
                        <button
                          type="button"
                          className="font-black uppercase tracking-wider text-catchy hover:text-catchy-dark"
                          onClick={() =>
                            updateSlide(slide.id, { productIds: selectedIds.slice(0, SHOWCASE_MAX_PRODUCTS) })
                          }
                        >
                          Keep first {SHOWCASE_MAX_PRODUCTS}
                        </button>
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-gray-500">
                        Selected {selectedIds.length}/{SHOWCASE_MAX_PRODUCTS}
                      </p>
                      {selectedIds.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-gray-200 bg-white/80 px-3 py-2 text-center text-[11px] text-gray-500">
                          Search and tap a result to add.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedIds.map((id) => {
                            const p = allProducts.find((x) => x.id === id);
                            const thumb = p
                              ? coerceProductImages(p)[0] ?? PRODUCT_IMAGE_PLACEHOLDER
                              : PRODUCT_IMAGE_PLACEHOLDER;
                            const label = p?.name ?? id;
                            return (
                              <div
                                key={id}
                                className="flex items-center gap-1.5 rounded-lg border border-catchy/30 bg-white py-1 pl-1 pr-1 text-[11px] shadow-sm"
                              >
                                <img src={thumb} alt="" className="h-8 w-8 rounded-md object-cover" />
                                <span className="max-w-[120px] truncate font-bold text-gray-800">{label}</span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${label}`}
                                  onClick={() =>
                                    updateSlide(slide.id, {
                                      productIds: selectedIds.filter((x) => x !== id),
                                    })
                                  }
                                  className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {allProducts.length === 0 ? (
                      <p className="text-xs text-gray-500">No products in catalog.</p>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                            aria-hidden
                          />
                          <input
                            type="search"
                            value={q}
                            onChange={(e) =>
                              setPickerQuery((prev) => ({ ...prev, [slide.id]: e.target.value }))
                            }
                            placeholder="Search by name…"
                            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-2 text-xs font-medium text-gray-900 outline-none placeholder:text-gray-400 focus:border-catchy focus:ring-1 focus:ring-catchy/30"
                          />
                        </div>
                        {needle.length === 0 ? null : searchHits.length === 0 ? (
                          <p className="text-[11px] text-gray-500">No matches.</p>
                        ) : (
                          <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-gray-100 bg-white p-1.5">
                            {searchHits.map((p) => {
                              const thumb = coerceProductImages(p)[0] ?? PRODUCT_IMAGE_PLACEHOLDER;
                              const full = selectedIds.length >= SHOWCASE_MAX_PRODUCTS;
                              return (
                                <li key={p.id}>
                                  <button
                                    type="button"
                                    disabled={full}
                                    onClick={() => {
                                      if (full || selectedIds.includes(p.id)) return;
                                      updateSlide(slide.id, {
                                        productIds: [...selectedIds, p.id],
                                      });
                                      setPickerQuery((prev) => ({ ...prev, [slide.id]: '' }));
                                    }}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-left text-[11px] transition-colors',
                                      full
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'hover:border-catchy/30 hover:bg-catchy/5'
                                    )}
                                  >
                                    <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                                    <span className="min-w-0 flex-1 truncate font-bold text-gray-800">{p.name}</span>
                                    <span className="shrink-0 font-bold text-gray-400">£{p.price}</span>
                                    <Plus className="h-3.5 w-3.5 shrink-0 text-catchy" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveSlide(index, 'up')}
                      disabled={index === 0}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-catchy disabled:opacity-20"
                    >
                      <MoveUp size={18} />
                    </button>
                    <button
                      onClick={() => moveSlide(index, 'down')}
                      disabled={index === slides.length - 1}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-catchy disabled:opacity-20"
                    >
                      <MoveDown size={18} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSlide(slide.id, { enabled: slide.enabled === false })}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors',
                        isLive
                          ? 'border border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-300 hover:bg-amber-50'
                          : 'border border-catchy bg-catchy text-white hover:bg-catchy-dark'
                      )}
                    >
                      {isLive ? <EyeOff size={14} /> : <Eye size={14} />}
                      {isLive ? 'Off' : 'On'}
                    </button>
                    <button
                      onClick={() => deleteSlide(slide.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminHero;
