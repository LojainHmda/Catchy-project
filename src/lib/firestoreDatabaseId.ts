// Which Firestore database the client talks to, fixed at build time.
// catchy-496207 builds leave VITE_FIRESTORE_DATABASE_ID unset and use `(default)`;
// kartacagenai builds set it to `catchy` (a named database in that shared project).
// The server side mirrors this with FIRESTORE_DATABASE_ID (server/lib/firestoreDatabase.js).
export const DEFAULT_FIRESTORE_DATABASE_ID = '(default)';

export function resolveFirestoreDatabaseId(raw: string | null | undefined): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return id || DEFAULT_FIRESTORE_DATABASE_ID;
}
