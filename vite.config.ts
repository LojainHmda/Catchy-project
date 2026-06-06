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

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), whatsappDevApi(env)],
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
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
