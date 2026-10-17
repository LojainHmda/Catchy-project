import React, { useEffect, useRef, useState } from 'react';
import { db, doc, setDoc, onSnapshot } from '../firebase';
import { uploadFileResumable, deleteStorageObject } from '../lib/firebaseStorage';
import { toast } from 'sonner';
import { Upload, Trash2, Loader2, Video, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLanguage } from '../context/LanguageContext';

const STORAGE_PATH_PREFIX = 'hero/hero-video';
const FIRESTORE_DOC = { collection: 'site_settings', id: 'hero' };

const AdminHeroVideo = () => {
  const { t } = useLanguage();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ref = doc(db, FIRESTORE_DOC.collection, FIRESTORE_DOC.id);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setCurrentUrl(d.videoUrl || null);
        setCurrentPath(d.storagePath || null);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const uploadFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error(t('admin.heroVideo.invalidFileType'));
      return;
    }
    if (file.size > 300 * 1024 * 1024) {
      toast.error(t('admin.heroVideo.tooLarge'));
      return;
    }

    setUploading(true);
    setProgress(0);

    const ext = file.name.split('.').pop() ?? 'mp4';
    const path = `${STORAGE_PATH_PREFIX}-${Date.now()}.${ext}`;

    uploadFileResumable(path, file, setProgress).then(
      async (url) => {
        try {
          if (currentPath) {
            try { await deleteStorageObject(currentPath); } catch { /* already gone */ }
          }

          await setDoc(
            doc(db, FIRESTORE_DOC.collection, FIRESTORE_DOC.id),
            { videoUrl: url, storagePath: path, updatedAt: new Date().toISOString() },
            { merge: true }
          );

          toast.success(t('admin.heroVideo.toastUpdated'));
        } catch (err) {
          toast.error(t('admin.heroVideo.saveUrlFailed'));
        } finally {
          setUploading(false);
          setProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      (err: Error) => {
        toast.error(t('admin.heroVideo.uploadFailed'), { description: err.message });
        setUploading(false);
        setProgress(0);
      }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async () => {
    if (!confirm(t('admin.heroVideo.confirmRemove'))) return;
    setDeleting(true);
    try {
      if (currentPath) {
        try { await deleteStorageObject(currentPath); } catch { /* already gone */ }
      }
      await setDoc(
        doc(db, FIRESTORE_DOC.collection, FIRESTORE_DOC.id),
        { videoUrl: null, storagePath: null },
        { merge: true }
      );
      toast.success(t('admin.heroVideo.toastRemoved'));
    } catch {
      toast.error(t('admin.heroVideo.removeFailed'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-8">
      {/* Header */}
      <header>
        <h1 className="mb-1 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
          {t('admin.nav.heroVideo')}
        </h1>
        <p className="text-sm font-medium text-gray-400">
          {t('admin.heroVideo.subtitle')}
        </p>
      </header>

      {/* Current video */}
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
        <h2 className="mb-5 text-lg font-black tracking-tight text-gray-900">{t('admin.heroVideo.currentHeading')}</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm font-medium">{t('admin.common.loading')}</span>
          </div>
        ) : currentUrl ? (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl bg-black aspect-video max-h-72">
              <video
                src={currentUrl}
                controls
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700">{t('admin.heroVideo.liveOnHomepage')}</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:border-catchy hover:text-catchy disabled:opacity-50"
              >
                <RefreshCw size={13} />
                {t('admin.products.form.replace')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {t('admin.common.remove')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
            <Video size={28} className="shrink-0 text-gray-300" />
            <div>
              <p className="text-sm font-bold text-gray-500">{t('admin.heroVideo.noVideoSet')}</p>
              <p className="text-xs text-gray-400">{t('admin.heroVideo.usingDefault')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Upload section */}
      <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
        <h2 className="mb-5 text-lg font-black tracking-tight text-gray-900">
          {currentUrl ? t('admin.heroVideo.replaceVideoHeading') : t('admin.heroVideo.uploadVideoHeading')}
        </h2>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {/* Drag & drop zone */}
        <button
          type="button"
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          disabled={uploading}
          className={cn(
            'relative w-full rounded-2xl border-2 border-dashed p-10 text-center transition-all',
            dragOver
              ? 'border-catchy bg-emerald-50'
              : 'border-gray-200 bg-gray-50 hover:border-catchy hover:bg-emerald-50/40',
            uploading && 'pointer-events-none'
          )}
        >
          {uploading ? (
            <div className="space-y-4">
              <Loader2 size={32} className="mx-auto animate-spin text-catchy" />
              <p className="text-sm font-bold text-gray-700">{t('admin.heroVideo.uploadingPercent').replace('{n}', String(progress))}</p>
              <div className="mx-auto max-w-xs overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-catchy transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                <Upload size={24} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700">
                  {t('admin.heroVideo.dragDropHint')}{' '}
                  <span className="text-catchy underline underline-offset-2">{t('admin.heroVideo.browse')}</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">{t('admin.heroVideo.formatsHint')}</p>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Deploy note */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-bold text-amber-800">{t('admin.heroVideo.deployNoteHeading')}</p>
        <p className="mt-0.5 text-xs text-amber-700">
          {t('admin.heroVideo.deployCmdPrefix')} <code className="rounded bg-amber-100 px-1 font-mono">firebase deploy --only storage</code> {t('admin.heroVideo.deployCmdSuffix')}
        </p>
      </div>
    </div>
  );
};

export default AdminHeroVideo;
