// Fail-closed guards for the LOCAL Firebase Emulator mode (development/testing only).
//
// Emulator mode is entered ONLY by `vite --mode emulator` (npm run dev:emulator),
// which loads .env.emulator. In that mode every check below must pass or the
// dev server refuses to start — it never falls back to a real project:
//   - command is `serve` (an emulator bundle is never built or previewed);
//   - VITE_USE_FIREBASE_EMULATORS is exactly "true";
//   - the project id is a `demo-*` project (Firebase treats these as offline-only);
//   - every emulator address is on this machine (127.0.0.1 / localhost / ::1);
//   - no third-party secret (Cloudinary, WhatsApp, Gemini, …) is set;
//   - GOOGLE_APPLICATION_CREDENTIALS is not set and the named Firestore DB is not used.
// The Admin SDK then runs with a credential that refuses to mint real Google
// access tokens, so neither application-default credentials nor
// service-account.json can be used to reach a real project.
//
// Outside emulator mode these guards only refuse a HALF-configured environment
// (emulator variables present without the flag); normal development and
// production builds are otherwise untouched.

export const LOCAL_EMULATOR_HOSTNAMES = ['127.0.0.1', 'localhost', '::1', '[::1]'];
export const DEMO_PROJECT_ID = /^demo-[a-z0-9-]{1,40}$/;

/**
 * Catchy's DEDICATED emulator identity — the single source of truth (firebase.json,
 * .env.emulator, the scripts and the browser config must all match it). The ports
 * deliberately avoid Firebase's defaults, which other emulator suites on this
 * machine use (e.g. another project's suite on 8080/9099/4000/4400/4500/9150).
 */
export const CATCHY_EMULATOR = Object.freeze({
  projectId: 'demo-catchy',
  host: '127.0.0.1',
  ports: Object.freeze({ firestore: 8180, auth: 9199, ui: 4100, hub: 4410, logging: 4510, websocket: 9160 }),
});

/** Firebase's default emulator ports — never valid for Catchy (another suite may own them). */
export const DEFAULT_EMULATOR_PORTS = Object.freeze([8080, 9099, 4000, 4400, 4500, 9150]);

/** Emulator variables the Admin SDK / CLI react to. Present outside emulator mode = misconfiguration. */
const SDK_EMULATOR_VARS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'];

/** Keys that may hold credentials for real external services; all must be empty in emulator mode. */
const EXTERNAL_SECRET_KEYS = [
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'GEMINI_API_KEY',
  'QZ_PRIVATE_KEY',
  'FIREBASE_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
];
const SECRET_LIKE = /(TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|_API_KEY$)/i;

const isSet = (value) => typeof value === 'string' && value.trim() !== '';

/** Parses "host:port" and accepts it only if the host is this machine. Returns null when invalid. */
export function parseLocalHostPort(value) {
  if (!isSet(value)) return null;
  const trimmed = value.trim();
  const match = /^(\[::1\]|[^:\s/]+):(\d{2,5})$/.exec(trimmed);
  if (!match) return null;
  const host = match[1];
  const port = Number(match[2]);
  if (!LOCAL_EMULATOR_HOSTNAMES.includes(host) || port < 1 || port > 65535) return null;
  return { host: host === '[::1]' ? '::1' : host, port, hostPort: trimmed };
}

/**
 * Pure decision for the Vite dev server. `env` is what Vite loaded for this
 * mode (.env, .env.local, .env.<mode>…); `processEnv` is the real process
 * environment (shell variables). Returns { emulator, problems, settings }.
 */
export function evaluateDevEnvironment({ mode, command, env = {}, processEnv = {} }) {
  const requested =
    mode === 'emulator' ||
    isSet(env.VITE_USE_FIREBASE_EMULATORS) ||
    isSet(env.VITE_FIRESTORE_EMULATOR_HOST) ||
    isSet(env.VITE_AUTH_EMULATOR_HOST) ||
    isSet(processEnv.CATCHY_EMULATOR_MODE) ||
    SDK_EMULATOR_VARS.some((key) => isSet(processEnv[key]));

  if (!requested) return { emulator: false, problems: [], settings: null };

  const problems = [];
  if (mode !== 'emulator') problems.push(`emulator settings found but Vite mode is "${mode}" (use: npm run dev:emulator)`);
  if (command !== 'serve') problems.push(`emulator mode is for the local dev server only, not "vite ${command}"`);
  if (env.VITE_USE_FIREBASE_EMULATORS !== 'true') problems.push('VITE_USE_FIREBASE_EMULATORS must be exactly "true"');

  const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? '').trim();
  if (!DEMO_PROJECT_ID.test(projectId)) problems.push('VITE_FIREBASE_PROJECT_ID must be a demo-* project id');
  if (!String(env.VITE_FIREBASE_API_KEY ?? '').startsWith('demo-')) problems.push('VITE_FIREBASE_API_KEY must be a fake demo-* value');
  if (!String(env.VITE_FIREBASE_AUTH_DOMAIN ?? '').startsWith(`${projectId}.`)) problems.push('VITE_FIREBASE_AUTH_DOMAIN must belong to the demo project');
  if (isSet(env.VITE_FIREBASE_STORAGE_BUCKET) && !String(env.VITE_FIREBASE_STORAGE_BUCKET).startsWith(`${projectId}.`)) {
    problems.push('VITE_FIREBASE_STORAGE_BUCKET must belong to the demo project');
  }

  const firestore = parseLocalHostPort(env.VITE_FIRESTORE_EMULATOR_HOST);
  const auth = parseLocalHostPort(env.VITE_AUTH_EMULATOR_HOST);
  if (!firestore) problems.push('VITE_FIRESTORE_EMULATOR_HOST must be a localhost host:port');
  if (!auth) problems.push('VITE_AUTH_EMULATOR_HOST must be a localhost host:port');
  // Only Catchy's dedicated identity is acceptable — never a default port another suite may own.
  if (projectId && projectId !== CATCHY_EMULATOR.projectId) problems.push(`emulator project must be ${CATCHY_EMULATOR.projectId}`);
  if (firestore && firestore.port !== CATCHY_EMULATOR.ports.firestore) {
    problems.push(`VITE_FIRESTORE_EMULATOR_HOST must use Catchy's dedicated port ${CATCHY_EMULATOR.ports.firestore}`);
  }
  if (auth && auth.port !== CATCHY_EMULATOR.ports.auth) {
    problems.push(`VITE_AUTH_EMULATOR_HOST must use Catchy's dedicated port ${CATCHY_EMULATOR.ports.auth}`);
  }
  for (const value of [firestore, auth]) {
    if (value && value.host !== CATCHY_EMULATOR.host) problems.push(`emulator hosts must be exactly ${CATCHY_EMULATOR.host}`);
  }

  // Shell variables, if present, must agree exactly (no pointing the Admin SDK somewhere else).
  if (isSet(processEnv.FIRESTORE_EMULATOR_HOST) && processEnv.FIRESTORE_EMULATOR_HOST.trim() !== firestore?.hostPort) {
    problems.push('FIRESTORE_EMULATOR_HOST in the shell does not match VITE_FIRESTORE_EMULATOR_HOST');
  }
  if (isSet(processEnv.FIREBASE_AUTH_EMULATOR_HOST) && processEnv.FIREBASE_AUTH_EMULATOR_HOST.trim() !== auth?.hostPort) {
    problems.push('FIREBASE_AUTH_EMULATOR_HOST in the shell does not match VITE_AUTH_EMULATOR_HOST');
  }
  if (isSet(processEnv.FIREBASE_STORAGE_EMULATOR_HOST)) problems.push('Storage emulation is not configured; unset FIREBASE_STORAGE_EMULATOR_HOST');
  if (isSet(processEnv.CATCHY_EMULATOR_MODE) && processEnv.CATCHY_EMULATOR_MODE !== '1') problems.push('CATCHY_EMULATOR_MODE must be "1" when set');
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (isSet(processEnv[key]) && processEnv[key].trim() !== projectId) problems.push(`${key} in the shell is not the demo project`);
  }

  // The named "catchy" database is a production setting; the emulator test session uses (default).
  for (const key of ['VITE_FIRESTORE_DATABASE_ID', 'FIRESTORE_DATABASE_ID']) {
    for (const value of [env[key], processEnv[key]]) {
      const v = String(value ?? '').trim();
      if (v && v !== '(default)') {
        problems.push(`${key} must be empty in emulator mode`);
        break;
      }
    }
  }

  // No credentials for any real external service, from the env files OR the shell.
  // Explicit keys (the ones the app actually reads) are checked everywhere. The
  // catch-all "secret-like name" rule covers keys that came from the env FILES
  // (.env / .env.local not overridden by .env.emulator); Vite also merges every
  // shell variable into `env`, and unrelated shell tokens (e.g. a personal
  // GITHUB_TOKEN) are never read by the app, so they are not a reason to refuse.
  const fileKeys = Object.keys(env).filter((k) => !Object.prototype.hasOwnProperty.call(processEnv, k));
  const secretKeys = new Set([...EXTERNAL_SECRET_KEYS, ...fileKeys.filter((k) => SECRET_LIKE.test(k))]);
  secretKeys.delete('VITE_FIREBASE_API_KEY'); // checked above: must be a fake demo-* value
  for (const key of [...secretKeys].sort()) {
    if (isSet(env[key]) || isSet(processEnv[key])) problems.push(`${key} must be empty in emulator mode`);
  }

  return {
    emulator: true,
    problems,
    settings: problems.length ? null : { projectId, firestore, auth },
  };
}

/** Throws (refusing to start) unless the environment is either fully normal or fully, safely emulated. */
export function enforceDevEnvironment(input) {
  const result = evaluateDevEnvironment(input);
  if (result.problems.length) {
    throw new Error(
      '[emulator-guard] Refusing to start — the local emulator configuration is unsafe or incomplete:\n  - ' +
        result.problems.join('\n  - ')
    );
  }
  return result;
}

/**
 * Pins the Node process (the Vite dev server and its API routes) to the
 * emulators, so every firebase-admin call goes to localhost. Removes any
 * credential path and third-party secret from the process environment.
 */
export function applyEmulatorProcessEnv(processEnv, settings) {
  processEnv.CATCHY_EMULATOR_MODE = '1';
  processEnv.FIRESTORE_EMULATOR_HOST = settings.firestore.hostPort;
  processEnv.FIREBASE_AUTH_EMULATOR_HOST = settings.auth.hostPort;
  processEnv.GCLOUD_PROJECT = settings.projectId;
  processEnv.GOOGLE_CLOUD_PROJECT = settings.projectId;
  processEnv.VITE_FIREBASE_PROJECT_ID = settings.projectId;
  delete processEnv.GOOGLE_APPLICATION_CREDENTIALS;
  delete processEnv.FIRESTORE_DATABASE_ID;
  for (const key of EXTERNAL_SECRET_KEYS) delete processEnv[key];
}

// ── Admin SDK side (server/lib/*.js) ─────────────────────────────────────────

/** True only when the dev server has fully entered emulator mode (applyEmulatorProcessEnv ran). */
export function isEmulatorMode(processEnv = process.env) {
  return processEnv.CATCHY_EMULATOR_MODE === '1';
}

/**
 * Validates the Admin SDK environment and returns 'emulator' or 'real'.
 * Throws when emulator variables are present but inconsistent — e.g. an
 * emulator host without emulator mode, or emulator mode pointing off-machine.
 */
export function adminSdkMode(processEnv = process.env) {
  const anyEmulatorVar = SDK_EMULATOR_VARS.some((key) => isSet(processEnv[key]));
  if (!isEmulatorMode(processEnv)) {
    if (anyEmulatorVar || isSet(processEnv.CATCHY_EMULATOR_MODE)) {
      throw new Error('[emulator-guard] Emulator variables are set but emulator mode is not active — refusing to mix local and real services.');
    }
    return 'real';
  }
  const problems = [];
  const fsHost = parseLocalHostPort(processEnv.FIRESTORE_EMULATOR_HOST);
  const authHost = parseLocalHostPort(processEnv.FIREBASE_AUTH_EMULATOR_HOST);
  if (!fsHost) problems.push('FIRESTORE_EMULATOR_HOST is not a localhost address');
  else if (fsHost.port !== CATCHY_EMULATOR.ports.firestore) problems.push("FIRESTORE_EMULATOR_HOST is not Catchy's dedicated port");
  if (!authHost) problems.push('FIREBASE_AUTH_EMULATOR_HOST is not a localhost address');
  else if (authHost.port !== CATCHY_EMULATOR.ports.auth) problems.push("FIREBASE_AUTH_EMULATOR_HOST is not Catchy's dedicated port");
  if (processEnv.GCLOUD_PROJECT !== CATCHY_EMULATOR.projectId) problems.push(`GCLOUD_PROJECT is not ${CATCHY_EMULATOR.projectId}`);
  if (isSet(processEnv.GOOGLE_APPLICATION_CREDENTIALS)) problems.push('GOOGLE_APPLICATION_CREDENTIALS must not be set');
  if (problems.length) throw new Error('[emulator-guard] Unsafe emulator environment: ' + problems.join('; '));
  return 'emulator';
}

/**
 * Admin SDK credential for emulator mode. The emulators never need a real
 * token; if anything ever asks this credential for one, it fails loudly
 * instead of using application-default credentials or service-account.json.
 */
export function emulatorOnlyCredential() {
  return {
    getAccessToken: async () => {
      throw new Error('[emulator-guard] Real Google credentials are disabled in emulator mode.');
    },
  };
}

/**
 * The single place server code picks an Admin SDK credential:
 *  - emulator mode → emulatorOnlyCredential() (never touches disk or ADC);
 *  - otherwise     → `realCredential()`, exactly as before.
 */
export function adminCredential(realCredential, processEnv = process.env) {
  return adminSdkMode(processEnv) === 'emulator' ? emulatorOnlyCredential() : realCredential();
}

/** For the production Express server (`npm start`): it loads the real .env, so it must never run in emulator mode. */
export function assertServerNotInEmulatorMode(processEnv = process.env) {
  if (isSet(processEnv.CATCHY_EMULATOR_MODE) || SDK_EMULATOR_VARS.some((key) => isSet(processEnv[key]))) {
    throw new Error('[emulator-guard] server/index.js (npm start) cannot run with emulator variables — use npm run dev:emulator.');
  }
}
