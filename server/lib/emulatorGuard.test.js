import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import {
  adminCredential,
  adminSdkMode,
  applyEmulatorProcessEnv,
  assertServerNotInEmulatorMode,
  emulatorOnlyCredential,
  enforceDevEnvironment,
  evaluateDevEnvironment,
  parseLocalHostPort,
} from './emulatorGuard.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A complete, safe emulator env (same shape as .env.emulator). */
function safeEnv(overrides = {}) {
  return {
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_PROJECT_ID: 'demo-catchy',
    VITE_FIREBASE_API_KEY: 'demo-api-key-not-real',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo-catchy.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo-catchy.appspot.com',
    VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
    VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
    VITE_FIRESTORE_DATABASE_ID: '',
    FIRESTORE_DATABASE_ID: '',
    WHATSAPP_API_TOKEN: '',
    WHATSAPP_WEBHOOK_SECRET: '',
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    GEMINI_API_KEY: '',
    ...overrides,
  };
}
const emu = (env = safeEnv(), processEnv = {}, extra = {}) =>
  evaluateDevEnvironment({ mode: 'emulator', command: 'serve', env, processEnv, ...extra });

describe('normal development and production are untouched', () => {
  it('a normal (real-project) env is not emulator mode and has no problems', () => {
    const realLooking = { VITE_FIREBASE_PROJECT_ID: 'catchy-496207', WHATSAPP_API_TOKEN: 'x', CLOUDINARY_API_SECRET: 'y' };
    for (const [mode, command] of [['development', 'serve'], ['production', 'build']]) {
      expect(evaluateDevEnvironment({ mode, command, env: realLooking, processEnv: {} })).toEqual({ emulator: false, problems: [], settings: null });
    }
  });
});

describe('a complete, safe emulator configuration is accepted', () => {
  it('returns local settings for the demo project', () => {
    const result = emu();
    expect(result.problems).toEqual([]);
    expect(result.settings).toEqual({
      projectId: 'demo-catchy',
      firestore: { host: '127.0.0.1', port: 8180, hostPort: '127.0.0.1:8180' },
      auth: { host: '127.0.0.1', port: 9199, hostPort: '127.0.0.1:9199' },
    });
  });

  it('accepts matching shell variables set by scripts/dev-emulator.ps1', () => {
    const shell = { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', GCLOUD_PROJECT: 'demo-catchy' };
    expect(emu(safeEnv(), shell).problems).toEqual([]);
  });
});

describe('fails closed on anything missing, inconsistent or non-local', () => {
  const cases = [
    ['emulator flag in a normal dev server', () => evaluateDevEnvironment({ mode: 'development', command: 'serve', env: safeEnv(), processEnv: {} }), /Vite mode is "development"/],
    ['building an emulator bundle', () => emu(safeEnv(), {}, { command: 'build' }), /not "vite build"/],
    ['flag not exactly "true"', () => emu(safeEnv({ VITE_USE_FIREBASE_EMULATORS: 'TRUE' })), /exactly "true"/],
    ['a real project id', () => emu(safeEnv({ VITE_FIREBASE_PROJECT_ID: 'catchy-496207', VITE_FIREBASE_AUTH_DOMAIN: 'catchy-496207.firebaseapp.com', VITE_FIREBASE_STORAGE_BUCKET: '' })), /demo-\* project id/],
    ['the other real project id', () => emu(safeEnv({ VITE_FIREBASE_PROJECT_ID: 'kartacagenai' })), /demo-\* project id/],
    ['a real API key', () => emu(safeEnv({ VITE_FIREBASE_API_KEY: 'AIzaRealLookingKey' })), /fake demo-\* value/],
    ['a real auth domain', () => emu(safeEnv({ VITE_FIREBASE_AUTH_DOMAIN: 'catchy-496207.firebaseapp.com' })), /AUTH_DOMAIN/],
    ['a real storage bucket', () => emu(safeEnv({ VITE_FIREBASE_STORAGE_BUCKET: 'kartacagenai-catchy-media' })), /STORAGE_BUCKET/],
    ['missing Firestore emulator host', () => emu(safeEnv({ VITE_FIRESTORE_EMULATOR_HOST: '' })), /VITE_FIRESTORE_EMULATOR_HOST/],
    ['a Google host instead of localhost', () => emu(safeEnv({ VITE_FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' })), /VITE_FIRESTORE_EMULATOR_HOST/],
    ['a LAN address', () => emu(safeEnv({ VITE_AUTH_EMULATOR_HOST: '192.168.1.20:9099' })), /VITE_AUTH_EMULATOR_HOST/],
    ['shell Firestore host disagreeing', () => emu(safeEnv(), { FIRESTORE_EMULATOR_HOST: '127.0.0.1:9998' }), /does not match/],
    ['a storage emulator variable', () => emu(safeEnv(), { FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' }), /Storage emulation/],
    ['a real project in the shell', () => emu(safeEnv(), { GOOGLE_CLOUD_PROJECT: 'catchy-496207' }), /not the demo project/],
    ['the named production database', () => emu(safeEnv({ FIRESTORE_DATABASE_ID: 'catchy' })), /FIRESTORE_DATABASE_ID must be empty/],
    ['named DB only in the shell', () => emu(safeEnv(), { FIRESTORE_DATABASE_ID: 'catchy' }), /FIRESTORE_DATABASE_ID must be empty/],
    ['a WhatsApp token left in the env files', () => emu(safeEnv({ WHATSAPP_API_TOKEN: 'secret' })), /WHATSAPP_API_TOKEN must be empty/],
    ['a Cloudinary secret in the shell', () => emu(safeEnv(), { CLOUDINARY_API_SECRET: 'secret' }), /CLOUDINARY_API_SECRET must be empty/],
    ['a credentials file path', () => emu(safeEnv(), { GOOGLE_APPLICATION_CREDENTIALS: 'C:/keys/sa.json' }), /GOOGLE_APPLICATION_CREDENTIALS must be empty/],
    ['any other secret-like key from .env', () => emu(safeEnv({ SOME_SERVICE_TOKEN: 'abc' })), /SOME_SERVICE_TOKEN must be empty/],
    // Wrong ports / identity: Firebase's defaults may belong to another project's running suite.
    ['the default Firestore port (another suite may own it)', () => emu(safeEnv({ VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })), /dedicated port 8180/],
    ['the default Auth port (another suite may own it)', () => emu(safeEnv({ VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })), /dedicated port 9199/],
    ['any other port', () => emu(safeEnv({ VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' })), /dedicated port 8180/],
    ['localhost instead of exactly 127.0.0.1', () => emu(safeEnv({ VITE_FIRESTORE_EMULATOR_HOST: 'localhost:8180' })), /exactly 127\.0\.0\.1/],
    ['a different demo project', () => emu(safeEnv({ VITE_FIREBASE_PROJECT_ID: 'demo-other', VITE_FIREBASE_AUTH_DOMAIN: 'demo-other.firebaseapp.com', VITE_FIREBASE_STORAGE_BUCKET: '' })), /must be demo-catchy/],
    ['a shell host pointing at the default port', () => emu(safeEnv(), { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /does not match/],
  ];
  it.each(cases)('refuses %s', (_label, run, message) => {
    const result = run();
    expect(result.emulator).toBe(true);
    expect(result.settings).toBeNull();
    expect(result.problems.join('\n')).toMatch(message);
  });

  it('unrelated shell tokens (merged into env by Vite) are not a reason to refuse; the app-used keys still are', () => {
    const shell = { GITHUB_TOKEN: 'personal', SOME_CLI_SECRET: 'x' };
    expect(emu(safeEnv({ ...shell }), shell).problems).toEqual([]);
    const withAppKey = { WHATSAPP_API_TOKEN: 'real' };
    expect(emu(safeEnv({ ...withAppKey }), withAppKey).problems.join(' ')).toMatch(/WHATSAPP_API_TOKEN must be empty/);
  });

  it('a stray emulator variable in a normal dev shell is refused, not silently used', () => {
    const result = evaluateDevEnvironment({ mode: 'development', command: 'serve', env: { VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }, processEnv: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' } });
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('enforceDevEnvironment throws with every problem listed', () => {
    expect(() => enforceDevEnvironment({ mode: 'emulator', command: 'build', env: safeEnv({ VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }), processEnv: {} })).toThrow(/Refusing to start[\s\S]*vite build[\s\S]*demo-\*/);
  });

  it('parseLocalHostPort only accepts this machine', () => {
    expect(parseLocalHostPort('localhost:8080')).toMatchObject({ host: 'localhost', port: 8080 });
    expect(parseLocalHostPort('[::1]:8080')).toMatchObject({ host: '::1' });
    for (const bad of ['', '8080', 'http://127.0.0.1:8080', '127.0.0.2:8080', 'example.com:8080', '127.0.0.1:99999']) {
      expect(parseLocalHostPort(bad)).toBeNull();
    }
  });
});

describe('pinning the process and the Admin SDK credential', () => {
  it('applyEmulatorProcessEnv points the Admin SDK at the emulators and removes credentials/secrets', () => {
    const processEnv = { GOOGLE_APPLICATION_CREDENTIALS: 'x', WHATSAPP_API_TOKEN: 'y', FIRESTORE_DATABASE_ID: 'catchy', PATH: 'keep' };
    applyEmulatorProcessEnv(processEnv, emu().settings);
    expect(processEnv).toEqual({
      PATH: 'keep',
      CATCHY_EMULATOR_MODE: '1',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
      GCLOUD_PROJECT: 'demo-catchy',
      GOOGLE_CLOUD_PROJECT: 'demo-catchy',
      VITE_FIREBASE_PROJECT_ID: 'demo-catchy',
    });
  });

  const pinned = { CATCHY_EMULATOR_MODE: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', GCLOUD_PROJECT: 'demo-catchy' };

  it('adminSdkMode: real when nothing is set; emulator when fully pinned', () => {
    expect(adminSdkMode({})).toBe('real');
    expect(adminSdkMode(pinned)).toBe('emulator');
  });

  it('adminSdkMode refuses the default ports (another suite) and a different project', () => {
    expect(() => adminSdkMode({ ...pinned, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/dedicated port/);
    expect(() => adminSdkMode({ ...pinned, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toThrow(/dedicated port/);
    expect(() => adminSdkMode({ ...pinned, GCLOUD_PROJECT: 'demo-other' })).toThrow(/demo-catchy/);
  });

  it('adminSdkMode refuses half-configured or off-machine setups', () => {
    expect(() => adminSdkMode({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' })).toThrow(/not active/);
    expect(() => adminSdkMode({ ...pinned, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' })).toThrow(/not a localhost/);
    expect(() => adminSdkMode({ ...pinned, GCLOUD_PROJECT: 'catchy-496207' })).toThrow(/not demo-catchy/);
    expect(() => adminSdkMode({ ...pinned, GOOGLE_APPLICATION_CREDENTIALS: 'x' })).toThrow(/must not be set/);
  });

  it('in emulator mode the real credential (service-account.json / ADC) is never even created', async () => {
    let realCreated = false;
    const credential = adminCredential(() => {
      realCreated = true;
      return 'REAL';
    }, pinned);
    expect(realCreated).toBe(false);
    await expect(credential.getAccessToken()).rejects.toThrow(/disabled in emulator mode/);
  });

  it('outside emulator mode the existing credential is used exactly as before', () => {
    expect(adminCredential(() => 'REAL', {})).toBe('REAL');
  });

  it('emulatorOnlyCredential can never mint a token', async () => {
    await expect(emulatorOnlyCredential().getAccessToken()).rejects.toThrow();
  });

  it('npm start refuses to run with emulator variables; is a no-op otherwise', () => {
    expect(() => assertServerNotInEmulatorMode({})).not.toThrow();
    expect(() => assertServerNotInEmulatorMode({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' })).toThrow(/npm start/);
    expect(() => assertServerNotInEmulatorMode({ CATCHY_EMULATOR_MODE: '1' })).toThrow();
  });
});

describe('the real .env.emulator file', () => {
  // Reproduces Vite's file merge for `--mode emulator` (.env < .env.local < .env.emulator < .env.emulator.local)
  // from the files only — values are kept in memory and never printed.
  function loadEmulatorFiles() {
    const env = {};
    for (const name of ['.env', '.env.local', '.env.emulator', '.env.emulator.local']) {
      const file = path.join(repoRoot, name);
      if (existsSync(file)) Object.assign(env, parseDotenv(readFileSync(file)));
    }
    return env;
  }

  it('exists and neutralises every real value from .env / .env.local', () => {
    expect(existsSync(path.join(repoRoot, '.env.emulator'))).toBe(true);
    const result = evaluateDevEnvironment({ mode: 'emulator', command: 'serve', env: loadEmulatorFiles(), processEnv: {} });
    expect(result.problems).toEqual([]);
    expect(result.settings?.projectId).toBe('demo-catchy');
  });

  it('contains no secrets and no real project ids', () => {
    const text = readFileSync(path.join(repoRoot, '.env.emulator'), 'utf8');
    expect(text).not.toMatch(/catchy-496207|kartacagenai|AIza[0-9A-Za-z_-]{20,}/);
    const values = parseDotenv(text);
    for (const key of ['WHATSAPP_API_TOKEN', 'WHATSAPP_WEBHOOK_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'GEMINI_API_KEY']) {
      expect(values[key]).toBe('');
    }
  });
});
