// Where Catchy's LOCAL emulators are, and a fetch that can only ever reach them.
// The seed/reset scripts use no Firebase SDK and no credentials: plain HTTP to
// the emulators' local REST endpoints, every URL re-validated before sending.
// An open port or an HTTP answer is NOT proof of identity — see identity.mjs,
// which must pass before any of these requests are made.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATCHY_EMULATOR, DEFAULT_EMULATOR_PORTS } from '../../server/lib/emulatorGuard.js';

export const EMULATOR_PROJECT_ID = CATCHY_EMULATOR.projectId;
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads firebase.json → "emulators" (the file the emulators start from) and
 * refuses unless it matches Catchy's dedicated identity EXACTLY: host
 * 127.0.0.1, ports firestore 8180 / websocket 9160 / auth 9199 / ui 4100 /
 * hub 4410 / logging 4510, and never a Firebase default port.
 */
export function resolveEmulatorTarget({ firebaseJson, projectId = EMULATOR_PROJECT_ID } = {}) {
  const config = firebaseJson ?? JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  const emulators = config?.emulators;
  if (!emulators) throw new Error('[emulator] firebase.json has no "emulators" block.');
  if (projectId !== CATCHY_EMULATOR.projectId) throw new Error(`[emulator] Refusing project id "${projectId}" — only ${CATCHY_EMULATOR.projectId}.`);
  if (emulators.singleProjectMode !== true) throw new Error('[emulator] firebase.json must set emulators.singleProjectMode = true.');

  const expected = {
    firestore: CATCHY_EMULATOR.ports.firestore,
    auth: CATCHY_EMULATOR.ports.auth,
    ui: CATCHY_EMULATOR.ports.ui,
    hub: CATCHY_EMULATOR.ports.hub,
    logging: CATCHY_EMULATOR.ports.logging,
  };
  const endpoints = {};
  for (const [name, port] of Object.entries(expected)) {
    const host = String(emulators[name]?.host ?? '');
    const actual = Number(emulators[name]?.port);
    if (host !== CATCHY_EMULATOR.host) throw new Error(`[emulator] ${name} emulator host must be ${CATCHY_EMULATOR.host} (found "${host}").`);
    if (DEFAULT_EMULATOR_PORTS.includes(actual)) throw new Error(`[emulator] ${name} uses Firebase default port ${actual}, which another suite may own.`);
    if (actual !== port) throw new Error(`[emulator] ${name} must use Catchy's dedicated port ${port} (found ${actual}).`);
    endpoints[name] = { host, port, base: `http://${host}:${port}` };
  }
  const websocketPort = Number(emulators.firestore?.websocketPort);
  if (websocketPort !== CATCHY_EMULATOR.ports.websocket) {
    throw new Error(`[emulator] firestore.websocketPort must be ${CATCHY_EMULATOR.ports.websocket} (found ${emulators.firestore?.websocketPort}).`);
  }

  return {
    projectId,
    ...endpoints,
    websocketPort,
    // HTTP is only ever allowed to these dedicated ports.
    allowedPorts: new Set([endpoints.firestore.port, endpoints.auth.port, endpoints.ui.port, endpoints.hub.port]),
  };
}

/** Throws unless `url` is plain http to one of Catchy's dedicated local ports. */
export function assertLocalEmulatorUrl(url, target) {
  const parsed = new URL(url);
  const port = Number(parsed.port);
  if (parsed.protocol !== 'http:') throw new Error(`[emulator] Blocked non-http URL: ${parsed.protocol}`);
  if (parsed.hostname !== CATCHY_EMULATOR.host) throw new Error(`[emulator] Blocked non-local host: ${parsed.hostname}`);
  if (DEFAULT_EMULATOR_PORTS.includes(port)) throw new Error(`[emulator] Blocked Firebase default port ${port} (not Catchy's).`);
  if (!target.allowedPorts.has(port)) throw new Error(`[emulator] Blocked port ${parsed.port}`);
  const rootLike = parsed.pathname === '/' || parsed.pathname === '/emulators' || parsed.pathname === '/api/config';
  if (!rootLike && !parsed.pathname.includes(`/projects/${target.projectId}/`)) {
    throw new Error('[emulator] Blocked request outside the demo project.');
  }
  return parsed;
}

/** fetch() that refuses anything but Catchy's dedicated local emulator ports. `fetchImpl` is injectable for tests. */
export function createEmulatorFetch(target, fetchImpl = globalThis.fetch) {
  return async (url, init = {}) => {
    assertLocalEmulatorUrl(url, target);
    // "Bearer owner" is the emulators' admin token: bypasses security rules, valid ONLY on emulators.
    const headers = { Authorization: 'Bearer owner', ...(init.headers ?? {}) };
    return fetchImpl(url, { ...init, headers });
  };
}
