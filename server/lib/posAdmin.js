// Shared admin/cashier auth + Firestore handle for POS endpoints.
// Mirrors cloudinaryAdmin.js's pattern (own named Admin app, service-account.json
// fallback to applicationDefault()), extended to also accept the 'cashier' role
// and to hand back a Firestore instance so callers don't stand up their own.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSyntheticAdminEmail } from './adminIdentity.js';
import { adminCredential } from './emulatorGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../service-account.json');
const APP_NAME = 'catchy-pos-admin-auth';

/** Mirrors AuthContext.tsx's owner/demo-admin checks (client-side source of truth). */
const DEFAULT_OWNER_EMAILS = new Set(['lojain2077@gmail.com', 'marei.eyad@gmail.com']);
const DEMO_ADMIN_EMAIL = 'admin@gmail.com';

let appPromise = null;
async function getPosApp() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    const { initializeApp, applicationDefault, cert, getApps } = await import('firebase-admin/app');
    const existing = getApps().find((a) => a.name === APP_NAME);
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    // Emulator mode: a credential that can never reach real Google services
    // (service-account.json and application-default credentials are not read).
    // Otherwise unchanged: the key file when present, else application-default credentials.
    const credential = adminCredential(() =>
      existsSync(SERVICE_ACCOUNT_PATH)
        ? cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')))
        : applicationDefault()
    );
    return existing || initializeApp({ credential, projectId }, APP_NAME);
  })();
  return appPromise;
}

async function getPosAuth() {
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(await getPosApp());
}

async function getPosFirestore() {
  const { getAdminFirestore } = await import('./firestoreDatabase.js');
  return getAdminFirestore(await getPosApp());
}

/** `projectId` is the verified token's `aud` — the Firebase project this server serves. */
function emailRole(email, projectId) {
  const lower = (email || '').toLowerCase();
  if (DEFAULT_OWNER_EMAILS.has(lower)) return 'admin';
  if (lower === DEMO_ADMIN_EMAIL) return 'admin';
  if (isSyntheticAdminEmail(lower, projectId)) return 'admin';
  return null;
}

/**
 * Verifies the caller is signed in and either an admin (by email shortcut or
 * Firestore profile) or a cashier (Firestore profile only). Returns a ready
 * Firestore handle on success so route handlers don't each open their own.
 */
export async function verifyPosStaffRequest(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  if (!match) return { ok: false, status: 401, message: 'Missing Authorization bearer token.' };

  try {
    const auth = await getPosAuth();
    const decoded = await auth.verifyIdToken(match[1]);
    const email = (decoded.email || '').toLowerCase();
    const db = await getPosFirestore();

    let role = emailRole(email, decoded.aud);
    if (!role) {
      const profileSnap = await db.collection('users').doc(decoded.uid).get();
      const profileRole = profileSnap.exists ? profileSnap.data()?.role : null;
      if (profileRole === 'admin' || profileRole === 'cashier') role = profileRole;
    }

    if (!role) return { ok: false, status: 403, message: 'This account is not authorized for POS.' };

    return {
      ok: true,
      uid: decoded.uid,
      email,
      role,
      name: decoded.name || null,
      db,
    };
  } catch (err) {
    return { ok: false, status: 401, message: err?.message || 'Invalid or expired token.' };
  }
}
