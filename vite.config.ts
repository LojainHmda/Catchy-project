import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), guestCheckoutDevApi(env), whatsappDevApi(env), imageProxyDevApi()],
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
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
      assetsInlineLimit: 4096,
      sourcemap: false,
    },
  };
});
