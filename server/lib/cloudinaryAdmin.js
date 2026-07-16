// Shared admin auth + Cloudinary config for the image-upload endpoint.
// Used by both server/index.js (Cloud Run) and vite.config.ts (local dev).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../service-account.json');
const APP_NAME = 'catchy-cloudinary-admin-auth';

/** Mirrors AuthContext.tsx's owner/demo-admin checks (client-side source of truth). */
const DEFAULT_OWNER_EMAILS = new Set(['lojain2077@gmail.com', 'marei.eyad@gmail.com']);
const DEMO_ADMIN_EMAIL = 'admin@gmail.com';

let cloudinaryConfigured = false;
export function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  cloudinaryConfigured = true;
}

let authPromise = null;
async function getAdminAuth() {
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const { initializeApp, applicationDefault, cert, getApps, getApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const existing = getApps().find((a) => a.name === APP_NAME);
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const app =
      existing ||
      (existsSync(SERVICE_ACCOUNT_PATH)
        // Local dev convenience — production (Cloud Run) has no key file and uses its own service identity.
        ? initializeApp(
            { credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))), projectId },
            APP_NAME
          )
        : initializeApp({ credential: applicationDefault(), projectId }, APP_NAME));
    return getAuth(app);
  })();
  return authPromise;
}

/** Verifies the caller is a signed-in Firebase user matching this app's admin criteria. */
export async function verifyAdminRequest(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  if (!match) return { ok: false, status: 401, message: 'Missing Authorization bearer token.' };

  try {
    const auth = await getAdminAuth();
    const decoded = await auth.verifyIdToken(match[1]);
    const email = (decoded.email || '').toLowerCase();
    const isOwner = DEFAULT_OWNER_EMAILS.has(email);
    const isDemoAdmin = email === DEMO_ADMIN_EMAIL;
    const isSyntheticAdmin = /-catchy-496207@example\.com$/i.test(email);
    if (!isOwner && !isDemoAdmin && !isSyntheticAdmin) {
      return { ok: false, status: 403, message: 'This account is not an admin.' };
    }
    return { ok: true, uid: decoded.uid, email };
  } catch (err) {
    return { ok: false, status: 401, message: err?.message || 'Invalid or expired token.' };
  }
}
