import { describe, it, expect } from 'vitest';
import { CATCHY_EMULATOR_CLIENT, resolveEmulatorSettings } from './emulatorConfig';
import { CATCHY_EMULATOR } from '../../server/lib/emulatorGuard.js';

describe('browser and server agree on Catchy\'s dedicated emulator identity', () => {
  it('uses the same project, host and ports', () => {
    expect(CATCHY_EMULATOR_CLIENT).toEqual({
      projectId: CATCHY_EMULATOR.projectId,
      host: CATCHY_EMULATOR.host,
      firestorePort: CATCHY_EMULATOR.ports.firestore,
      authPort: CATCHY_EMULATOR.ports.auth,
    });
  });
});

const safe = {
  VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-catchy',
  VITE_FIREBASE_API_KEY: 'demo-api-key-not-real',
  VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
  VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
  VITE_FIRESTORE_DATABASE_ID: '',
};

describe('resolveEmulatorSettings (browser)', () => {
  it('normal development and production builds: no emulator settings, nothing changes', () => {
    expect(resolveEmulatorSettings({ VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }, true)).toBeNull();
    expect(resolveEmulatorSettings({ VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }, false)).toBeNull();
  });

  it('a complete local configuration in the dev server connects to localhost only', () => {
    expect(resolveEmulatorSettings(safe, true)).toEqual({
      projectId: 'demo-catchy',
      firestore: { host: '127.0.0.1', port: 8180 },
      authUrl: 'http://127.0.0.1:9199',
    });
  });

  it.each([
    ['in a production build', safe, false, /never in a build/],
    ['flag not exactly "true"', { ...safe, VITE_USE_FIREBASE_EMULATORS: '1' }, true, /exactly "true"/],
    ['host set without the flag', { VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' }, true, /exactly "true"/],
    ['a real project id', { ...safe, VITE_FIREBASE_PROJECT_ID: 'catchy-496207' }, true, /demo-\*/],
    ['the other real project id', { ...safe, VITE_FIREBASE_PROJECT_ID: 'kartacagenai' }, true, /demo-\*/],
    ['a real API key', { ...safe, VITE_FIREBASE_API_KEY: 'AIzaReal' }, true, /fake demo-\*/],
    ['the named production database', { ...safe, VITE_FIRESTORE_DATABASE_ID: 'catchy' }, true, /DATABASE_ID/],
    ['a non-local Firestore host', { ...safe, VITE_FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' }, true, /FIRESTORE_EMULATOR_HOST/],
    ['a missing Auth host', { ...safe, VITE_AUTH_EMULATOR_HOST: '' }, true, /AUTH_EMULATOR_HOST/],
    ['a LAN Auth host', { ...safe, VITE_AUTH_EMULATOR_HOST: '10.0.0.2:9099' }, true, /AUTH_EMULATOR_HOST/],
    ['the default Firestore port (another suite may own it)', { ...safe, VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }, true, /127\.0\.0\.1:8180/],
    ['the default Auth port (another suite may own it)', { ...safe, VITE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }, true, /127\.0\.0\.1:9199/],
    ['localhost instead of 127.0.0.1', { ...safe, VITE_AUTH_EMULATOR_HOST: 'localhost:9199' }, true, /127\.0\.0\.1:9199/],
    ['a different demo project', { ...safe, VITE_FIREBASE_PROJECT_ID: 'demo-other' }, true, /must be demo-catchy/],
  ])('refuses to start %s', (_label, env, isDev, message) => {
    expect(() => resolveEmulatorSettings(env, isDev)).toThrow(message);
  });
});
