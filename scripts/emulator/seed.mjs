// npm run emulator:seed — loads SYNTHETIC test data into the LOCAL emulators only.
// Refuses to run unless firebase.json points at localhost, the project is
// demo-catchy, and both ports really answer as Firebase emulators.
import { buildSeedData, SEED_PASSWORD } from './seedData.mjs';
import { resolveEmulatorTarget } from './target.mjs';
import { seedEmulators } from './emulatorClient.mjs';

try {
  const target = resolveEmulatorTarget();
  const data = buildSeedData();
  const result = await seedEmulators(target, data);
  console.log(`[emulator] Seeded ${result.users} test users and ${result.documents} documents into ${target.projectId} (local only).`);
  console.log(`[emulator] Test logins (local Auth emulator only): ${data.authUsers.map((u) => `${u.email} [${u.role}]`).join(', ')}`);
  console.log(`[emulator] Password for every test login: ${SEED_PASSWORD}`);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exit(1);
}
