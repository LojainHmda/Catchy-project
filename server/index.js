// Production server for Cloud Run: serves the built SPA AND the WhatsApp API.
// In local dev the Vite middleware (vite.config.ts) handles /api/whatsapp/send;
// this file is what runs in the deployed container.
import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = process.env.PORT || 8080;
const WHATSAPP_BROKER_URL = 'https://api.whatsappbiz.com/v1/public/message/';

// ── Firestore (Admin SDK) — used to persist inbound webhook messages ──
// On Cloud Run this uses Application Default Credentials automatically (no key file).
let firestore = null;
async function getFirestore() {
  if (firestore) return firestore;
  try {
    const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
    const { getFirestore: _getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        // Prefer the explicit Firestore project so inbound messages land in the same
        // database the admin UI reads from, even if Cloud Run runs in a different project.
        projectId:
          process.env.WHATSAPP_FIRESTORE_PROJECT ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.VITE_FIREBASE_PROJECT_ID,
      });
    }
    firestore = _getFirestore();
    return firestore;
  } catch (err) {
    console.error('[whatsapp] Firestore unavailable:', err?.message || err);
    return null;
  }
}

const app = express();
// Capture the raw body so we can verify the broker's HMAC signature over exact bytes.
// 12mb ceiling accommodates base64-encoded product images for the Cloudinary upload route.
app.use(express.json({ limit: '12mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

// The broker (Interakt/whatsappbiz) signs each webhook with HMAC-SHA256 over the raw
// body, keyed by your webhook secret, and sends it in the `Interakt-Signature` header.
// We also accept the raw secret in common headers (for manual tests / other providers).
function verifyWebhookSignature(req, secret) {
  const provided =
    req.get('interakt-signature') ||
    req.get('x-secret') ||
    req.get('x-webhook-secret') ||
    req.get('secret') ||
    req.query.secret ||
    '';
  if (!provided) return false;
  const norm = String(provided).replace(/^sha256=/i, '').trim();
  if (norm === secret || provided === `Bearer ${secret}`) return true; // raw-secret match
  const raw = req.rawBody && req.rawBody.length ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
  const hex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const b64 = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  return norm.toLowerCase() === hex.toLowerCase() || norm === b64;
}

// ── Guest checkout (Admin SDK — no sign-in required) ──
app.post('/api/orders/checkout', async (req, res) => {
  const { items, delivery } = req.body || {};
  const db = await getFirestore();
  if (!db) {
    return res.status(503).json({ ok: false, code: 'UNKNOWN', message: 'Checkout is temporarily unavailable.' });
  }

  try {
    const { processGuestCheckout } = await import('./lib/checkoutOrder.js');
    const result = await processGuestCheckout(db, { items, delivery });
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error('[checkout] unhandled:', err?.message || err);
    res.status(500).json({ ok: false, code: 'UNKNOWN', message: 'Could not place your order. Please try again.' });
  }
});

// ── Send a text message (token stays here, never reaches the browser) ──
app.post('/api/whatsapp/send', async (req, res) => {
  const { fullPhoneNumber, message } = req.body || {};
  if (!fullPhoneNumber || !message) {
    return res.status(400).json({ result: false, message: 'fullPhoneNumber and message are required' });
  }
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) return res.status(500).json({ result: false, message: 'WHATSAPP_API_TOKEN is not set' });

  try {
    const upstream = await fetch(WHATSAPP_BROKER_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullPhoneNumber: String(fullPhoneNumber),
        callbackData: 'catchy-admin',
        type: 'Text',
        data: { message: String(message) },
      }),
    });
    const text = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (err) {
    res.status(502).json({ result: false, message: err?.message || 'Upstream send failed' });
  }
});

// ── Receive inbound messages + delivery status (broker calls this) ──
// Stores a best-effort normalized doc into Firestore `whatsapp_messages`,
// plus the raw payload so we can refine extraction once we see real traffic.
app.post('/api/whatsapp/webhook', async (req, res) => {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (expected && !verifyWebhookSignature(req, expected)) {
    return res.status(401).json({ result: false, message: 'Invalid webhook signature' });
  }

  // Persist BEFORE responding. Cloud Run throttles CPU once the response is sent,
  // so any async work after res.send() (like a Firestore write) may never finish.
  try {
    const body = req.body || {};
    const data = body.data || {};
    const customer = data.customer || {};
    const msg = data.message || {};

    const phone =
      customer.channel_phone_number ||
      ((customer.country_code || '').replace(/\D/g, '') + (customer.phone_number || '')) ||
      body.fullPhoneNumber ||
      body.phoneNumber ||
      null;
    const text =
      (typeof msg.message === 'string' ? msg.message : null) ||
      msg.text ||
      (typeof body?.data?.message === 'string' ? body.data.message : null) ||
      body.text ||
      null;
    const name = customer?.traits?.name || customer?.name || null;

    // Only inbound customer messages become chat bubbles; everything else (status
    // updates etc.) is acknowledged but not stored as a message.
    const isInbound =
      body.type === 'message_received' || msg.chat_message_type === 'CustomerMessage';

    const db = await getFirestore();
    if (db && isInbound) {
      await db.collection('whatsapp_messages').add({
        phone: phone ? String(phone).replace(/\D/g, '') : null,
        name: name || null,
        direction: 'in',
        type: msg.message_content_type || body.type || 'Text',
        text: text ? String(text) : null,
        mediaUrl: msg.media_url || null,
        status: 'received',
        brokerId: msg.id || body.id || null,
        raw: body,
        createdAt: new Date(),
      });
    }
    console.log(`[whatsapp] webhook ${body.type || 'event'} stored=${!!(db && isInbound)}`);
  } catch (err) {
    console.error('[whatsapp] webhook persist failed:', err?.message || err);
  }

  res.status(200).json({ result: true });
});

// ── Same-origin image proxy (lets the invoice canvas draw remote product photos) ──
app.get('/api/image-proxy', async (req, res) => {
  const { proxyImage } = await import('./lib/imageProxy.js');
  await proxyImage(req.query.url, res);
});

// ── Admin product image upload → Cloudinary (secret stays server-side) ──
app.post('/api/admin/upload-image', async (req, res) => {
  const { handleImageUploadRequest } = await import('./lib/cloudinaryUpload.js');
  const result = await handleImageUploadRequest(req, req.body);
  res.status(result.status).json(result.body);
});

// ── QZ Tray print-request signing (admin only; private key stays server-side) ──
app.post('/api/admin/qz-sign', async (req, res) => {
  const { verifyAdminRequest } = await import('./lib/cloudinaryAdmin.js');
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  try {
    const { signQzRequest } = await import('./lib/qzSigning.js');
    const signature = signQzRequest(req.body?.request);
    res.status(200).json({ ok: true, signature });
  } catch (err) {
    res.status(500).json({ ok: false, message: err?.message || 'Signing failed.' });
  }
});

// ── POS: register session open/close + sale (admin or cashier only) ──
app.post('/api/pos/session/open', async (req, res) => {
  const { verifyPosStaffRequest } = await import('./lib/posAdmin.js');
  const auth = await verifyPosStaffRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  const { openPosSession } = await import('./lib/posSession.js');
  const result = await openPosSession(auth.db, {
    cashierUid: auth.uid,
    cashierEmail: auth.email,
    cashierName: req.body?.cashierName || auth.name,
    openingCashFloat: req.body?.openingCashFloat,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/pos/session/close', async (req, res) => {
  const { verifyPosStaffRequest } = await import('./lib/posAdmin.js');
  const auth = await verifyPosStaffRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  const { closePosSession } = await import('./lib/posSession.js');
  const result = await closePosSession(auth.db, {
    sessionId: req.body?.sessionId,
    cashierUid: auth.uid,
    role: auth.role,
    countedCashAtClose: req.body?.countedCashAtClose,
    notes: req.body?.notes,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

app.post('/api/pos/sale', async (req, res) => {
  const { verifyPosStaffRequest } = await import('./lib/posAdmin.js');
  const auth = await verifyPosStaffRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  const { processPosSale } = await import('./lib/posSale.js');
  const result = await processPosSale(auth.db, {
    cashierUid: auth.uid,
    cashierName: auth.name || auth.email,
    registerSessionId: req.body?.registerSessionId,
    items: req.body?.items,
    discount: req.body?.discount,
    payment: req.body?.payment,
    customer: req.body?.customer,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

// Admin-only: correct an already-completed POS sale (items/prices/discount,
// stock delta, audit trail). verifyPosStaffRequest allows admin or cashier;
// correctPosSale itself re-checks role === 'admin' as defense-in-depth.
app.post('/api/pos/sale/correct', async (req, res) => {
  const { verifyPosStaffRequest } = await import('./lib/posAdmin.js');
  const auth = await verifyPosStaffRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  const { correctPosSale } = await import('./lib/posSaleCorrection.js');
  const result = await correctPosSale(auth.db, {
    actorUid: auth.uid,
    actorName: auth.name || auth.email,
    actorRole: auth.role,
    orderId: req.body?.orderId,
    items: req.body?.items,
    discount: req.body?.discount,
    reason: req.body?.reason,
    idempotencyKey: req.body?.idempotencyKey,
  });
  res.status(result.ok ? 200 : result.code === 'FORBIDDEN' ? 403 : 400).json(result);
});

// Admin-only: cancel an already-completed POS sale (restores stock, marks the
// order cancelled, records who/when/why). verifyPosStaffRequest allows admin
// or cashier; cancelPosSale itself re-checks role === 'admin' as defense-in-depth.
app.post('/api/pos/sale/cancel', async (req, res) => {
  const { verifyPosStaffRequest } = await import('./lib/posAdmin.js');
  const auth = await verifyPosStaffRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.message });

  const { cancelPosSale } = await import('./lib/posSaleCorrection.js');
  const result = await cancelPosSale(auth.db, {
    actorUid: auth.uid,
    actorName: auth.name || auth.email,
    actorRole: auth.role,
    orderId: req.body?.orderId,
    reason: req.body?.reason,
    idempotencyKey: req.body?.idempotencyKey,
  });
  res.status(result.ok ? 200 : result.code === 'FORBIDDEN' ? 403 : 400).json(result);
});

// ── Static SPA + client-side routing fallback ──
app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));

app.listen(PORT, () => console.log(`Catchy server listening on :${PORT}`));
