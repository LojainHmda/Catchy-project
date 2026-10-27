import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
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
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
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
  documentId,
  deleteField,
  getCountFromServer,
  getAggregateFromServer,
  count,
  sum,
} from 'firebase/firestore';
import { DEFAULT_FIRESTORE_DATABASE_ID, resolveFirestoreDatabaseId } from './lib/firestoreDatabaseId';
import { resolveEmulatorSettings } from './lib/emulatorConfig';

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

const firestoreDatabaseId = resolveFirestoreDatabaseId(import.meta.env.VITE_FIRESTORE_DATABASE_ID);
const db: ReturnType<typeof getFirestore> =
  firestoreDatabaseId === DEFAULT_FIRESTORE_DATABASE_ID
    ? getFirestore(app)
    : getFirestore(app, firestoreDatabaseId);

export const auth = getAuth(app);

// Local Firebase Emulator mode (npm run dev:emulator only). Throws — so the app
// refuses to start — if emulator settings are present but unsafe; returns null in
// normal development and production, where nothing below runs.
const emulatorSettings = resolveEmulatorSettings(import.meta.env, import.meta.env.DEV);
if (emulatorSettings) {
  connectFirestoreEmulator(db, emulatorSettings.firestore.host, emulatorSettings.firestore.port);
  connectAuthEmulator(auth, emulatorSettings.authUrl);
  console.warn(`[emulator] Using LOCAL Firebase emulators for project ${emulatorSettings.projectId}.`);
}
/** True only in the local emulator dev server. Features that would reach real services check this. */
export const firebaseEmulatorMode = emulatorSettings !== null;

export { app, db };

// Firebase Storage is only used by one admin page (AdminHeroVideo) — its SDK is
// loaded on demand from src/lib/firebaseStorage.ts instead of being imported here,
// so its code doesn't ship to every visitor.

export {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromCache,
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
  documentId,
  deleteField,
  getCountFromServer,
  getAggregateFromServer,
  count,
  sum,
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
