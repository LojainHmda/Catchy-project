// Seed / reset operations against Catchy's LOCAL emulators (REST only, no SDK, no credentials).
// Every operation first requires a POSITIVE identity check (identity.mjs) — an open
// port or an HTTP answer is never enough — and only then talks to the dedicated ports.

import { toFirestoreFields } from './firestoreRest.mjs';
import { createEmulatorFetch } from './target.mjs';
import { assertCatchyEmulatorIdentity } from './identity.mjs';

async function expectOk(response, what) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`[emulator] ${what} failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  }
}

function prepare(target, { fetchImpl = globalThis.fetch, verifyIdentity } = {}) {
  const verify = verifyIdentity ?? (() => assertCatchyEmulatorIdentity({ fetchImpl }));
  return { verify, emulatorFetch: createEmulatorFetch(target, fetchImpl) };
}

/** Deletes ALL documents in demo-catchy's (default) database and ALL Auth emulator accounts. */
export async function resetEmulators(target, options) {
  const { verify, emulatorFetch } = prepare(target, options);
  await verify(); // throws (refuses) unless these are positively Catchy's demo-catchy emulators
  const fsRes = await emulatorFetch(
    `${target.firestore.base}/emulator/v1/projects/${target.projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await expectOk(fsRes, 'Clearing Firestore emulator');
  const authRes = await emulatorFetch(`${target.auth.base}/emulator/v1/projects/${target.projectId}/accounts`, { method: 'DELETE' });
  await expectOk(authRes, 'Clearing Auth emulator');
}

/** Creates the synthetic Auth users and Firestore documents. Existing docs with the same ids are overwritten. */
export async function seedEmulators(target, data, options) {
  const { verify, emulatorFetch } = prepare(target, options);
  await verify(); // throws (refuses) unless these are positively Catchy's demo-catchy emulators

  for (const user of data.authUsers) {
    const res = await emulatorFetch(`${target.auth.base}/identitytoolkit.googleapis.com/v1/projects/${target.projectId}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localId: user.localId,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      }),
    });
    await expectOk(res, `Creating test user ${user.email}`);
  }

  for (const { collection, id, data: fields } of data.docs) {
    const url = `${target.firestore.base}/v1/projects/${target.projectId}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
    const res = await emulatorFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields(fields) }),
    });
    await expectOk(res, `Writing ${collection}/${id}`);
  }
  return { users: data.authUsers.length, documents: data.docs.length };
}
