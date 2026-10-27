// @vitest-environment node
// (These are Node CLI scripts; the preflight imports Vite, which does not run under jsdom.)
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { assertLocalEmulatorUrl, createEmulatorFetch, resolveEmulatorTarget } from './target.mjs';
import { toFirestoreFields, toFirestoreValue } from './firestoreRest.mjs';
import { buildSeedData } from './seedData.mjs';
import { resetEmulators, seedEmulators } from './emulatorClient.mjs';
import { runPreflight } from './preflight.mjs';

// No emulator and no network: `fetch` is a recorder and the identity check is a
// stub (identity itself is tested in identity.test.mjs). These tests prove the
// seed / reset scripts send NOTHING unless identity passes, then only address
// Catchy's dedicated local ports, and that the seed data is synthetic. Tests never
// call the real identity check or the real emulators.

const firebaseJson = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const target = resolveEmulatorTarget({ firebaseJson });

function recordingFetch() {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', headers: init.headers, body: init.body });
    return new Response('{}', { status: 200 });
  });
  return { calls, fetchImpl };
}
const identityOk = () => vi.fn(async () => ({ ok: true }));
const identityRefused = () =>
  vi.fn(async () => {
    throw new Error('[emulator-identity] Refusing');
  });

describe('emulator target (firebase.json)', () => {
  it("reads Catchy's dedicated local emulator addresses", () => {
    expect(target.projectId).toBe('demo-catchy');
    expect(target.firestore).toMatchObject({ host: '127.0.0.1', port: 8180, base: 'http://127.0.0.1:8180' });
    expect(target.auth).toMatchObject({ host: '127.0.0.1', port: 9199, base: 'http://127.0.0.1:9199' });
    expect(target.ui.port).toBe(4100);
    expect(target.hub.port).toBe(4410);
    expect(target.logging.port).toBe(4510);
    expect(target.websocketPort).toBe(9160);
  });

  it('refuses non-local hosts, default ports, missing config and other projects', () => {
    const withOverride = (o) => ({ emulators: { ...firebaseJson.emulators, ...o } });
    expect(() => resolveEmulatorTarget({ firebaseJson: withOverride({ firestore: { host: '0.0.0.0', port: 8180, websocketPort: 9160 } }) })).toThrow(/must be 127\.0\.0\.1/);
    expect(() => resolveEmulatorTarget({ firebaseJson: withOverride({ auth: { host: 'identitytoolkit.googleapis.com', port: 443 } }) })).toThrow(/must be 127\.0\.0\.1/);
    expect(() => resolveEmulatorTarget({ firebaseJson: withOverride({ firestore: { host: '127.0.0.1', port: 8080, websocketPort: 9160 } }) })).toThrow(/default port 8080/);
    expect(() => resolveEmulatorTarget({ firebaseJson: {} })).toThrow(/no "emulators"/);
    expect(() => resolveEmulatorTarget({ firebaseJson, projectId: 'catchy-496207' })).toThrow(/only demo-catchy/);
    expect(() => resolveEmulatorTarget({ firebaseJson, projectId: 'demo-other' })).toThrow(/only demo-catchy/);
  });

  it.each([
    'https://firestore.googleapis.com/v1/projects/demo-catchy/databases/(default)/documents',
    'http://firestore.googleapis.com:8180/v1/projects/demo-catchy/x',
    'http://127.0.0.1:443/v1/projects/demo-catchy/x',
    'http://127.0.0.1:8180/v1/projects/catchy-496207/databases/(default)/documents',
    'http://127.0.0.1:8180/v1/projects/kartacagenai/databases/(default)/documents',
    'http://192.168.1.10:8180/v1/projects/demo-catchy/x',
    'http://localhost:8180/v1/projects/demo-catchy/x',
    // Firebase default ports — another project's suite may be listening there.
    'http://127.0.0.1:8080/v1/projects/demo-catchy/databases/(default)/documents',
    'http://127.0.0.1:9099/emulator/v1/projects/demo-catchy/accounts',
    'http://127.0.0.1:4000/api/config',
    'http://127.0.0.1:4400/emulators',
  ])('blocks %s without sending it', async (url) => {
    const fetchImpl = vi.fn();
    await expect(createEmulatorFetch(target, fetchImpl)(url)).rejects.toThrow(/Blocked/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows Catchy's dedicated local emulator URLs for the demo project", () => {
    expect(() => assertLocalEmulatorUrl('http://127.0.0.1:8180/v1/projects/demo-catchy/databases/(default)/documents/x/y', target)).not.toThrow();
    expect(() => assertLocalEmulatorUrl('http://127.0.0.1:9199/emulator/v1/projects/demo-catchy/accounts', target)).not.toThrow();
    expect(() => assertLocalEmulatorUrl('http://127.0.0.1:4410/emulators', target)).not.toThrow();
    expect(() => assertLocalEmulatorUrl('http://127.0.0.1:4100/api/config', target)).not.toThrow();
  });
});

describe('seed and reset (recorded, no network)', () => {
  it("seed: only after identity passes; every request goes to Catchy's dedicated ports for demo-catchy", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const data = buildSeedData(new Date(2026, 9, 25, 12));
    const verifyIdentity = identityOk();
    const result = await seedEmulators(target, data, { fetchImpl, verifyIdentity });

    expect(verifyIdentity).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ users: data.authUsers.length, documents: data.docs.length });
    expect(calls).toHaveLength(data.authUsers.length + data.docs.length);
    for (const call of calls) {
      const url = new URL(call.url);
      expect(url.protocol).toBe('http:');
      expect(url.hostname).toBe('127.0.0.1');
      expect([8180, 9199]).toContain(Number(url.port));
      expect(call.headers.Authorization).toBe('Bearer owner');
    }
    expect(calls.filter((c) => c.method === 'PATCH').every((c) => c.url.includes('/v1/projects/demo-catchy/databases/(default)/documents/'))).toBe(true);
  });

  it('seed and reset send NOTHING when identity cannot be positively verified', async () => {
    const seedRec = recordingFetch();
    await expect(seedEmulators(target, buildSeedData(), { fetchImpl: seedRec.fetchImpl, verifyIdentity: identityRefused() })).rejects.toThrow(/Refusing/);
    expect(seedRec.fetchImpl).not.toHaveBeenCalled();

    const resetRec = recordingFetch();
    await expect(resetEmulators(target, { fetchImpl: resetRec.fetchImpl, verifyIdentity: identityRefused() })).rejects.toThrow(/Refusing/);
    expect(resetRec.fetchImpl).not.toHaveBeenCalled();
  });

  it("reset issues exactly the two wipe calls to Catchy's dedicated ports", async () => {
    const { calls, fetchImpl } = recordingFetch();
    await resetEmulators(target, { fetchImpl, verifyIdentity: identityOk() });
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['DELETE', 'http://127.0.0.1:8180/emulator/v1/projects/demo-catchy/databases/(default)/documents'],
      ['DELETE', 'http://127.0.0.1:9199/emulator/v1/projects/demo-catchy/accounts'],
    ]);
  });
});

describe('seed data is synthetic and covers the Phase 1 scenarios', () => {
  const data = buildSeedData(new Date(2026, 9, 25, 12));
  const json = JSON.stringify(data);

  it('contains no real project ids, real-looking keys or external URLs', () => {
    expect(json).not.toMatch(/catchy-496207|kartacagenai|AIza|https?:\/\//);
  });

  it('uses only test identities and test phone numbers', () => {
    for (const user of data.authUsers) expect(user.email === 'admin@gmail.com' || user.email.endsWith('@example.test')).toBe(true);
    const phones = data.docs.map((d) => d.data.customerPhone).filter(Boolean);
    expect(phones.length).toBeGreaterThan(5);
    for (const phone of phones) expect(phone).toMatch(/^0590000\d{3}$/);
    const names = data.docs.map((d) => d.data.customerName).filter(Boolean);
    for (const name of names) expect(name).toMatch(/^Test /);
  });

  it('covers the cancellation, inventory and status scenarios', () => {
    const orders = Object.fromEntries(data.docs.filter((d) => d.collection === 'orders').map((d) => [d.id, d.data]));
    expect(orders['test-o-removed-color'].items.some((i) => i.colorId === 'green')).toBe(true);
    expect(orders['test-o-deleted-product'].items.some((i) => i.productId === 'test-deleted-product')).toBe(true);
    expect(orders['test-o-coordinate'].items[0].productId.startsWith('coord:')).toBe(true);
    expect(orders['test-o-legacy-status'].status).toBe('Refunded');
    expect(orders['test-o-mixed-case'].status).toBe(' Processing ');
    expect(orders['test-o-cancelled-old']).toMatchObject({ status: 'cancelled' });
    expect(orders['test-o-pos']).toMatchObject({ source: 'pos', status: 'completed' });
    const dress = data.docs.find((d) => d.id === 'test-dress').data;
    expect(dress.colorVariants.some((v) => v.nameAr === undefined && v.hex === undefined)).toBe(true);
    expect(data.docs.some((d) => d.id === 'test-deleted-product')).toBe(false);
  });
});

describe('Firestore REST encoding', () => {
  it('encodes values like the SDK and omits undefined fields', () => {
    expect(toFirestoreValue(3)).toEqual({ integerValue: '3' });
    expect(toFirestoreValue(2.5)).toEqual({ doubleValue: 2.5 });
    expect(toFirestoreValue(new Date('2026-10-25T00:00:00.000Z'))).toEqual({ timestampValue: '2026-10-25T00:00:00.000Z' });
    expect(toFirestoreValue([])).toEqual({ arrayValue: {} });
    expect(toFirestoreFields({ a: 'x', b: undefined, c: { d: true } })).toEqual({
      a: { stringValue: 'x' },
      c: { mapValue: { fields: { d: { booleanValue: true } } } },
    });
  });
});

describe('offline preflight (configuration only — identity is verified separately at runtime)', () => {
  // Vite gives variables already in the process priority over env files. The test
  // runner itself has the real VITE_* values in its process, so (exactly like a real
  // shell that exported them) loading through Vite would — correctly — be refused.
  // Here the env FILES are merged directly, in Vite's priority order.
  function emulatorFilesEnv() {
    const env = {};
    for (const name of ['.env', '.env.local', '.env.emulator', '.env.emulator.local']) {
      const file = new URL(`../../${name}`, import.meta.url);
      if (existsSync(file)) Object.assign(env, parseDotenv(readFileSync(file)));
    }
    return env;
  }

  it('passes for the real .env.emulator + firebase.json (dedicated ports)', () => {
    expect(runPreflight({ env: emulatorFilesEnv(), processEnv: {} })).toMatchObject({ ok: true, projectId: 'demo-catchy' });
  });

  it('is refused when real VITE_* values from the process would win over .env.emulator', () => {
    const polluted = { ...emulatorFilesEnv(), VITE_FIREBASE_PROJECT_ID: 'catchy-496207' };
    expect(runPreflight({ env: polluted, processEnv: {} }).ok).toBe(false);
  });

  it('is refused for the default ports or a firebase.json that disagrees', () => {
    const defaults = { ...emulatorFilesEnv(), VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };
    expect(runPreflight({ env: defaults, processEnv: {} }).problems.join(' ')).toMatch(/dedicated port 8180/);

    const shifted = { ...firebaseJson, emulators: { ...firebaseJson.emulators, firestore: { host: '127.0.0.1', port: 8181, websocketPort: 9160 } } };
    const result = runPreflight({ env: emulatorFilesEnv(), processEnv: {}, firebaseJson: shifted });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/dedicated port 8180/);
  });
});
