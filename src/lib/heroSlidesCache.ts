import {
  collection,
  db,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from '../firebase';

export interface HeroSlide {
  id?: string;
  url?: string;
  image?: string;
  title?: string;
  titleAr?: string;
  subtitle?: string;
  subtitleAr?: string;
  type?: 'new_arrivals' | 'standard';
  order?: number;
  enabled?: boolean;
  productIds?: string[];
}

const CACHE_KEY = 'catchy:hero-slides:v2';
const LEGACY_CACHE_KEY = 'catchy:hero-slides:v1';

export function normalizeHeroSlides(raw: HeroSlide[]): HeroSlide[] {
  return raw
    .filter((s) => s.enabled !== false)
    .filter((s) => !!(s.url || s.image))
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function mapHeroSlideDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): HeroSlide[] {
  return docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as HeroSlide[];
}

export function readCachedHeroSlides(): HeroSlide[] {
  try {
    const raw =
      localStorage.getItem(CACHE_KEY) ??
      sessionStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((slide) => slide && typeof slide === 'object') as HeroSlide[];
  } catch {
    return [];
  }
}

export function writeCachedHeroSlides(slides: HeroSlide[]) {
  if (slides.length === 0) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(slides));
  } catch {
    // ignore quota / private browsing
  }
}

export function preloadHeroSlideImages(slides: HeroSlide[]) {
  slides.forEach((slide) => {
    const url = slide.url || slide.image;
    if (!url) return;
    const img = new Image();
    img.src = url;
  });
}

type HeroSlidesListener = (slides: HeroSlide[], ready: boolean) => void;

let cachedSlides: HeroSlide[] = readCachedHeroSlides();
let ready = cachedSlides.length > 0;
const listeners = new Set<HeroSlidesListener>();
let unsubscribeFirestore: (() => void) | null = null;

function notify() {
  listeners.forEach((listener) => listener(cachedSlides, ready));
}

function applyHeroSlides(fetched: HeroSlide[]) {
  if (fetched.length > 0) {
    cachedSlides = fetched;
    writeCachedHeroSlides(fetched);
    preloadHeroSlideImages(normalizeHeroSlides(fetched));
  }
  ready = true;
  notify();
}

function shouldIgnoreSnapshot(docs: HeroSlide[], fromCache: boolean, hasPendingWrites: boolean) {
  if (docs.length > 0) return false;
  // Ignore transient empty reads while Firestore warms up.
  return fromCache || hasPendingWrites;
}

export function getHeroSlidesSnapshot(): { slides: HeroSlide[]; ready: boolean } {
  return { slides: cachedSlides, ready };
}

export function subscribeHeroSlides(listener: HeroSlidesListener): () => void {
  listeners.add(listener);
  listener(cachedSlides, ready);

  if (!unsubscribeFirestore) {
    const heroQ = query(collection(db, 'hero_slides'), orderBy('order', 'asc'));

    void getDocs(heroQ)
      .then((snap) => {
        const fetched = mapHeroSlideDocs(snap.docs);
        if (fetched.length === 0 && cachedSlides.length > 0) {
          ready = true;
          notify();
          return;
        }
        applyHeroSlides(fetched);
      })
      .catch(() => {
        ready = true;
        notify();
      });

    unsubscribeFirestore = onSnapshot(
      heroQ,
      (snapshot) => {
        const fetched = mapHeroSlideDocs(snapshot.docs);
        if (
          shouldIgnoreSnapshot(
            fetched,
            snapshot.metadata.fromCache,
            snapshot.metadata.hasPendingWrites
          )
        ) {
          return;
        }
        applyHeroSlides(fetched);
      },
      () => {
        ready = true;
        notify();
      }
    );
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  };
}

// Warm image cache as early as possible on app boot.
preloadHeroSlideImages(normalizeHeroSlides(cachedSlides));
