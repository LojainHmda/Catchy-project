import { db, doc, onSnapshot, setDoc } from '../firebase';

const DOC = { collection: 'site_settings', id: 'site' } as const;

export interface AnnouncementSettings {
  enabled: boolean;
  textAr: string;
  textEn: string;
}

export const ANNOUNCEMENT_DEFAULTS: AnnouncementSettings = {
  enabled: true,
  textAr: 'توصيل مجاني للطلبيات فوق 300 شيكل',
  textEn: 'Free shipping on orders over 300 ILS',
};

/** Map a raw Firestore doc payload to AnnouncementSettings, applying defaults. */
function fromDoc(data: Record<string, unknown> | undefined): AnnouncementSettings {
  if (!data) return ANNOUNCEMENT_DEFAULTS;
  const textAr = typeof data.announcementTextAr === 'string' && data.announcementTextAr.trim()
    ? data.announcementTextAr
    : ANNOUNCEMENT_DEFAULTS.textAr;
  const textEn = typeof data.announcementTextEn === 'string' && data.announcementTextEn.trim()
    ? data.announcementTextEn
    : ANNOUNCEMENT_DEFAULTS.textEn;
  return {
    enabled: data.announcementEnabled !== false,
    textAr,
    textEn,
  };
}

/** Subscribe to live announcement-bar settings. Returns an unsubscribe function. */
export function subscribeAnnouncement(
  cb: (settings: AnnouncementSettings) => void
): () => void {
  const ref = doc(db, DOC.collection, DOC.id);
  return onSnapshot(
    ref,
    (snap) => cb(fromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined)),
    () => cb(ANNOUNCEMENT_DEFAULTS)
  );
}

/** Persist a partial update to the announcement-bar settings (merge). */
export async function saveAnnouncement(settings: AnnouncementSettings): Promise<void> {
  const ref = doc(db, DOC.collection, DOC.id);
  await setDoc(
    ref,
    {
      announcementEnabled: settings.enabled,
      announcementTextAr: settings.textAr,
      announcementTextEn: settings.textEn,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}
