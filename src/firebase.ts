import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

function getOrInitApp(): FirebaseApp {
  if (getApps().length > 0) return getApps()[0]!;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error(
      'Firebase is not configured. Create a .env file with VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID (see .env.example).'
    );
  }
  return initializeApp({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });
}

const app = getOrInitApp();

let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  db = getFirestore(app);
}

export const auth = getAuth(app);
export { db };

// Storage is optional — wrap so a missing bucket never breaks the rest of the app
let _storage: ReturnType<typeof getStorage> | null = null;
try { _storage = getStorage(app); } catch { /* Storage not configured */ }
export const storage = _storage as ReturnType<typeof getStorage>;
export { storageRef, uploadBytesResumable, getDownloadURL, deleteObject };

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  runTransaction,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
};

/** Merge one category image into `site_settings/shop_category_tiles` (Firestore replaces nested maps on shallow update). */
export async function mergeShopCategoryTileImage(category: string, url: string | null) {
  const ref = doc(db, 'site_settings', 'shop_category_tiles');
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const prev = (snap.data()?.images as Record<string, string> | undefined) ?? {};
    const images = { ...prev };
    if (url == null || url === '') delete images[category];
    else images[category] = url;
    transaction.set(ref, { images }, { merge: true });
  });
}
