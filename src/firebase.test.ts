import { describe, it, expect, afterEach, vi } from 'vitest';
import { DEFAULT_FIRESTORE_DATABASE_ID, resolveFirestoreDatabaseId } from './lib/firestoreDatabaseId';

// Stub the Firebase SDK so importing src/firebase.ts never touches the network; we
// only care which database getFirestore() is asked for.
const fakeApp = { name: '[DEFAULT]' };
const getFirestore = vi.fn((..._args: unknown[]) => ({}));
const connectFirestoreEmulator = vi.fn();
const connectAuthEmulator = vi.fn();
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => fakeApp), getApps: vi.fn(() => []) }));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})), GoogleAuthProvider: vi.fn(), connectAuthEmulator }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  getFirestore,
  connectFirestoreEmulator,
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

describe('src/firebase.ts local emulator connection (npm run dev:emulator only)', () => {
  afterEach(() => vi.unstubAllEnvs());

  async function load(env: Record<string, string>, dev: boolean) {
    vi.resetModules();
    connectFirestoreEmulator.mockClear();
    connectAuthEmulator.mockClear();
    vi.stubEnv('DEV', dev);
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    return import('./firebase');
  }

  const emulatorEnv = {
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_API_KEY: 'demo-api-key-not-real',
    VITE_FIREBASE_PROJECT_ID: 'demo-catchy',
    VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
    VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
    VITE_FIRESTORE_DATABASE_ID: '',
  };

  it('normal configuration never connects to emulators', async () => {
    const mod = await load({ VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'p', VITE_USE_FIREBASE_EMULATORS: '' }, true);
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(mod.firebaseEmulatorMode).toBe(false);
  });

  it('a safe emulator configuration connects Firestore and Auth to localhost', async () => {
    const mod = await load(emulatorEnv, true);
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', 8180);
    expect(connectAuthEmulator).toHaveBeenCalledWith(expect.anything(), 'http://127.0.0.1:9199');
    expect(mod.firebaseEmulatorMode).toBe(true);
  });

  it('the app refuses to start (import throws) with an unsafe configuration — no fallback', async () => {
    await expect(load({ ...emulatorEnv, VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }, true)).rejects.toThrow(/Refusing to start/);
    await expect(load(emulatorEnv, false)).rejects.toThrow(/never in a build/);
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});
