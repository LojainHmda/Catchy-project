import { describe, it, expect, beforeEach, vi } from 'vitest';

const getFirestore = vi.fn((...args) => ({ args }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore }));

import {
  DEFAULT_FIRESTORE_DATABASE_ID,
  EMULATOR_FIRESTORE_HOST,
  emulatorFirestoreSettings,
  resolveFirestoreDatabaseId,
  getAdminFirestore,
} from './firestoreDatabase.js';

describe('resolveFirestoreDatabaseId (server)', () => {
  it('falls back to (default) when unset, blank, or not a string', () => {
    expect(resolveFirestoreDatabaseId(undefined)).toBe(DEFAULT_FIRESTORE_DATABASE_ID);
    expect(resolveFirestoreDatabaseId(null)).toBe('(default)');
    expect(resolveFirestoreDatabaseId('')).toBe('(default)');
    expect(resolveFirestoreDatabaseId('   ')).toBe('(default)');
  });

  it('returns the trimmed named database id', () => {
    expect(resolveFirestoreDatabaseId('catchy')).toBe('catchy');
    expect(resolveFirestoreDatabaseId('  catchy\n')).toBe('catchy');
  });
});

describe('getAdminFirestore', () => {
  const app = { name: 'test-app' };
  beforeEach(() => getFirestore.mockClear());

  it('uses the plain (default) call when FIRESTORE_DATABASE_ID is unset (catchy-496207)', async () => {
    await getAdminFirestore(app, {});
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledWith(app);
  });

  it('treats an explicit "(default)" like unset', async () => {
    await getAdminFirestore(app, { FIRESTORE_DATABASE_ID: '(default)' });
    expect(getFirestore).toHaveBeenCalledWith(app);
  });

  it('selects the named database when FIRESTORE_DATABASE_ID=catchy (kartacagenai)', async () => {
    await getAdminFirestore(app, { FIRESTORE_DATABASE_ID: 'catchy' });
    expect(getFirestore).toHaveBeenCalledWith(app, 'catchy');
  });

  it('ignores the client-only VITE_FIRESTORE_DATABASE_ID', async () => {
    await getAdminFirestore(app, { VITE_FIRESTORE_DATABASE_ID: 'catchy' });
    expect(getFirestore).toHaveBeenCalledWith(app);
  });
});

describe('getAdminFirestore — production path unchanged, emulator path pinned to Catchy (no credentials)', () => {
  const app = { name: 'test-app' };
  const pinned = { CATCHY_EMULATOR_MODE: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', GCLOUD_PROJECT: 'demo-catchy' };
  const deps = () => ({ verifyIdentity: vi.fn(async () => {}), createClient: vi.fn(async (settings) => ({ settings })) });
  beforeEach(() => getFirestore.mockClear());

  it('production (no emulator variables): exactly the previous firebase-admin calls, no emulator client, no identity check', async () => {
    const d = deps();
    await getAdminFirestore(app, {}, { processEnv: {}, ...d });
    await getAdminFirestore(app, { FIRESTORE_DATABASE_ID: 'catchy' }, { processEnv: {}, ...d });
    expect(getFirestore.mock.calls).toEqual([[app], [app, 'catchy']]);
    expect(d.createClient).not.toHaveBeenCalled();
    expect(d.verifyIdentity).not.toHaveBeenCalled();
  });

  it('emulator mode: verifies identity first, then creates a client for 127.0.0.1:8180 / demo-catchy with no credentials', async () => {
    const d = deps();
    const order = [];
    d.verifyIdentity.mockImplementation(async () => order.push('verify'));
    d.createClient.mockImplementation(async (settings) => (order.push('create'), { settings }));
    const db = await getAdminFirestore(app, {}, { processEnv: pinned, ...d });
    expect(order).toEqual(['verify', 'create']);
    expect(getFirestore).not.toHaveBeenCalled(); // firebase-admin's credentialed path is never used
    expect(db.settings).toEqual({ projectId: 'demo-catchy', databaseId: '(default)', host: '127.0.0.1:8180', ssl: false });
    expect(Object.keys(db.settings)).not.toEqual(expect.arrayContaining(['credentials']));
    expect(EMULATOR_FIRESTORE_HOST).toBe('127.0.0.1:8180');
  });

  it.each([
    ['localhost instead of 127.0.0.1', { ...pinned, FIRESTORE_EMULATOR_HOST: 'localhost:8180' }],
    ['the default port (another suite)', { ...pinned, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }],
    ['a different demo project', { ...pinned, GCLOUD_PROJECT: 'demo-other' }],
    ['a real project', { ...pinned, GCLOUD_PROJECT: 'catchy-496207' }],
    ['a credentials file', { ...pinned, GOOGLE_APPLICATION_CREDENTIALS: 'C:/key.json' }],
    ['emulator host without emulator mode', { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' }],
  ])('fails closed with %s — no client, no firebase-admin fallback', async (_label, processEnv) => {
    const d = deps();
    await expect(getAdminFirestore(app, {}, { processEnv, ...d })).rejects.toThrow(/emulator-guard/);
    expect(d.createClient).not.toHaveBeenCalled();
    expect(getFirestore).not.toHaveBeenCalled();
  });

  it('fails closed for a named database in emulator mode', async () => {
    const d = deps();
    await expect(getAdminFirestore(app, { FIRESTORE_DATABASE_ID: 'catchy' }, { processEnv: pinned, ...d })).rejects.toThrow(/default/);
    expect(d.createClient).not.toHaveBeenCalled();
  });

  it('fails closed when the running emulators cannot be positively identified', async () => {
    const d = deps();
    d.verifyIdentity.mockRejectedValue(new Error('[emulator-identity] Refusing'));
    await expect(getAdminFirestore(app, {}, { processEnv: pinned, ...d })).rejects.toThrow(/emulator-identity/);
    expect(d.createClient).not.toHaveBeenCalled();
    expect(getFirestore).not.toHaveBeenCalled();
  });

  it('the real Firestore client built from these settings targets only 127.0.0.1:8180 over plain HTTP (no network used)', async () => {
    const { Firestore } = await vi.importActual('@google-cloud/firestore');
    const client = new Firestore(emulatorFirestoreSettings(pinned, '(default)'));
    const s = client._settings;
    expect(s.servicePath).toBe('127.0.0.1');
    expect(s.port).toBe(8180);
    expect(s.ssl).toBe(false);
    expect(s.credentials).toBeUndefined();
    expect(s.keyFilename).toBeUndefined();
    expect(client.projectId).toBe('demo-catchy');
    expect(client.databaseId).toBe('(default)');
    await client.terminate();
  });
});
