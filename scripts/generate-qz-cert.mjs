// One-time local script: generates a self-signed root certificate + private key
// used to sign QZ Tray print requests, so the "connect to this printer?" popup
// can be suppressed once the certificate is trusted (see qz-keys/README.md).
//
// Run manually with: node scripts/generate-qz-cert.mjs
// Safe to re-run — it will overwrite the previously generated cert/key.
import forge from 'node-forge';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PRIVATE_KEY_DIR = path.join(REPO_ROOT, 'qz-keys');
const PUBLIC_CERT_DIR = path.join(REPO_ROOT, 'public', 'qz');

const { pki, md } = forge;

const keys = pki.rsa.generateKeyPair(2048);
const cert = pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 15);

const attrs = [
  { name: 'commonName', value: 'Catchy POS QZ Tray' },
  { name: 'organizationName', value: 'Catchy' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs); // self-signed: issuer === subject
cert.setExtensions([
  { name: 'basicConstraints', cA: true },
  { name: 'keyUsage', keyCertSign: true, digitalSignature: true, cRLSign: true },
]);
cert.sign(keys.privateKey, md.sha256.create());

const certPem = pki.certificateToPem(cert);
const privateKeyPem = pki.privateKeyToPem(keys.privateKey);

mkdirSync(PRIVATE_KEY_DIR, { recursive: true });
mkdirSync(PUBLIC_CERT_DIR, { recursive: true });

writeFileSync(path.join(PRIVATE_KEY_DIR, 'qz-private-key.pem'), privateKeyPem, 'utf8');
writeFileSync(path.join(PUBLIC_CERT_DIR, 'qz-certificate.txt'), certPem, 'utf8');

console.log('Generated a new self-signed QZ Tray certificate + private key.\n');
console.log('  Private key (SECRET, server-only, gitignored):');
console.log('    ' + path.join(PRIVATE_KEY_DIR, 'qz-private-key.pem'));
console.log('  Public certificate (safe to install on Windows / QZ Tray):');
console.log('    ' + path.join(PUBLIC_CERT_DIR, 'qz-certificate.txt'));
