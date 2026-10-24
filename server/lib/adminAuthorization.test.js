import { describe, it, expect, beforeEach, vi } from 'vitest';

// Project-specific admin authorization for the image-upload (cloudinaryAdmin) and POS
// (posAdmin) endpoints. Firebase Admin is stubbed: `verifyIdToken` returns whatever
// decoded token a test sets, mimicking a token already verified for that project (`aud`).
const verifyIdToken = vi.fn();
const profiles = new Map();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  // Never read the real service-account.json in tests.
  return { ...actual, existsSync: () => false };
});
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn((_opts, name) => ({ name })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  cert: vi.fn(),
  applicationDefault: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({ verifyIdToken })) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: () => ({
      doc: (uid) => ({
        get: async () => ({ exists: profiles.has(uid), data: () => profiles.get(uid) }),
      }),
    }),
  })),
}));

import { verifyAdminRequest } from './cloudinaryAdmin.js';
import { verifyPosStaffRequest } from './posAdmin.js';

const req = { headers: { authorization: 'Bearer test-token' } };
const token = (email, aud, uid = 'u1') => verifyIdToken.mockResolvedValueOnce({ uid, email, aud });

beforeEach(() => {
  verifyIdToken.mockReset();
  profiles.clear();
});

describe.each([
  ['kartacagenai', 'catchy-496207'],
  ['catchy-496207', 'kartacagenai'],
])('serving project %s', (project, otherProject) => {
  it('image upload: accepts this project\'s synthetic admin', async () => {
    token(`ops-${project}@example.com`, project);
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: true });
  });

  it("image upload: rejects the other project's synthetic admin", async () => {
    token(`ops-${otherProject}@example.com`, project);
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it("POS: accepts this project's synthetic admin as admin", async () => {
    token(`ops-${project}@example.com`, project);
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: true, role: 'admin' });
  });

  it("POS: rejects the other project's synthetic admin without a staff profile", async () => {
    token(`ops-${otherProject}@example.com`, project);
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
  });
});

describe('unchanged authorization paths', () => {
  it('a token without aud never matches a synthetic address', async () => {
    token('ops-kartacagenai@example.com', undefined);
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
    token('ops-kartacagenai@example.com', undefined);
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it('owner emails stay admin on both endpoints', async () => {
    token('lojain2077@gmail.com', 'kartacagenai');
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: true });
    token('lojain2077@gmail.com', 'kartacagenai');
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: true, role: 'admin' });
  });

  it('ordinary users are rejected; a cashier profile grants POS but not image upload', async () => {
    token('shopper@gmail.com', 'kartacagenai', 'shopper');
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
    token('shopper@gmail.com', 'kartacagenai', 'shopper');
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });

    profiles.set('cashier1', { role: 'cashier' });
    token('till@gmail.com', 'kartacagenai', 'cashier1');
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: true, role: 'cashier' });
    token('till@gmail.com', 'kartacagenai', 'cashier1');
    await expect(verifyAdminRequest(req)).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it('missing or invalid tokens are 401', async () => {
    await expect(verifyAdminRequest({ headers: {} })).resolves.toMatchObject({ ok: false, status: 401 });
    verifyIdToken.mockRejectedValueOnce(new Error('expired'));
    await expect(verifyPosStaffRequest(req)).resolves.toMatchObject({ ok: false, status: 401 });
  });
});
