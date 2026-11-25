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

export type SubscribeAnnouncementOptions = {
  /**
   * Called instead of delivering the defaults when the settings cannot be read. The
   * storefront uses it to keep the bar hidden: a bar the owner switched off must never
   * appear just because its setting failed to load.
   */
  onError?: (error: unknown) => void;
  /**
   * Deliver only a real answer: skip an "empty" snapshot that comes from the local cache
   * (offline / server not reached yet), which would otherwise look like "never configured
   * → default on".
   */
  serverConfirmed?: boolean;
};

/** Subscribe to live announcement-bar settings. Returns an unsubscribe function. */
export function subscribeAnnouncement(
  cb: (settings: AnnouncementSettings) => void,
  options: SubscribeAnnouncementOptions = {}
): () => void {
  const ref = doc(db, DOC.collection, DOC.id);
  return onSnapshot(
    ref,
    (snap) => {
      const fromCache = snap.metadata.fromCache; // read first: exists() narrows the type below
      if (options.serverConfirmed && !snap.exists() && fromCache) return;
      cb(fromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined));
    },
    (error) => (options.onError ? options.onError(error) : cb(ANNOUNCEMENT_DEFAULTS))
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
