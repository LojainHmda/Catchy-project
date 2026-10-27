// npm run emulator:verify — POSITIVELY verifies that the emulators on Catchy's
// dedicated ports are Catchy's own demo-catchy suite (identity.mjs). Exits 1 and
// refuses on anything less. Talks only to Catchy's dedicated 127.0.0.1 ports, and
// only after the operating-system process checks have passed.
import { verifyCatchyEmulatorIdentity } from './identity.mjs';

const result = await verifyCatchyEmulatorIdentity();
if (result.ok) {
  console.log('[emulator-identity] OK — Catchy demo-catchy emulators positively verified on 127.0.0.1 (8180/9199/4100/4410/4510/9160).');
} else {
  console.error(`[emulator-identity] REFUSED (${result.stage}):\n  - ${result.problems.join('\n  - ')}`);
  process.exit(1);
}
