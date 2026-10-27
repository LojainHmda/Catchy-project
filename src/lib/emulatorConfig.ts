// Browser-side, fail-closed resolution of the LOCAL Firebase Emulator mode.
// Mirrors server/lib/emulatorGuard.js. Emulator mode exists only in the dev
// server started with `vite --mode emulator` (npm run dev:emulator), which loads
// .env.emulator. Normal development and production builds never set
// VITE_USE_FIREBASE_EMULATORS, so this returns null and nothing changes.

export type EmulatorSettings = {
  projectId: string;
  firestore: { host: string; port: number };
  /** URL for connectAuthEmulator, e.g. http://127.0.0.1:9199 */
  authUrl: string;
};

type EnvLike = Record<string, string | boolean | undefined>;

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];
const DEMO_PROJECT_ID = /^demo-[a-z0-9-]{1,40}$/;

/** Must equal CATCHY_EMULATOR in server/lib/emulatorGuard.js (a test enforces this). */
export const CATCHY_EMULATOR_CLIENT = Object.freeze({
  projectId: 'demo-catchy',
  host: '127.0.0.1',
  firestorePort: 8180,
  authPort: 9199,
});

function str(value: string | boolean | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function localHostPort(value: string): { host: string; port: number } | null {
  const match = /^(\[::1\]|[^:\s/]+):(\d{2,5})$/.exec(value);
  if (!match) return null;
  const port = Number(match[2]);
  if (!LOCAL_HOSTS.includes(match[1]!) || port < 1 || port > 65535) return null;
  return { host: match[1] === '[::1]' ? '::1' : match[1]!, port };
}

/**
 * Returns the emulator settings, or null for normal (non-emulator) operation.
 * Throws — so the app refuses to start — whenever emulator settings are present
 * but incomplete, inconsistent, outside a dev build, or not pointing at this machine.
 */
export function resolveEmulatorSettings(env: EnvLike, isDevBuild: boolean): EmulatorSettings | null {
  const flag = str(env.VITE_USE_FIREBASE_EMULATORS);
  const firestoreHost = str(env.VITE_FIRESTORE_EMULATOR_HOST);
  const authHost = str(env.VITE_AUTH_EMULATOR_HOST);

  if (!flag && !firestoreHost && !authHost) return null;

  const problems: string[] = [];
  if (flag !== 'true') problems.push('VITE_USE_FIREBASE_EMULATORS must be exactly "true"');
  if (!isDevBuild) problems.push('emulator mode is only allowed in the local dev server, never in a build');

  const projectId = str(env.VITE_FIREBASE_PROJECT_ID);
  if (!DEMO_PROJECT_ID.test(projectId)) problems.push('VITE_FIREBASE_PROJECT_ID must be a demo-* project id');
  if (!str(env.VITE_FIREBASE_API_KEY).startsWith('demo-')) problems.push('VITE_FIREBASE_API_KEY must be a fake demo-* value');

  const dbId = str(env.VITE_FIRESTORE_DATABASE_ID);
  if (dbId && dbId !== '(default)') problems.push('VITE_FIRESTORE_DATABASE_ID must be empty in emulator mode');

  const firestore = localHostPort(firestoreHost);
  const auth = localHostPort(authHost);
  if (!firestore) problems.push('VITE_FIRESTORE_EMULATOR_HOST must be a localhost host:port');
  if (!auth) problems.push('VITE_AUTH_EMULATOR_HOST must be a localhost host:port');
  // Only Catchy's dedicated identity — never a default port another emulator suite may own.
  if (projectId && projectId !== CATCHY_EMULATOR_CLIENT.projectId) problems.push(`emulator project must be ${CATCHY_EMULATOR_CLIENT.projectId}`);
  if (firestore && (firestore.host !== CATCHY_EMULATOR_CLIENT.host || firestore.port !== CATCHY_EMULATOR_CLIENT.firestorePort)) {
    problems.push(`VITE_FIRESTORE_EMULATOR_HOST must be ${CATCHY_EMULATOR_CLIENT.host}:${CATCHY_EMULATOR_CLIENT.firestorePort}`);
  }
  if (auth && (auth.host !== CATCHY_EMULATOR_CLIENT.host || auth.port !== CATCHY_EMULATOR_CLIENT.authPort)) {
    problems.push(`VITE_AUTH_EMULATOR_HOST must be ${CATCHY_EMULATOR_CLIENT.host}:${CATCHY_EMULATOR_CLIENT.authPort}`);
  }

  if (problems.length || !firestore || !auth) {
    throw new Error('[emulator-guard] Refusing to start the app — unsafe emulator configuration:\n  - ' + problems.join('\n  - '));
  }

  const authHostForUrl = auth.host === '::1' ? '[::1]' : auth.host;
  return { projectId, firestore, authUrl: `http://${authHostForUrl}:${auth.port}` };
}
