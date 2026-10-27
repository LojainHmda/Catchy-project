// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyCatchyEmulatorIdentity, assertCatchyEmulatorIdentity } from './identity.mjs';

// Fully offline: the OS inspector, fetch and the locator file are fakes. Each
// scenario also checks WHICH ports/processes were touched — HTTP must never be
// attempted before process identity passes, and never to a default port.

const REPO = 'C:\\Users\\USER\\Catchy-project';
const firebaseJson = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));

const CATCHY_CLI = `"node"   "${REPO}\\node_modules\\.bin\\\\..\\firebase-tools\\lib\\bin\\firebase.js" emulators:start --only auth,firestore --project demo-catchy`;
const CATCHY_JAVA =
  'java -Dgoogle.cloud_firestore.debug_log_level=FINE -jar C:\\Users\\USER\\.cache\\firebase\\emulators\\cloud-firestore-emulator-v1.22.0.jar ' +
  `--host 127.0.0.1 --port 8180 --websocket_port 9160 --database-edition standard --project_id demo-catchy --rules ${REPO}\\firestore.rules --single_project_mode true`;
const CATCHY_UI = 'node C:\\Users\\USER\\.cache\\firebase\\emulators\\ui-v1.15.0\\server\\server.mjs';

// A different project's suite (shape of what is running on this machine on the DEFAULT ports).
const OTHER_CLI = '"node"   "C:\\Users\\USER\\other-store\\node_modules\\.bin\\\\..\\firebase-tools\\lib\\bin\\firebase.js" emulators:start --only firestore,auth';
const OTHER_JAVA =
  'java -jar C:\\Users\\USER\\.cache\\firebase\\emulators\\cloud-firestore-emulator-v1.22.0.jar --host 127.0.0.1 --port 8180 --websocket_port 9160 ' +
  '--project_id other-project --rules C:\\Users\\USER\\other-store\\firestore.rules --single_project_mode true';

function goodListeners() {
  return [
    { address: '127.0.0.1', port: 9199, pid: 100 },
    { address: '127.0.0.1', port: 4410, pid: 100 },
    { address: '127.0.0.1', port: 4510, pid: 100 },
    { address: '127.0.0.1', port: 8180, pid: 200 },
    { address: '127.0.0.1', port: 9160, pid: 200 },
    { address: '127.0.0.1', port: 4100, pid: 300 },
  ];
}
function goodProcesses() {
  return [
    { pid: 100, parentPid: 50, name: 'node.exe', commandLine: CATCHY_CLI },
    { pid: 200, parentPid: 100, name: 'java.exe', commandLine: CATCHY_JAVA },
    { pid: 300, parentPid: 100, name: 'node.exe', commandLine: CATCHY_UI },
  ];
}

function scenario({ listeners = goodListeners(), processes = goodProcesses(), http = {}, locator } = {}) {
  const inspectedPids = [];
  const inspector = {
    listeners: vi.fn(async () => listeners),
    processes: vi.fn(async (pids) => {
      inspectedPids.push(...pids);
      return processes.filter((p) => pids.includes(p.pid));
    }),
  };
  const responses = {
    'http://127.0.0.1:4410/': { status: 200, body: { version: '13.35.1', origins: ['http://127.0.0.1:4410'] } },
    'http://127.0.0.1:4410/emulators': {
      status: 200,
      body: { firestore: { name: 'firestore', host: '127.0.0.1', port: 8180 }, auth: { name: 'auth', host: '127.0.0.1', port: 9199 } },
    },
    'http://127.0.0.1:4100/api/config': { status: 200, body: { projectId: 'demo-catchy' } },
    'http://127.0.0.1:9199/emulator/v1/projects/demo-catchy/config': { status: 200, body: {} },
    ...http,
  };
  const fetchImpl = vi.fn(async (url) => {
    const r = responses[url];
    if (r instanceof Error) throw r;
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  const readLocator = vi.fn(async () => {
    if (locator === null) throw new Error('ENOENT');
    return JSON.stringify(locator ?? { version: '13.35.1', origins: ['http://127.0.0.1:4410'] });
  });
  const run = (extra = {}) => verifyCatchyEmulatorIdentity({ firebaseJson, repoRoot: REPO, inspector, fetchImpl, readLocator, tmpdir: 'C:\\Temp', ...extra });
  return { run, inspector, fetchImpl, readLocator, inspectedPids };
}

const fetchedPorts = (fetchImpl) => [...new Set(fetchImpl.mock.calls.map(([url]) => Number(new URL(url).port)))].sort();

describe('positive identity: Catchy-only configuration', () => {
  it('passes only when config, processes and HTTP all prove demo-catchy on the dedicated ports', async () => {
    const s = scenario();
    expect(await s.run()).toEqual({ ok: true, stage: 'done', problems: [] });
    expect(fetchedPorts(s.fetchImpl)).toEqual([4100, 4410, 9199]); // dedicated ports only
    expect([...new Set(s.inspectedPids)].sort()).toEqual([100, 200, 300]); // only owners of Catchy's ports
    expect(s.readLocator).toHaveBeenCalledWith('C:\\Temp\\hub-demo-catchy.json');
  });
});

describe('another suite running on the DEFAULT ports (the situation on this machine)', () => {
  it('refuses when nothing is on Catchy\'s dedicated ports, without contacting anything', async () => {
    // The OS table only reports listeners on Catchy's ports; the other suite (8080/9099/…) is never looked at.
    const s = scenario({ listeners: [] });
    const result = await s.run();
    expect(result).toMatchObject({ ok: false, stage: 'process' });
    expect(result.problems.join(' ')).toMatch(/Nothing is listening on Catchy's port/);
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.inspector.processes).not.toHaveBeenCalled();
  });
});

describe('occupied dedicated ports / wrong project identity', () => {
  it('refuses another project\'s suite occupying Catchy\'s ports — and never sends it HTTP', async () => {
    const s = scenario({
      processes: [
        { pid: 100, parentPid: 50, name: 'node.exe', commandLine: OTHER_CLI },
        { pid: 200, parentPid: 100, name: 'java.exe', commandLine: OTHER_JAVA },
        { pid: 300, parentPid: 100, name: 'node.exe', commandLine: CATCHY_UI },
      ],
    });
    const result = await s.run();
    expect(result.stage).toBe('process');
    const text = result.problems.join(' ');
    expect(text).toMatch(/not this repository's firebase-tools/);
    expect(text).toMatch(/--project demo-catchy/);
    expect(text).toMatch(/--project_id demo-catchy/);
    expect(text).toMatch(/--rules/);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a Firestore emulator for a different project even when everything else matches', async () => {
    const procs = goodProcesses();
    procs[1] = { ...procs[1], commandLine: CATCHY_JAVA.replace('--project_id demo-catchy', '--project_id demo-other') };
    const s = scenario({ processes: procs });
    expect((await s.run()).problems.join(' ')).toMatch(/--project_id demo-catchy/);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a CLI started for a different project', async () => {
    const procs = goodProcesses();
    procs[0] = { ...procs[0], commandLine: CATCHY_CLI.replace('--project demo-catchy', '--project demo-other') };
    expect((await scenario({ processes: procs }).run()).problems.join(' ')).toMatch(/--project demo-catchy/);
  });

  it('refuses a Firestore process that was not started by Catchy\'s CLI', async () => {
    const procs = goodProcesses();
    procs[1] = { ...procs[1], parentPid: 999 };
    expect((await scenario({ processes: procs }).run()).problems.join(' ')).toMatch(/not started by Catchy's emulator CLI/);
  });

  it('refuses a non-emulator process (e.g. some web server) squatting on a dedicated port', async () => {
    const procs = goodProcesses();
    procs[1] = { pid: 200, parentPid: 1, name: 'nginx.exe', commandLine: 'nginx -p 8180' };
    const s = scenario({ processes: procs });
    const text = (await s.run()).problems.join(' ');
    expect(text).toMatch(/not owned by a Java process/);
    expect(text).toMatch(/Firestore emulator jar/);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses ports bound beyond 127.0.0.1, shared/ambiguous ports, and split ownership', async () => {
    const wide = goodListeners().map((l) => (l.port === 9199 ? { ...l, address: '0.0.0.0' } : l));
    expect((await scenario({ listeners: wide }).run()).problems.join(' ')).toMatch(/bound to 0\.0\.0\.0/);

    const shared = [...goodListeners(), { address: '127.0.0.1', port: 8180, pid: 777 }];
    expect((await scenario({ listeners: shared }).run()).problems.join(' ')).toMatch(/ambiguous/);

    const split = goodListeners().map((l) => (l.port === 4410 ? { ...l, pid: 555 } : l));
    expect((await scenario({ listeners: split }).run()).problems.join(' ')).toMatch(/not owned by the same emulator CLI/);
  });
});

describe('an open port or an HTTP answer alone is never proof', () => {
  it('open ports whose processes cannot be inspected → refused, no HTTP', async () => {
    const s = scenario({ processes: [] });
    const result = await s.run();
    expect(result.stage).toBe('process');
    expect(result.problems.join(' ')).toMatch(/could not be inspected/);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('perfect-looking HTTP answers do not rescue a failed process check', async () => {
    const procs = goodProcesses();
    procs[0] = { ...procs[0], commandLine: OTHER_CLI };
    const s = scenario({ processes: procs }); // HTTP fakes all say demo-catchy
    expect((await s.run()).ok).toBe(false);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('if the OS inspection itself fails, the result is a refusal', async () => {
    const s = scenario();
    s.inspector.listeners.mockRejectedValueOnce(new Error('access denied'));
    expect(await s.run()).toMatchObject({ ok: false, stage: 'process' });
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('HTTP identity layer (runs only after process identity passed)', () => {
  it.each([
    ['Emulator UI reports another project', { 'http://127.0.0.1:4100/api/config': { status: 200, body: { projectId: 'other-project' } } }, /reports project "other-project"/],
    ['hub reports a different origin', { 'http://127.0.0.1:4410/': { status: 200, body: { origins: ['http://127.0.0.1:4400'] } } }, /own dedicated origin/],
    ['hub does not list Auth on 9199', { 'http://127.0.0.1:4410/emulators': { status: 200, body: { firestore: { host: '127.0.0.1', port: 8180 } } } }, /Auth on 127\.0\.0\.1:9199/],
    ['hub lists Firestore on the default port', { 'http://127.0.0.1:4410/emulators': { status: 200, body: { firestore: { host: '127.0.0.1', port: 8080 }, auth: { host: '127.0.0.1', port: 9199 } } } }, /Firestore on 127\.0\.0\.1:8180/],
    ['Auth emulator has no demo-catchy project', { 'http://127.0.0.1:9199/emulator/v1/projects/demo-catchy/config': { status: 400, body: {} } }, /Auth emulator project config answered HTTP 400/],
    ['an endpoint is unavailable', { 'http://127.0.0.1:4100/api/config': new Error('ECONNREFUSED') }, /Emulator UI config unavailable/],
  ])('refuses when %s', async (_label, http, message) => {
    const result = await scenario({ http }).run();
    expect(result).toMatchObject({ ok: false, stage: 'http' });
    expect(result.problems.join(' ')).toMatch(message);
  });

  it('refuses without a demo-catchy hub locator, or with one naming another hub', async () => {
    expect((await scenario({ locator: null }).run()).problems.join(' ')).toMatch(/No hub locator for demo-catchy/);
    expect((await scenario({ locator: { origins: ['http://127.0.0.1:4400'] } }).run()).problems.join(' ')).toMatch(/names a different hub/);
  });
});

describe('wrong configuration is refused before anything is inspected', () => {
  it.each([
    ['default Firestore port', { firestore: { host: '127.0.0.1', port: 8080, websocketPort: 9160 } }, /default port 8080/],
    ['default Auth port', { auth: { host: '127.0.0.1', port: 9099 } }, /default port 9099/],
    ['default UI port', { ui: { enabled: true, host: '127.0.0.1', port: 4000 } }, /default port 4000/],
    ['wrong hub port', { hub: { host: '127.0.0.1', port: 4411 } }, /dedicated port 4410/],
    ['wrong WebSocket port', { firestore: { host: '127.0.0.1', port: 8180, websocketPort: 9150 } }, /websocketPort must be 9160/],
    ['a non-local host', { auth: { host: '0.0.0.0', port: 9199 } }, /must be 127\.0\.0\.1/],
    ['single-project mode off', { singleProjectMode: false }, /singleProjectMode/],
  ])('%s', async (_label, override, message) => {
    const s = scenario();
    const result = await s.run({ firebaseJson: { ...firebaseJson, emulators: { ...firebaseJson.emulators, ...override } } });
    expect(result).toMatchObject({ ok: false, stage: 'config' });
    expect(result.problems.join(' ')).toMatch(message);
    expect(s.inspector.listeners).not.toHaveBeenCalled();
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses on a platform where process identity cannot be verified', async () => {
    const result = await verifyCatchyEmulatorIdentity({ firebaseJson, platform: 'linux' });
    expect(result).toMatchObject({ ok: false, stage: 'process' });
  });

  it('assertCatchyEmulatorIdentity throws with every reason', async () => {
    const s = scenario({ listeners: [] });
    await expect(
      assertCatchyEmulatorIdentity({ firebaseJson, repoRoot: REPO, inspector: s.inspector, fetchImpl: s.fetchImpl, readLocator: s.readLocator })
    ).rejects.toThrow(/Refusing — could not positively verify Catchy's demo-catchy emulators \(process\)/);
  });
});
