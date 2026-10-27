// Which Firestore database the server-side Admin SDK talks to.
// catchy-496207 keeps using its project's `(default)` database (FIRESTORE_DATABASE_ID
// unset). The kartacagenai Cloud Run service sets FIRESTORE_DATABASE_ID=catchy, a named
// database inside that shared project. The client bundle picks the same database at
// build time via VITE_FIRESTORE_DATABASE_ID (see src/lib/firestoreDatabaseId.ts).
//
// Local emulator mode (npm run dev:emulator only): firebase-admin's getFirestore()
// refuses the emulator-only credential (it accepts only service-account or
// application-default credentials), so in that mode the Firestore client is created
// directly — pinned to Catchy's emulator at 127.0.0.1:8180 for project demo-catchy,
// with NO credentials at all — after the environment and the running emulators'
// identity are positively verified. Anything unexpected fails closed (throws).
import { CATCHY_EMULATOR, adminSdkMode } from './emulatorGuard.js';

export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';

/** The only Firestore endpoint the server may use in emulator mode. */
export const EMULATOR_FIRESTORE_HOST = `${CATCHY_EMULATOR.host}:${CATCHY_EMULATOR.ports.firestore}`;

export function resolveFirestoreDatabaseId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id || DEFAULT_FIRESTORE_DATABASE_ID;
}

/**
 * Settings for the emulator-only Firestore client, or a thrown refusal. Pure —
 * no I/O — so the exact endpoint/project/credential rules are unit-tested.
 */
export function emulatorFirestoreSettings(processEnv, databaseId) {
  const problems = [];
  if (processEnv.FIRESTORE_EMULATOR_HOST !== EMULATOR_FIRESTORE_HOST) {
    problems.push(`FIRESTORE_EMULATOR_HOST must be exactly ${EMULATOR_FIRESTORE_HOST}`);
  }
  if (processEnv.GCLOUD_PROJECT !== CATCHY_EMULATOR.projectId) problems.push(`GCLOUD_PROJECT must be ${CATCHY_EMULATOR.projectId}`);
  if (databaseId !== DEFAULT_FIRESTORE_DATABASE_ID) problems.push('only the (default) database exists in the emulator');
  if (problems.length) throw new Error('[emulator-guard] Refusing emulator Firestore client: ' + problems.join('; '));
  return {
    projectId: CATCHY_EMULATOR.projectId,
    databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    host: EMULATOR_FIRESTORE_HOST,
    ssl: false, // plain HTTP to 127.0.0.1 only; the client then sends the emulator's "Bearer owner" header
  };
}

async function defaultVerifyIdentity() {
  const { assertCatchyEmulatorIdentity } = await import('../../scripts/emulator/identity.mjs');
  await assertCatchyEmulatorIdentity();
}

async function defaultCreateClient(settings) {
  const { Firestore } = await import('@google-cloud/firestore');
  return new Firestore(settings);
}

/**
 * Admin SDK Firestore handle for `app` on the configured database.
 *
 * `env` supplies FIRESTORE_DATABASE_ID (callers may pass a subset); emulator mode is
 * decided from `options.processEnv` (the real process environment by default),
 * where npm run dev:emulator sets the emulator variables.
 */
export async function getAdminFirestore(
  app,
  env = process.env,
  { processEnv = process.env, verifyIdentity = defaultVerifyIdentity, createClient = defaultCreateClient } = {}
) {
  const databaseId = resolveFirestoreDatabaseId(env.FIRESTORE_DATABASE_ID);

  if (adminSdkMode(processEnv) === 'emulator') {
    const settings = emulatorFirestoreSettings(processEnv, databaseId);
    // Positive identity check of the running suite (throws unless it is Catchy's demo-catchy suite).
    await verifyIdentity();
    return createClient(settings);
  }

  const { getFirestore } = await import('firebase-admin/firestore');
  // Keep the exact pre-existing call for `(default)` so catchy-496207 behaves as before.
  return databaseId === DEFAULT_FIRESTORE_DATABASE_ID ? getFirestore(app) : getFirestore(app, databaseId);
}
