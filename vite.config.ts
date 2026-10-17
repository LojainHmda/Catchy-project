import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const WHATSAPP_BROKER_URL = 'https://api.whatsappbiz.com/v1/public/message/';

/**
 * Dev-only API route so the browser can send WhatsApp messages without ever
 * seeing the token. Runs inside the Vite dev server (Node). For production this
 * same logic must move to a real backend (Cloud Functions / Cloud Run).
 */
let devFirestore: any = null;

async function getDevFirestore(env: Record<string, string>) {
  if (devFirestore) return devFirestore;
  try {
    const {initializeApp, applicationDefault, getApps} = await import('firebase-admin/app');
    const {getFirestore} = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId: env.VITE_FIREBASE_PROJECT_ID || 'catchy-496207',
      });
    }
    devFirestore = getFirestore();
    return devFirestore;
  } catch (err: any) {
    console.error('[dev-checkout] Firestore unavailable:', err?.message || err);
    return null;
  }
}

function guestCheckoutDevApi(env: Record<string, string>) {
  return {
    name: 'guest-checkout-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/api/orders/checkout', (req: any, res: any) => {
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.method !== 'POST') return json(405, {ok: false, code: 'UNKNOWN', message: 'Method Not Allowed'});

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk));
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const db = await getDevFirestore(env);
            if (!db) {
              return json(503, {ok: false, code: 'UNKNOWN', message: 'Checkout is temporarily unavailable.'});
            }
            const {processGuestCheckout} = await import('./server/lib/checkoutOrder.js');
            const result = await processGuestCheckout(db, parsed);
            json(result.ok ? 200 : 400, result);
          } catch (err: any) {
            json(500, {ok: false, code: 'UNKNOWN', message: err?.message || 'Could not place your order.'});
          }
        });
      });
    },
  };
}

function whatsappDevApi(env: Record<string, string>) {
  return {
    name: 'whatsapp-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/api/whatsapp/send', (req: any, res: any) => {
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.method !== 'POST') return json(405, {result: false, message: 'Method Not Allowed'});

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk));
        req.on('end', async () => {
          try {
            const {fullPhoneNumber, message} = JSON.parse(body || '{}');
            if (!fullPhoneNumber || !message) {
              return json(400, {result: false, message: 'fullPhoneNumber and message are required'});
            }
            const token = env.WHATSAPP_API_TOKEN;
            if (!token) return json(500, {result: false, message: 'WHATSAPP_API_TOKEN is not set in .env'});

            const upstream = await fetch(WHATSAPP_BROKER_URL, {
              method: 'POST',
              headers: {Authorization: `Basic ${token}`, 'Content-Type': 'application/json'},
              body: JSON.stringify({
                fullPhoneNumber: String(fullPhoneNumber),
                callbackData: 'catchy-admin',
                type: 'Text',
                data: {message: String(message)},
              }),
            });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
          } catch (err: any) {
            json(500, {result: false, message: err?.message || 'Failed to send'});
          }
        });
      });
    },
  };
}

function imageProxyDevApi() {
  return {
    name: 'image-proxy-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/api/image-proxy', async (req: any, res: any) => {
        const url = new URL(req.originalUrl || req.url, 'http://localhost').searchParams.get('url');
        const {proxyImage} = await import('./server/lib/imageProxy.js');
        await proxyImage(url, res);
      });
    },
  };
}

function cloudinaryUploadDevApi(env: Record<string, string>) {
  return {
    name: 'cloudinary-upload-dev-api',
    configureServer(server: any) {
      // vite's loadEnv() doesn't populate process.env — but the shared server/lib handler
      // reads Cloudinary config from process.env (matching how the Express server, which
      // uses dotenv/config, sees it). Bridge that gap here for local dev only.
      for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
        if (env[key]) process.env[key] = env[key];
      }
      server.middlewares.use('/api/admin/upload-image', (req: any, res: any) => {
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.method !== 'POST') return json(405, {ok: false, message: 'Method Not Allowed'});

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk));
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const {handleImageUploadRequest} = await import('./server/lib/cloudinaryUpload.js');
            const result = await handleImageUploadRequest(req, parsed);
            json(result.status, result.body);
          } catch (err: any) {
            json(500, {ok: false, message: err?.message || 'Upload failed.'});
          }
        });
      });
    },
  };
}

function qzSignDevApi() {
  return {
    name: 'qz-sign-dev-api',
    configureServer(server: any) {
      server.middlewares.use('/api/admin/qz-sign', (req: any, res: any) => {
        const json = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };
        if (req.method !== 'POST') return json(405, {ok: false, message: 'Method Not Allowed'});

        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk));
        req.on('end', async () => {
          try {
            const {verifyAdminRequest} = await import('./server/lib/cloudinaryAdmin.js');
            const auth = await verifyAdminRequest(req);
            if (!auth.ok) return json(auth.status, {ok: false, message: auth.message});

            const parsed = JSON.parse(body || '{}');
            const {signQzRequest} = await import('./server/lib/qzSigning.js');
            const signature = signQzRequest(parsed?.request);
            json(200, {ok: true, signature});
          } catch (err: any) {
            json(500, {ok: false, message: err?.message || 'Signing failed.'});
          }
        });
      });
    },
  };
}

function posDevApi(env: Record<string, string>) {
  return {
    name: 'pos-dev-api',
    configureServer(server: any) {
      // Same process.env bridging gap as cloudinaryUploadDevApi — posAdmin.js reads
      // the Firebase project id from process.env, which loadEnv() doesn't populate.
      if (env.VITE_FIREBASE_PROJECT_ID) process.env.VITE_FIREBASE_PROJECT_ID = env.VITE_FIREBASE_PROJECT_ID;

      const jsonHandler =
        (handler: (body: any, req: any) => Promise<{status: number; body: unknown}>) =>
        (req: any, res: any) => {
          const json = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          };
          if (req.method !== 'POST') return json(405, {ok: false, message: 'Method Not Allowed'});

          let body = '';
          req.on('data', (chunk: Buffer) => (body += chunk));
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const result = await handler(parsed, req);
              json(result.status, result.body);
            } catch (err: any) {
              json(500, {ok: false, message: err?.message || 'Request failed.'});
            }
          });
        };

      server.middlewares.use(
        '/api/pos/session/open',
        jsonHandler(async (parsed, req) => {
          const {verifyPosStaffRequest} = await import('./server/lib/posAdmin.js');
          const auth = await verifyPosStaffRequest(req);
          if (!auth.ok) return {status: auth.status, body: {ok: false, message: auth.message}};
          const {openPosSession} = await import('./server/lib/posSession.js');
          const result = await openPosSession(auth.db, {
            cashierUid: auth.uid,
            cashierEmail: auth.email,
            cashierName: parsed?.cashierName || auth.name,
            openingCashFloat: parsed?.openingCashFloat,
          });
          return {status: result.ok ? 200 : 400, body: result};
        })
      );

      server.middlewares.use(
        '/api/pos/session/close',
        jsonHandler(async (parsed, req) => {
          const {verifyPosStaffRequest} = await import('./server/lib/posAdmin.js');
          const auth = await verifyPosStaffRequest(req);
          if (!auth.ok) return {status: auth.status, body: {ok: false, message: auth.message}};
          const {closePosSession} = await import('./server/lib/posSession.js');
          const result = await closePosSession(auth.db, {
            sessionId: parsed?.sessionId,
            cashierUid: auth.uid,
            role: auth.role,
            countedCashAtClose: parsed?.countedCashAtClose,
            notes: parsed?.notes,
          });
          return {status: result.ok ? 200 : 400, body: result};
        })
      );

      // '/api/pos/sale/correct' and '/api/pos/sale/cancel' MUST be registered
      // before the plain '/api/pos/sale' route: server.middlewares.use() does
      // Connect-style prefix matching (unlike Express's app.post exact-match in
      // server/index.js), so '/api/pos/sale' would otherwise swallow every
      // request to either of these sub-paths first.
      server.middlewares.use(
        '/api/pos/sale/correct',
        jsonHandler(async (parsed, req) => {
          const {verifyPosStaffRequest} = await import('./server/lib/posAdmin.js');
          const auth = await verifyPosStaffRequest(req);
          if (!auth.ok) return {status: auth.status, body: {ok: false, message: auth.message}};
          const {correctPosSale} = await import('./server/lib/posSaleCorrection.js');
          const result = await correctPosSale(auth.db, {
            actorUid: auth.uid,
            actorName: auth.name || auth.email,
            actorRole: auth.role,
            orderId: parsed?.orderId,
            items: parsed?.items,
            discount: parsed?.discount,
            reason: parsed?.reason,
            idempotencyKey: parsed?.idempotencyKey,
          });
          return {status: result.ok ? 200 : result.code === 'FORBIDDEN' ? 403 : 400, body: result};
        })
      );

      server.middlewares.use(
        '/api/pos/sale/cancel',
        jsonHandler(async (parsed, req) => {
          const {verifyPosStaffRequest} = await import('./server/lib/posAdmin.js');
          const auth = await verifyPosStaffRequest(req);
          if (!auth.ok) return {status: auth.status, body: {ok: false, message: auth.message}};
          const {cancelPosSale} = await import('./server/lib/posSaleCorrection.js');
          const result = await cancelPosSale(auth.db, {
            actorUid: auth.uid,
            actorName: auth.name || auth.email,
            actorRole: auth.role,
            orderId: parsed?.orderId,
            reason: parsed?.reason,
            idempotencyKey: parsed?.idempotencyKey,
          });
          return {status: result.ok ? 200 : result.code === 'FORBIDDEN' ? 403 : 400, body: result};
        })
      );

      server.middlewares.use(
        '/api/pos/sale',
        jsonHandler(async (parsed, req) => {
          const {verifyPosStaffRequest} = await import('./server/lib/posAdmin.js');
          const auth = await verifyPosStaffRequest(req);
          if (!auth.ok) return {status: auth.status, body: {ok: false, message: auth.message}};
          const {processPosSale} = await import('./server/lib/posSale.js');
          const result = await processPosSale(auth.db, {
            cashierUid: auth.uid,
            cashierName: auth.name || auth.email,
            registerSessionId: parsed?.registerSessionId,
            items: parsed?.items,
            discount: parsed?.discount,
            payment: parsed?.payment,
            customer: parsed?.customer,
          });
          return {status: result.ok ? 200 : 400, body: result};
        })
      );
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Self-signed HTTPS cert for local dev — required so phones/tablets on the LAN
      // get a secure context (camera access for the POS QR scanner needs one; plain
      // http://<lan-ip> is never treated as secure by mobile browsers).
      basicSsl(),
      guestCheckoutDevApi(env),
      whatsappDevApi(env),
      imageProxyDevApi(),
      cloudinaryUploadDevApi(env),
      posDevApi(env),
      qzSignDevApi(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Listen on all network interfaces (not just localhost) so phones/tablets on the
      // same Wi-Fi can reach the dev server; https comes from the basicSsl() plugin above.
      host: true,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Firebase Storage is only used by one already lazy-loaded admin page
            // (AdminHeroVideo) — excluded here so its SDK code follows that lazy
            // boundary instead of shipping to every visitor.
            if (
              (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) &&
              !id.includes('node_modules/firebase/storage') &&
              !id.includes('node_modules/@firebase/storage')
            ) {
              return 'vendor-firebase';
            }
            // framer-motion's own dependencies (motion-dom, motion-utils) must be
            // grouped with it, or they fall through to the catch-all below.
            if (
              id.includes('node_modules/framer-motion') ||
              id.includes('node_modules/motion-dom') ||
              id.includes('node_modules/motion-utils')
            ) {
              return 'vendor-motion';
            }
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler') ||
              /node_modules\/react\//.test(id)
            ) {
              return 'vendor-react';
            }
            // Everything else is left to Rollup's automatic chunking so libraries used
            // only by lazy-loaded routes (jsbarcode, jsqr, qrcode, qz-tray, Firebase
            // Storage above) stay out of the eager bundle instead of being
            // force-merged into one big "vendor" chunk regardless of reachability.
          },
        },
      },
      assetsInlineLimit: 4096,
      sourcemap: false,
    },
  };
});
