// npm run emulator:check — OFFLINE preflight for local emulator mode.
// Reads the env files exactly as `vite --mode emulator` would and runs the same
// guard as vite.config.ts, plus firebase.json consistency. Makes no network
// connection and prints only setting NAMES and pass/fail — never values.
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluateDevEnvironment } from '../../server/lib/emulatorGuard.js';
import { resolveEmulatorTarget } from './target.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runPreflight({ env, processEnv, firebaseJson } = {}) {
  const problems = [];
  const loaded = env ?? loadEnv('emulator', repoRoot, '');
  const result = evaluateDevEnvironment({ mode: 'emulator', command: 'serve', env: loaded, processEnv: processEnv ?? {} });
  problems.push(...result.problems);

  try {
    const target = resolveEmulatorTarget({ firebaseJson });
    if (result.settings) {
      if (result.settings.firestore.port !== target.firestore.port) problems.push('Firestore port differs between .env.emulator and firebase.json');
      if (result.settings.auth.port !== target.auth.port) problems.push('Auth port differs between .env.emulator and firebase.json');
      if (result.settings.projectId !== target.projectId) problems.push('Project id differs between .env.emulator and the seed/reset scripts');
    }
  } catch (error) {
    problems.push(String(error?.message ?? error));
  }
  return { ok: problems.length === 0, problems, projectId: result.settings?.projectId ?? null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok, problems, projectId } = runPreflight({ processEnv: process.env });
  if (ok) {
    console.log(`[emulator-check] OK — emulator mode is fully local (project ${projectId}); external services are blank.`);
  } else {
    console.error('[emulator-check] FAILED — emulator mode would be refused:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
}
