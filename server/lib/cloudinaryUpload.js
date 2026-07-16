// Framework-agnostic handler for POST /api/admin/upload-image — shared by the Express
// server (Cloud Run) and the Vite dev-server middleware (local dev).
import { v2 as cloudinary } from 'cloudinary';
import { ensureCloudinaryConfigured, verifyAdminRequest } from './cloudinaryAdmin.js';

const CLOUDINARY_FOLDER = 'catchy/products';

export async function handleImageUploadRequest(req, body) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return { status: auth.status, body: { ok: false, message: auth.message } };

  const dataUrl = body?.dataUrl;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { status: 400, body: { ok: false, message: 'dataUrl (a data:image/... string) is required.' } };
  }

  ensureCloudinaryConfigured();
  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: CLOUDINARY_FOLDER,
      unique_filename: true,
      overwrite: false,
      resource_type: 'image',
    });
    return { status: 200, body: { ok: true, url: result.secure_url } };
  } catch (err) {
    return { status: 502, body: { ok: false, message: err?.message || 'Cloudinary upload failed.' } };
  }
}
