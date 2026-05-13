
import { getFromStorage, saveToStorage, STORAGE_KEYS, initStorage } from './lib/storage';

// Initialize storage
if (typeof window !== 'undefined') {
  initStorage();
}

// Mock Auth
export const onAuthStateChanged = (auth: any, callback: any) => {
  const mockUser = localStorage.getItem('mockUser');
  if (mockUser) {
    callback(JSON.parse(mockUser));
  } else {
    callback(null);
  }
  return () => {};
};

export const auth = {
  currentUser: null as any,
};

// Mock Firestore
export const db = {
  // We'll use this to satisfy imports, but we'll mock the specific functions
};

export const collection = (_db: any, path: string) => path;
export const doc = (_db: any, path: string, id: string) => ({ path, id });
export const query = (path: string, ..._constraints: any[]) => path;
export const where = (field: string, op: string, value: any) => ({ field, op, value });
export const orderBy = (field: string, dir: string = 'asc') => ({ field, dir });
export const limit = (n: number) => ({ limit: n });

export const getDocs = async (path: string) => {
  let data: any[] = [];
  if (path === 'products') {
    data = getFromStorage(STORAGE_KEYS.PRODUCTS, []);
  } else if (path === 'hero_slides') {
    data = getFromStorage(STORAGE_KEYS.HERO_SLIDES, []);
  }
  
  return {
    empty: data.length === 0,
    size: data.length,
    docs: data.map(item => ({
      id: item.id,
      data: () => item
    }))
  };
};

export const getDoc = async (item: { path: string, id: string }) => {
  let data: any[] = [];
  if (item.path === 'products') {
    data = getFromStorage(STORAGE_KEYS.PRODUCTS, []);
  } else if (item.path === 'users') {
    data = getFromStorage(STORAGE_KEYS.USERS, []);
  }
  
  const found = data.find(i => i.id === item.id);
  return {
    id: item.id,
    exists: () => !!found,
    data: () => found
  };
};

const listeners: Set<() => void> = new Set();
const notify = () => listeners.forEach(l => l());

export const onSnapshot = (path: string, callback: (snapshot: any) => void, _error?: (err: any) => void) => {
  const handler = async () => {
    const snapshot = await getDocs(path);
    callback(snapshot);
  };
  listeners.add(handler);
  handler(); // Initial call
  return () => listeners.delete(handler);
};

export const addDoc = async (path: string, data: any) => {
  const storageKey = path === 'products' ? STORAGE_KEYS.PRODUCTS : 
                     path === 'hero_slides' ? STORAGE_KEYS.HERO_SLIDES : path;
  const collectionData = getFromStorage<any[]>(storageKey, []);
  const newDoc = { ...data, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() };
  collectionData.push(newDoc);
  saveToStorage(storageKey, collectionData);
  notify();
  return { id: newDoc.id };
};

export const setDoc = async (item: { path: string, id: string }, data: any) => {
  const storageKey = item.path === 'products' ? STORAGE_KEYS.PRODUCTS : 
                     item.path === 'hero_slides' ? STORAGE_KEYS.HERO_SLIDES : 
                     item.path === 'users' ? STORAGE_KEYS.USERS : item.path;
  const collectionData = getFromStorage<any[]>(storageKey, []);
  const index = collectionData.findIndex(i => i.id === item.id);
  
  if (index >= 0) {
    collectionData[index] = { ...collectionData[index], ...data };
  } else {
    collectionData.push({ ...data, id: item.id });
  }
  
  saveToStorage(storageKey, collectionData);
  notify();
};

export const updateDoc = async (item: { path: string, id: string }, data: any) => {
  return setDoc(item, data);
};

export const deleteDoc = async (item: { path: string, id: string }) => {
  const storageKey = item.path === 'products' ? STORAGE_KEYS.PRODUCTS : 
                     item.path === 'hero_slides' ? STORAGE_KEYS.HERO_SLIDES : item.path;
  const collectionData = getFromStorage<any[]>(storageKey, []);
  const filtered = collectionData.filter(i => i.id !== item.id);
  saveToStorage(storageKey, filtered);
  notify();
};

export const serverTimestamp = () => new Date().toISOString();

// Mock Auth Provider
export class GoogleAuthProvider {}
export const signInWithPopup = async (..._args: any[]) => {
  throw new Error("Social login not available in mock mode. Please use guest login.");
};
export const signOut = async (..._args: any[]) => {
  localStorage.removeItem('mockUser');
};
