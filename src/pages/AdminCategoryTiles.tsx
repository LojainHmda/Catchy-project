import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, doc, onSnapshot, mergeShopCategoryTileImage } from '../firebase';
import { ExternalLink, Link2, Loader2, RotateCcw, Upload } from 'lucide-react';
import { SHOP_TILES } from '../components/ShopCategoryGrid';
import { useLanguage } from '../context/LanguageContext';
import { CATEGORY_KEYS } from '../constants';
import { fileToAdminImageDataUrl } from '../lib/images';
import { cn } from '../lib/utils';

const AdminCategoryTiles = () => {
  const { t } = useLanguage();
  const [images, setImages] = useState<Record<string, string>>({});
  const [urlDraftByCategory, setUrlDraftByCategory] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'site_settings', 'shop_category_tiles');
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      setImages(d?.images && typeof d.images === 'object' ? d.images : {});
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setUrlDraftByCategory((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const t of SHOP_TILES) {
        next[t.category] = images[t.category] ?? '';
      }
      return next;
    });
  }, [images]);

  const effectiveUrl = (category: string, fallback: string) => images[category] || fallback;

  const patchImage = async (category: string, url: string | null) => {
    await mergeShopCategoryTileImage(category, url);
  };

  const applyUrlForCategory = async (category: string) => {
    const raw = (urlDraftByCategory[category] ?? '').trim();
    if (!raw) {
      alert('Paste an image URL first.');
      return;
    }
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith('data:image/')) {
      alert('Use an http(s) link or a data:image URL.');
      return;
    }
    setUploadingCategory(category);
    try {
      await patchImage(category, raw);
    } finally {
      setUploadingCategory(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-catchy" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">Category tile images</h1>
          <p className="mt-1 text-sm text-gray-500">
            Backgrounds for the shop-by-category grid on the home page (#products-grid). Changes apply immediately.
          </p>
        </div>
        <Link
          to="/#products-grid"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 transition-colors hover:border-catchy hover:text-catchy"
        >
          <ExternalLink size={14} />
          Preview section
        </Link>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {SHOP_TILES.map((tile) => {
          const src = effectiveUrl(tile.category, tile.image);
          const label = t(CATEGORY_KEYS[tile.category] || tile.category);
          const isCustom = Boolean(images[tile.category]);
          return (
            <div
              key={tile.category}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[16/10] bg-neutral-100">
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy"/>
                {isCustom && (
                  <span className="absolute left-3 top-3 rounded-full bg-catchy px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Custom
                  </span>
                )}
              </div>
              <div className="space-y-3 p-4">
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="truncate text-xs text-gray-400" title={tile.category}>
                  Key: {tile.category}
                </p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://… or data:image/…"
                      value={urlDraftByCategory[tile.category] ?? ''}
                      onChange={(e) =>
                        setUrlDraftByCategory((d) => ({ ...d, [tile.category]: e.target.value }))
                      }
                      disabled={uploadingCategory !== null}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-catchy focus:ring-1 focus:ring-catchy/30 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={uploadingCategory !== null}
                      onClick={() => applyUrlForCategory(tile.category)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
                    >
                      {uploadingCategory === tile.category ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Apply
                    </button>
                  </div>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-700 transition hover:border-catchy hover:bg-white hover:text-catchy">
                  {uploadingCategory === tile.category ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Replace image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCategory !== null}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !file.type.startsWith('image/')) return;
                      if (file.size > 15 * 1024 * 1024) {
                        alert('Image must be under 15MB.');
                        return;
                      }
                      setUploadingCategory(tile.category);
                      try {
                        const dataUrl = await fileToAdminImageDataUrl(file, { maxWidth: 2200, quality: 0.85 });
                        await patchImage(tile.category, dataUrl);
                      } catch (err) {
                        console.error(err);
                        alert('Could not process that image.');
                      } finally {
                        setUploadingCategory(null);
                      }
                    }}
                  />
                </label>
                </div>
                <button
                  type="button"
                  disabled={!isCustom || uploadingCategory !== null}
                  onClick={() => patchImage(tile.category, null)}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2 text-xs font-bold text-gray-600 transition hover:border-gray-300 hover:bg-gray-50',
                    !isCustom && 'pointer-events-none opacity-40'
                  )}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to default
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminCategoryTiles;
