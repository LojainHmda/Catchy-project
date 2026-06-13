import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
} from '../firebase';
import {
  DEFAULT_COORDINATES_PAGE,
  type CoordinateLook,
  type CoordinatesPageSettings,
} from '../types/coordinates';
import { normalizeCoordinateLook, isLookVisibleToCustomers } from './coordinatesValidation';

const LOOKS_COLLECTION = 'coordinate_looks';
const PAGE_SETTINGS_DOC = 'coordinates';

function mapLookDoc(id: string, data: Record<string, unknown>): CoordinateLook {
  return normalizeCoordinateLook({ id, ...data } as Partial<CoordinateLook> & { id: string });
}

export function subscribeCoordinateLooks(
  onData: (looks: CoordinateLook[]) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, LOOKS_COLLECTION), orderBy('sortOrder', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      try {
        const looks = snap.docs.map((d) => mapLookDoc(d.id, d.data() as Record<string, unknown>));
        onData(looks);
      } catch (error) {
        console.error('coordinate_looks map error:', error);
        onError?.(error);
        onData([]);
      }
    },
    (error) => {
      console.error('coordinate_looks subscription error:', error);
      onError?.(error);
      onData([]);
    }
  );
}

export function subscribeCoordinatesPageSettings(onData: (settings: CoordinatesPageSettings) => void) {
  const ref = doc(db, 'site_settings', PAGE_SETTINGS_DOC);
  return onSnapshot(
    ref,
    (snap) => {
      const d = snap.data();
      if (!d) {
        onData(DEFAULT_COORDINATES_PAGE);
        return;
      }
      onData({
        heroTitle: typeof d.heroTitle === 'string' ? d.heroTitle : DEFAULT_COORDINATES_PAGE.heroTitle,
        heroTitleAr: typeof d.heroTitleAr === 'string' ? d.heroTitleAr : DEFAULT_COORDINATES_PAGE.heroTitleAr,
        heroSubtitle:
          typeof d.heroSubtitle === 'string' ? d.heroSubtitle : DEFAULT_COORDINATES_PAGE.heroSubtitle,
        heroSubtitleAr:
          typeof d.heroSubtitleAr === 'string' ? d.heroSubtitleAr : DEFAULT_COORDINATES_PAGE.heroSubtitleAr,
        heroImage: typeof d.heroImage === 'string' ? d.heroImage : DEFAULT_COORDINATES_PAGE.heroImage,
      });
    },
    () => onData(DEFAULT_COORDINATES_PAGE)
  );
}

export async function saveCoordinatesPageSettings(settings: CoordinatesPageSettings) {
  await setDoc(
    doc(db, 'site_settings', PAGE_SETTINGS_DOC),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function createCoordinateLook(partial: Omit<CoordinateLook, 'id'>) {
  return addDoc(collection(db, LOOKS_COLLECTION), {
    ...partial,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCoordinateLook(id: string, patch: Partial<CoordinateLook>) {
  const { id: _id, ...rest } = patch as CoordinateLook;
  await updateDoc(doc(db, LOOKS_COLLECTION, id), { ...rest, updatedAt: serverTimestamp() });
}

export async function deleteCoordinateLook(id: string) {
  await deleteDoc(doc(db, LOOKS_COLLECTION, id));
}

export async function fetchAllCoordinateLooks(): Promise<CoordinateLook[]> {
  const q = query(collection(db, LOOKS_COLLECTION), orderBy('sortOrder', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapLookDoc(d.id, d.data() as Record<string, unknown>));
}

/** Reassign sequential sortOrder values after drag/reorder. */
export async function reorderCoordinateLooks(orderedIds: string[]) {
  await Promise.all(orderedIds.map((id, index) => updateCoordinateLook(id, { sortOrder: index })));
}

export function publishedLooks(looks: CoordinateLook[]): CoordinateLook[] {
  return looks.filter(isLookVisibleToCustomers);
}

export async function fetchCoordinateLook(id: string): Promise<CoordinateLook | null> {
  const snap = await getDoc(doc(db, LOOKS_COLLECTION, id));
  if (!snap.exists()) return null;
  return mapLookDoc(snap.id, snap.data() as Record<string, unknown>);
}
