// Signs QZ Tray print requests with our self-signed private key so the
// "connect to this printer?" popup can be suppressed once the matching
// public certificate (public/qz/qz-certificate.txt) is trusted on the
// admin's Windows machine. The private key never leaves this server.
//
// Production (Cloud Run) injects the key via the QZ_PRIVATE_KEY env var, bound
// to Secret Manager secret "qz-signing-private-key" at deploy time (see
// scripts/deploy-cloud-run.ps1's --set-secrets flag) — it is never baked into
// the Docker image or committed to source. Local dev has no such env var, so
// it falls back to the gitignored qz-keys/qz-private-key.pem file on disk,
// exactly as before.
import { existsSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.resolve(__dirname, '../../qz-keys/qz-private-key.pem');

let cachedKey = null;
function getPrivateKey() {
  if (cachedKey) return cachedKey;
  if (process.env.QZ_PRIVATE_KEY) {
    cachedKey = process.env.QZ_PRIVATE_KEY;
    return cachedKey;
  }
  if (!existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(
      'QZ signing key not found — set QZ_PRIVATE_KEY (production) or run `node scripts/generate-qz-cert.mjs` (local dev) first.'
    );
  }
  cachedKey = readFileSync(PRIVATE_KEY_PATH, 'utf8');
  return cachedKey;
}

/** Signs the exact string QZ Tray's JS client asks us to sign. Returns a base64 signature. */
export function signQzRequest(toSign) {
  const privateKey = getPrivateKey();
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(String(toSign ?? ''), 'utf8');
  signer.end();
  return signer.sign(privateKey).toString('base64');
}
