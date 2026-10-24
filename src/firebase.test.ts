import { describe, it, expect, afterEach, vi } from 'vitest';
import { DEFAULT_FIRESTORE_DATABASE_ID, resolveFirestoreDatabaseId } from './lib/firestoreDatabaseId';

// Stub the Firebase SDK so importing src/firebase.ts never touches the network; we
// only care which database getFirestore() is asked for.
const fakeApp = { name: '[DEFAULT]' };
const getFirestore = vi.fn((..._args: unknown[]) => ({}));
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => fakeApp), getApps: vi.fn(() => []) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), GoogleAuthProvider: vi.fn() }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  getFirestore,
}));

async function loadWithEnv(databaseId: string | undefined) {
  vi.resetModules();
  getFirestore.mockClear();
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
  vi.stubEnv('VITE_FIRESTORE_DATABASE_ID', databaseId as string);
  await import('./firebase');
}

describe('resolveFirestoreDatabaseId (client)', () => {
  it('falls back to (default) when unset or blank', () => {
    expect(resolveFirestoreDatabaseId(undefined)).toBe(DEFAULT_FIRESTORE_DATABASE_ID);
    expect(resolveFirestoreDatabaseId('')).toBe('(default)');
    expect(resolveFirestoreDatabaseId('  ')).toBe('(default)');
  });

  it('returns the trimmed named database id', () => {
    expect(resolveFirestoreDatabaseId(' catchy ')).toBe('catchy');
  });
});

describe('src/firebase.ts database selection', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses (default) when VITE_FIRESTORE_DATABASE_ID is unset (catchy-496207 builds)', async () => {
    await loadWithEnv(undefined);
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledWith(fakeApp);
  });

  it('uses the named database when VITE_FIRESTORE_DATABASE_ID=catchy (kartacagenai builds)', async () => {
    await loadWithEnv('catchy');
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledWith(fakeApp, 'catchy');
  });
});
