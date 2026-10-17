import qz from 'qz-tray';
import { auth } from '../../firebase';

/**
 * Windows shows this exact USB printer under wildly different names depending
 * on the machine: "Generic / Text Only" on one, a plain "Label" on another
 * (confirmed on two separate real machines) — whatever driver got bound or
 * whatever someone happened to name it. Relying on `qz.printers.find(query)`'s
 * own matching turned out fragile (it kept failing even after a printer was
 * renamed to literally "Xprinter"), so detection below fetches the *actual*
 * printer list from QZ Tray and matches against it directly in this file,
 * where the logic is fully visible and controllable — not guessed at.
 */
export const XPRINTER_NAME_HINTS = ['XP-DT426B', 'DT426B', 'Xprinter', 'Label', 'Generic / Text Only'];

export class QzPrintError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'QzPrintError';
    this.code = code;
  }
}

let configured = false;

/** Browser-safe Uint8Array -> base64, chunked to avoid call-stack limits on large buffers. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Wires QZ Tray's certificate/signing promises to our server-side signing endpoint. */
function ensureQzConfigured() {
  if (configured) return;

  qz.security.setCertificatePromise((resolve, reject) => {
    fetch('/qz/qz-certificate.txt')
      .then((res) =>
        res.ok
          ? res.text()
          : Promise.reject(new QzPrintError('CERT_FETCH_FAILED', `Could not load the QZ certificate (HTTP ${res.status}).`))
      )
      .then(resolve)
      .catch((err) =>
        reject(err instanceof QzPrintError ? err : new QzPrintError('CERT_FETCH_FAILED', err?.message || 'Could not load the QZ certificate.'))
      );
  });

  qz.security.setSignatureAlgorithm('SHA256');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    const user = auth.currentUser;
    if (!user) {
      reject(new QzPrintError('NOT_SIGNED_IN', 'You must be signed in as an admin.'));
      return;
    }
    user
      .getIdToken()
      .then((idToken) =>
        fetch('/api/admin/qz-sign', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ request: toSign }),
        })
      )
      .then((res) => res.json())
      .then((body) => {
        if (body?.ok) resolve(body.signature);
        else reject(new QzPrintError('SIGN_FAILED', body?.message || 'Could not sign the print request.'));
      })
      .catch((err) => reject(err instanceof QzPrintError ? err : new QzPrintError('SIGN_FAILED', err?.message || 'Could not sign the print request.')));
  });

  configured = true;
}

async function ensureConnected(t?: (key: string) => string): Promise<void> {
  ensureQzConfigured();
  if (qz.websocket.isActive()) return;
  try {
    await qz.websocket.connect({ retries: 2, delay: 1 });
  } catch {
    throw new QzPrintError(
      'QZ_NOT_RUNNING',
      t
        ? t('admin.products.qr.qzNotRunning')
        : 'Could not connect to QZ Tray. Make sure it is installed and running on this computer.'
    );
  }
}

/**
 * The raw list of every printer QZ Tray sees on this computer, exactly as
 * Windows named it. Also usable on its own as a diagnostic — e.g. from a
 * browser console: `import('./lib/qz/qzPrint').then(m => m.listAvailablePrinters()).then(console.log)`.
 */
export async function listAvailablePrinters(t?: (key: string) => string): Promise<string[]> {
  await ensureConnected(t);
  const found = await qz.printers.find();
  if (Array.isArray(found)) return found;
  return found ? [found] : [];
}

/** Picks the right printer from the real list QZ Tray reports, not a guessed name. */
async function resolvePrinterName(t?: (key: string) => string): Promise<string> {
  const all = await listAvailablePrinters(t);
  // eslint-disable-next-line no-console
  console.log('[QZ Tray] Printers visible on this computer:', all);

  for (const hint of XPRINTER_NAME_HINTS) {
    const match = all.find((name) => name.toLowerCase().includes(hint.toLowerCase()));
    if (match) return match;
  }

  // Nothing matched a known hint — if there's only one printer installed at all,
  // it's almost certainly the right one on a machine set up as a print bridge.
  if (all.length === 1) return all[0];

  try {
    const def = await qz.printers.getDefault();
    if (def) return def;
  } catch (err) {
    // A real signing/connection/cert failure must be reported as exactly that —
    // not swallowed and misreported as "no printer found" (this masked the
    // actual root cause of a production signing outage before it was fixed).
    if (err instanceof QzPrintError) throw err;
    // Otherwise this genuinely means "no default printer configured" — fall
    // through to the diagnostic error below, which lists what was found.
  }

  throw new QzPrintError(
    'PRINTER_NOT_FOUND',
    all.length > 0
      ? (t
          ? t('admin.products.qr.printerNotFoundList').replace('{list}', all.join(', '))
          : `Could not automatically identify the Xprinter. Printers QZ Tray sees on this computer: ${all.join(', ')}.`)
      : (t
          ? t('admin.products.qr.printerNotFoundNone')
          : 'QZ Tray reports no printers at all on this computer — check that a printer is installed in Windows.')
  );
}

/** Sends a raw TSPL print job (may embed binary bitmap data) to the Xprinter via QZ Tray. */
export async function printTsplLabel(tspl: Uint8Array, t?: (key: string) => string): Promise<void> {
  await ensureConnected(t);
  const printerName = await resolvePrinterName(t);

  const config = qz.configs.create(printerName);
  try {
    await qz.print(config, [{ type: 'raw', format: 'base64', data: uint8ArrayToBase64(tspl) }]);
  } catch (err: any) {
    throw new QzPrintError('PRINT_FAILED', err?.message || (t ? t('admin.products.qr.printFailed') : 'Printing to the Xprinter failed.'));
  }
}
