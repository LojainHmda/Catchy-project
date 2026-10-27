// POSITIVE identity check: proves that the emulators on Catchy's dedicated ports
// are Catchy's own suite for demo-catchy — not merely "something is listening".
// Fails closed: anything missing, ambiguous or different is a refusal.
//
// Layers (each must pass; later layers run only if earlier ones did):
//  1. Config (offline): firebase.json matches Catchy's dedicated identity exactly
//     (target.mjs) — dedicated ports on 127.0.0.1, never a Firebase default port.
//  2. Operating system (no network): the process that owns EACH dedicated port is
//     inspected. Only processes owning Catchy's ports are ever looked at.
//       - Auth (9199), hub (4410) and logging (4510) are owned by one node process
//         whose command line runs firebase-tools from THIS repository's
//         node_modules with `emulators:start` and `--project demo-catchy`.
//       - Firestore (8180) and its WebSocket (9160) are owned by one java process
//         that is a child of that CLI, running the cloud-firestore-emulator jar
//         with --project_id demo-catchy, --host 127.0.0.1, --port 8180,
//         --websocket_port 9160 and --rules <this repo>\firestore.rules.
//       - The UI (4100) is owned by the CLI or one of its children.
//       - Every listener is bound to 127.0.0.1 only.
//  3. HTTP — only to dedicated ports, only after layer 2 passed:
//       - hub GET / lists exactly its own origin http://127.0.0.1:4410;
//       - hub GET /emulators lists firestore 127.0.0.1:8180 and auth 127.0.0.1:9199;
//       - the CLI's locator file <tmp>/hub-demo-catchy.json names the same origin;
//       - Emulator UI GET /api/config reports projectId "demo-catchy";
//       - Auth GET /emulator/v1/projects/demo-catchy/config succeeds.
// No single HTTP response or open port is treated as proof.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CATCHY_EMULATOR, DEFAULT_EMULATOR_PORTS } from '../../server/lib/emulatorGuard.js';
import { createEmulatorFetch, repoRoot as defaultRepoRoot, resolveEmulatorTarget } from './target.mjs';

const norm = (value) => String(value ?? '').replace(/\//g, '\\').replace(/\\+/g, '\\').toLowerCase();

/**
 * Windows inspector: listeners on the given ports (LISTEN state) and the
 * process records of ONLY the PIDs that own them. No network access.
 */
export function createWindowsInspector() {
  const run = (script) =>
    new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000 }, (error, stdout) =>
        error ? reject(error) : resolve(stdout.trim())
      );
    });
  const asArray = (json) => (json ? [].concat(JSON.parse(json)) : []);
  return {
    async listeners(ports) {
      for (const port of ports) if (!Number.isInteger(port)) throw new Error('invalid port');
      const json = await run(
        `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { @(${ports.join(',')}) -contains $_.LocalPort } | ` +
          'Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress'
      );
      return asArray(json).map((l) => ({ address: String(l.LocalAddress), port: Number(l.LocalPort), pid: Number(l.OwningProcess) }));
    },
    async processes(pids) {
      const ids = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
      if (!ids.length) return [];
      const filter = ids.map((pid) => `ProcessId = ${pid}`).join(' OR ');
      const json = await run(
        `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`
      );
      return asArray(json).map((p) => ({ pid: Number(p.ProcessId), parentPid: Number(p.ParentProcessId), name: String(p.Name ?? ''), commandLine: String(p.CommandLine ?? '') }));
    },
  };
}

/**
 * @returns {Promise<{ ok: boolean, problems: string[], stage: 'config'|'process'|'http'|'done' }>}
 * Never throws for an identity mismatch — returns ok:false with every reason.
 */
export async function verifyCatchyEmulatorIdentity({
  firebaseJson,
  repoRoot = defaultRepoRoot,
  inspector,
  fetchImpl = globalThis.fetch,
  readLocator = (file) => readFile(file, 'utf8'),
  tmpdir = os.tmpdir(),
  platform = process.platform,
} = {}) {
  const problems = [];

  // ── Layer 1: config ──
  let target;
  try {
    target = resolveEmulatorTarget({ firebaseJson });
  } catch (error) {
    return { ok: false, stage: 'config', problems: [String(error.message)] };
  }
  if (!inspector) {
    if (platform !== 'win32') {
      return { ok: false, stage: 'process', problems: ['Process identity can only be verified on Windows; refusing.'] };
    }
    inspector = createWindowsInspector();
  }

  // ── Layer 2: operating-system process identity (no network) ──
  const p = CATCHY_EMULATOR.ports;
  const dedicated = [p.firestore, p.websocket, p.auth, p.ui, p.hub, p.logging];
  let listeners;
  try {
    listeners = await inspector.listeners(dedicated);
  } catch (error) {
    return { ok: false, stage: 'process', problems: [`Could not inspect listening ports: ${error.message}`] };
  }
  const ownerOf = (port) => {
    const owners = [...new Set(listeners.filter((l) => l.port === port).map((l) => l.pid))];
    if (owners.length === 0) problems.push(`Nothing is listening on Catchy's port ${port} — emulators not running.`);
    else if (owners.length > 1) problems.push(`Port ${port} is shared by several processes — ambiguous, refusing.`);
    return owners.length === 1 ? owners[0] : null;
  };
  for (const l of listeners) {
    if (l.address !== CATCHY_EMULATOR.host) problems.push(`Port ${l.port} is bound to ${l.address}, not ${CATCHY_EMULATOR.host} only.`);
  }
  const cliPid = ownerOf(p.auth);
  const hubPid = ownerOf(p.hub);
  const loggingPid = ownerOf(p.logging);
  const firestorePid = ownerOf(p.firestore);
  const websocketPid = ownerOf(p.websocket);
  const uiPid = ownerOf(p.ui);
  if (problems.length) return { ok: false, stage: 'process', problems };

  if (hubPid !== cliPid || loggingPid !== cliPid) problems.push('Auth, hub and logging are not owned by the same emulator CLI process.');
  if (websocketPid !== firestorePid) problems.push('Firestore and its WebSocket port are owned by different processes.');

  let procs;
  try {
    procs = await inspector.processes([cliPid, firestorePid, uiPid]);
  } catch (error) {
    return { ok: false, stage: 'process', problems: [`Could not inspect emulator processes: ${error.message}`] };
  }
  const proc = (pid) => procs.find((x) => x.pid === pid);
  const cli = proc(cliPid);
  const java = proc(firestorePid);
  const ui = proc(uiPid);
  const root = norm(repoRoot);

  if (!cli) problems.push('The emulator CLI process could not be inspected.');
  else {
    const cmd = norm(cli.commandLine);
    if (!/^node(\.exe)?$/i.test(cli.name)) problems.push('The Auth/hub port is not owned by a Node.js process.');
    if (!cmd.includes(`${root}\\node_modules\\`) || !cmd.includes('firebase-tools')) problems.push("The emulator CLI is not this repository's firebase-tools.");
    if (!cmd.includes('emulators:start')) problems.push('The process on the Auth/hub port is not `firebase emulators:start`.');
    if (!new RegExp(`--project(=|\\s+)${CATCHY_EMULATOR.projectId}(\\s|$)`).test(cmd)) problems.push(`The emulator CLI was not started with --project ${CATCHY_EMULATOR.projectId}.`);
  }
  if (!java) problems.push('The Firestore emulator process could not be inspected.');
  else {
    const cmd = norm(java.commandLine);
    if (!/^java(\.exe)?$/i.test(java.name)) problems.push('The Firestore port is not owned by a Java process.');
    if (!cmd.includes('cloud-firestore-emulator')) problems.push('The Firestore port is not running the Firestore emulator jar.');
    if (cli && java.parentPid !== cli.pid) problems.push('The Firestore emulator was not started by Catchy\'s emulator CLI.');
    const flags = [
      `--project_id ${CATCHY_EMULATOR.projectId}`,
      `--host ${CATCHY_EMULATOR.host}`,
      `--port ${p.firestore}`,
      `--websocket_port ${p.websocket}`,
      `--rules ${root}\\firestore.rules`,
    ];
    for (const flag of flags) {
      if (!new RegExp(`${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|"|$)`).test(cmd)) problems.push(`The Firestore emulator is missing \`${flag}\`.`);
    }
  }
  if (!ui) problems.push('The Emulator UI process could not be inspected.');
  else if (cli && ui.pid !== cli.pid && ui.parentPid !== cli.pid) problems.push('The Emulator UI was not started by Catchy\'s emulator CLI.');
  if (problems.length) return { ok: false, stage: 'process', problems };

  // ── Layer 3: HTTP — dedicated ports only, after process identity passed ──
  const emulatorFetch = createEmulatorFetch(target, fetchImpl);
  const getJson = async (url, what) => {
    try {
      const res = await emulatorFetch(url, { method: 'GET' });
      if (!res.ok) {
        problems.push(`${what} answered HTTP ${res.status}.`);
        return null;
      }
      return await res.json();
    } catch (error) {
      problems.push(`${what} unavailable: ${error.message}`);
      return null;
    }
  };
  const hubOrigin = `http://${CATCHY_EMULATOR.host}:${p.hub}`;
  const hub = await getJson(`${target.hub.base}/`, 'Emulator hub');
  if (hub && !(Array.isArray(hub.origins) && hub.origins.length > 0 && hub.origins.every((o) => o === hubOrigin))) {
    problems.push('The emulator hub does not report its own dedicated origin.');
  }
  const running = await getJson(`${target.hub.base}/emulators`, 'Emulator hub list');
  if (running) {
    const ok = (name, port) => running[name] && running[name].host === CATCHY_EMULATOR.host && Number(running[name].port) === port;
    if (!ok('firestore', p.firestore)) problems.push('The hub does not list Firestore on 127.0.0.1:8180.');
    if (!ok('auth', p.auth)) problems.push('The hub does not list Auth on 127.0.0.1:9199.');
  }
  try {
    const locator = JSON.parse(await readLocator(path.join(tmpdir, `hub-${CATCHY_EMULATOR.projectId}.json`)));
    if (!Array.isArray(locator.origins) || !locator.origins.includes(hubOrigin)) problems.push(`The ${CATCHY_EMULATOR.projectId} hub locator names a different hub.`);
  } catch {
    problems.push(`No hub locator for ${CATCHY_EMULATOR.projectId} — the running suite is not registered for that project.`);
  }
  const uiConfig = await getJson(`${target.ui.base}/api/config`, 'Emulator UI config');
  if (uiConfig && uiConfig.projectId !== CATCHY_EMULATOR.projectId) problems.push(`The Emulator UI reports project "${uiConfig.projectId}", not ${CATCHY_EMULATOR.projectId}.`);
  await getJson(`${target.auth.base}/emulator/v1/projects/${CATCHY_EMULATOR.projectId}/config`, 'Auth emulator project config');

  return problems.length ? { ok: false, stage: 'http', problems } : { ok: true, stage: 'done', problems: [] };
}

/** Throws (refuses) unless the identity is positively verified. */
export async function assertCatchyEmulatorIdentity(options) {
  const result = await verifyCatchyEmulatorIdentity(options);
  if (!result.ok) {
    throw new Error(
      `[emulator-identity] Refusing — could not positively verify Catchy's ${CATCHY_EMULATOR.projectId} emulators (${result.stage}):\n  - ` +
        result.problems.join('\n  - ')
    );
  }
  return result;
}

export { DEFAULT_EMULATOR_PORTS };
