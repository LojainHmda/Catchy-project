// Same-origin image proxy. Lets the browser draw remote product photos onto a
// <canvas> (for the invoice PNG) without CORS failures or canvas tainting.
// Hosts are allowlisted to keep this from becoming an open SSRF relay.

const ALLOWED_HOST_RE =
  /(^|\.)(firebasestorage\.googleapis\.com|storage\.googleapis\.com|firebasestorage\.app|googleusercontent\.com)$/i;

// Product photos uploaded since the Cloudinary pipeline live on res.cloudinary.com
// (server/lib/cloudinaryUpload.js). Only this store's own Cloudinary account is
// relayed: the first path segment is the cloud name (/<cloud>/image/upload/...).
const CLOUDINARY_HOST = 'res.cloudinary.com';

function isOwnCloudinaryImage(u, cloudName) {
  if (u.hostname.toLowerCase() !== CLOUDINARY_HOST) return false;
  const name = String(cloudName ?? '').trim();
  if (!name) return false; // not configured → fail closed
  const [first, kind] = u.pathname.split('/').filter(Boolean);
  return first === name && kind === 'image';
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap

/** True when `raw` is an https URL we're willing to fetch on the client's behalf. */
export function isAllowedImageUrl(raw, { cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME } = {}) {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOST_RE.test(u.hostname) || isOwnCloudinaryImage(u, cloudinaryCloudName);
  } catch {
    return false;
  }
}

/**
 * Fetch `rawUrl` and stream it back through `res`. Framework-agnostic: `res` only
 * needs Node's `statusCode` / `setHeader` / `end` (Express response satisfies this,
 * as does the raw Vite/Connect response).
 */
export async function proxyImage(rawUrl, res) {
  const send = (status, msg) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(msg);
  };

  if (!rawUrl) return send(400, 'Missing url');
  if (!isAllowedImageUrl(rawUrl)) return send(403, 'Host not allowed');

  try {
    const upstream = await fetch(String(rawUrl), { redirect: 'follow' });
    if (!upstream.ok) return send(upstream.status, `Upstream ${upstream.status}`);

    const type = upstream.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return send(415, 'Not an image');

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return send(413, 'Image too large');

    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buf);
  } catch (err) {
    send(502, `Proxy failed: ${err?.message || err}`);
  }
}
