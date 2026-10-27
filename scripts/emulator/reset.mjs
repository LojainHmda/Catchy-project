// npm run emulator:reset — wipes ALL data from the LOCAL emulators (Firestore documents
// and Auth accounts of demo-catchy). Same local-only checks as the seed script.
import { resolveEmulatorTarget } from './target.mjs';
import { resetEmulators } from './emulatorClient.mjs';

try {
  const target = resolveEmulatorTarget();
  await resetEmulators(target);
  console.log(`[emulator] Cleared all Firestore documents and Auth accounts in ${target.projectId} (local emulators only).`);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
