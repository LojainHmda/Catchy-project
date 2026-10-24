// Which Firestore database the server-side Admin SDK talks to.
// catchy-496207 keeps using its project's `(default)` database (FIRESTORE_DATABASE_ID
// unset). The kartacagenai Cloud Run service sets FIRESTORE_DATABASE_ID=catchy, a named
// database inside that shared project. The client bundle picks the same database at
// build time via VITE_FIRESTORE_DATABASE_ID (see src/lib/firestoreDatabaseId.ts).
export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';

export function resolveFirestoreDatabaseId(raw) {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id || DEFAULT_FIRESTORE_DATABASE_ID;
}

/** Admin SDK Firestore handle for `app` on the configured database. */
export async function getAdminFirestore(app, env = process.env) {
  const { getFirestore } = await import('firebase-admin/firestore');
  const databaseId = resolveFirestoreDatabaseId(env.FIRESTORE_DATABASE_ID);
  // Keep the exact pre-existing call for `(default)` so catchy-496207 behaves as before.
  return databaseId === DEFAULT_FIRESTORE_DATABASE_ID ? getFirestore(app) : getFirestore(app, databaseId);
}
