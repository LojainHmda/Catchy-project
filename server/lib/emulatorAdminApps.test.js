import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// In emulator mode the real admin modules (posAdmin / cloudinaryAdmin) must
// never read service-account.json or create application-default credentials —
// even when the key file exists on disk (as it does on the dev machine).
const spies = vi.hoisted(() => ({
  readFileSync: vi.fn(() => '{"type":"service_account"}'),
  cert: vi.fn(() => 'REAL_CERT_CREDENTIAL'),
  applicationDefault: vi.fn(() => 'REAL_ADC_CREDENTIAL'),
  initializeApp: vi.fn((options, name) => ({ name, options })),
  // Emulator mode creates the Firestore client directly (no credentials) after a
  // positive identity check — both stubbed so this test never touches a real emulator.
  verifyIdentity: vi.fn(async () => {}),
  firestoreSettings: [],
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: () => true, readFileSync: spies.readFileSync };
});
vi.mock('firebase-admin/app', () => ({
  initializeApp: spies.initializeApp,
  getApps: () => [],
  getApp: vi.fn(),
  cert: spies.cert,
  applicationDefault: spies.applicationDefault,
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async () => ({ uid: 'u1', email: 'admin@gmail.com', aud: 'demo-catchy' }) }),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }) }),
}));
vi.mock('../../scripts/emulator/identity.mjs', () => ({ assertCatchyEmulatorIdentity: spies.verifyIdentity }));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor(settings) {
      spies.firestoreSettings.push(settings);
    }
    collection() {
      return { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) };
    }
  },
}));

const PINNED = {
  CATCHY_EMULATOR_MODE: '1',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: 'demo-catchy',
  VITE_FIREBASE_PROJECT_ID: 'demo-catchy',
};
const saved = {};

beforeAll(() => {
  for (const [key, value] of Object.entries(PINNED)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
});
afterAll(() => {
  for (const key of Object.keys(PINNED)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('emulator mode: admin apps never use real credentials', () => {
  it('cloudinaryAdmin and posAdmin initialise with the emulator-only credential', async () => {
    const { verifyAdminRequest } = await import('./cloudinaryAdmin.js');
    const { verifyPosStaffRequest } = await import('./posAdmin.js');
    const req = { headers: { authorization: 'Bearer emulator-token' } };

    expect(await verifyAdminRequest(req)).toMatchObject({ ok: true });
    expect(await verifyPosStaffRequest(req)).toMatchObject({ ok: true, role: 'admin' });

    expect(spies.readFileSync).not.toHaveBeenCalled(); // service-account.json never read
    expect(spies.cert).not.toHaveBeenCalled();
    expect(spies.applicationDefault).not.toHaveBeenCalled();

    // POS reads its user profile through the emulator-only Firestore client: verified, local, no credentials.
    expect(spies.verifyIdentity).toHaveBeenCalled();
    expect(spies.firestoreSettings).toEqual([{ projectId: 'demo-catchy', databaseId: '(default)', host: '127.0.0.1:8180', ssl: false }]);

    expect(spies.initializeApp).toHaveBeenCalledTimes(2);
    for (const [options] of spies.initializeApp.mock.calls) {
      expect(options.projectId).toBe('demo-catchy');
      await expect(options.credential.getAccessToken()).rejects.toThrow(/disabled in emulator mode/);
    }
  });
});
