import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
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

export const auth = getAuth(app);
export const db = getFirestore(app);

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
  serverTimestamp,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
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
