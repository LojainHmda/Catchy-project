// Migrate product images from Firebase Storage (and any other current hosts) to Cloudinary.
//
// Usage:
//   node scripts/migrate-images-to-cloudinary.mjs                        (dry run — no writes, no uploads)
//   node scripts/migrate-images-to-cloudinary.mjs --commit                (real run — all products)
//   node scripts/migrate-images-to-cloudinary.mjs --commit --limit=1      (real run — first N products only, for testing)
//   node scripts/migrate-images-to-cloudinary.mjs --commit --product=ID   (real run — one specific product only)
//
// Safety:
//   - Always writes a timestamped local JSON backup of every product's original image fields
//     BEFORE any Cloudinary upload or Firestore write happens (even in dry-run, so you can see
//     the shape of what will be backed up).
//   - Skips URLs that are already on Cloudinary (safe to re-run).
//   - Per-image upload failures are logged and skipped; that image keeps its old URL rather than
//     aborting the whole run.
//   - Never deletes anything from Firebase Storage — old files stay put.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import { config } from 'dotenv';

config({ path: new URL('../.env.local', import.meta.url) });

const COMMIT = process.argv.includes('--commit');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : null;
const PRODUCT_ARG = process.argv.find((a) => a.startsWith('--product='));
const ONLY_PRODUCT_ID = PRODUCT_ARG ? PRODUCT_ARG.split('=')[1] : null;

const serviceAccount = JSON.parse(readFileSync(new URL('../service-account.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CLOUDINARY_FOLDER = 'catchy/products';

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com');
}

function isMigratableUrl(url) {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  if (t.length < 12) return false;
  if (t.startsWith('/')) return false; // local placeholder, not a real hosted image
  if (isCloudinaryUrl(t)) return false; // already migrated
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:image/');
}

/** Every image URL referenced by a product, deduped, across all known fields. */
function collectImageUrls(product) {
  const urls = new Set();
  if (Array.isArray(product.images)) {
    product.images.forEach((u) => typeof u === 'string' && urls.add(u));
  }
  if (typeof product.image === 'string') urls.add(product.image);
  if (typeof product.lifestyleImage === 'string') urls.add(product.lifestyleImage);
  if (Array.isArray(product.colorVariants)) {
    product.colorVariants.forEach((variant) => {
      if (Array.isArray(variant?.images)) {
        variant.images.forEach((u) => typeof u === 'string' && urls.add(u));
      }
    });
  }
  return [...urls].filter(isMigratableUrl);
}

/** Apply a url->newUrl map across every image field, preserving structure/order. */
function remapProductImages(product, urlMap) {
  const remap = (u) => (typeof u === 'string' && urlMap.has(u) ? urlMap.get(u) : u);
  const patch = {};
  if (Array.isArray(product.images)) {
    patch.images = product.images.map(remap);
  }
  if (typeof product.image === 'string' && urlMap.has(product.image)) {
    patch.image = remap(product.image);
  }
  if (typeof product.lifestyleImage === 'string' && urlMap.has(product.lifestyleImage)) {
    patch.lifestyleImage = remap(product.lifestyleImage);
  }
  if (Array.isArray(product.colorVariants)) {
    patch.colorVariants = product.colorVariants.map((variant) =>
      Array.isArray(variant?.images) ? { ...variant, images: variant.images.map(remap) } : variant
    );
  }
  return patch;
}

async function main() {
  console.log(COMMIT ? '=== LIVE RUN (will upload + write Firestore) ===' : '=== DRY RUN (no uploads, no writes) ===');

  const snap = await db.collection('products').get();
  let products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Loaded ${products.length} products.`);

  if (ONLY_PRODUCT_ID) {
    products = products.filter((p) => p.id === ONLY_PRODUCT_ID);
    console.log(`Filtered to product ${ONLY_PRODUCT_ID}: ${products.length} found.`);
  } else if (LIMIT) {
    products = products.slice(0, LIMIT);
    console.log(`Limited to first ${LIMIT} product(s).`);
  }

  // 1) Backup every product's current image fields, always, before touching anything.
  const backup = {};
  for (const p of products) {
    backup[p.id] = {
      name: p.name ?? null,
      images: p.images ?? null,
      image: p.image ?? null,
      lifestyleImage: p.lifestyleImage ?? null,
      colorVariants: Array.isArray(p.colorVariants)
        ? p.colorVariants.map((v) => ({ id: v.id, images: v.images ?? [] }))
        : null,
    };
  }
  mkdirSync(new URL('../backups/', import.meta.url), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = new URL(`../backups/image-urls-backup-${stamp}.json`, import.meta.url);
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${backupPath.pathname.replace(/^\//, '')}`);

  // 2) Collect every unique migratable URL across all products.
  const allUrls = new Set();
  for (const p of products) collectImageUrls(p).forEach((u) => allUrls.add(u));
  console.log(`Found ${allUrls.size} unique image URL(s) to migrate.`);

  if (allUrls.size === 0) {
    console.log('Nothing to migrate. Done.');
    return;
  }

  // 3) Upload each unique URL to Cloudinary (or simulate in dry-run), building old->new map.
  const urlMap = new Map();
  let uploaded = 0;
  let failed = 0;
  let i = 0;
  for (const url of allUrls) {
    i += 1;
    if (!COMMIT) {
      console.log(`[dry-run ${i}/${allUrls.size}] would upload: ${url.slice(0, 90)}`);
      continue;
    }
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder: CLOUDINARY_FOLDER,
        unique_filename: true,
        overwrite: false,
        resource_type: 'image',
      });
      urlMap.set(url, result.secure_url);
      uploaded += 1;
      console.log(`[${i}/${allUrls.size}] uploaded -> ${result.secure_url}`);
    } catch (err) {
      failed += 1;
      console.error(`[${i}/${allUrls.size}] FAILED (kept old URL): ${url.slice(0, 90)} — ${err.message || err}`);
    }
  }

  if (!COMMIT) {
    console.log(`\nDry run complete. ${allUrls.size} image(s) would be uploaded across ${products.length} products.`);
    console.log('Re-run with --commit to actually upload to Cloudinary and update Firestore.');
    return;
  }

  console.log(`\nUpload phase done: ${uploaded} uploaded, ${failed} failed (kept original URL).`);

  // 4) Write updated URLs back to each affected product.
  let updatedDocs = 0;
  for (const p of products) {
    const productUrls = collectImageUrls(p);
    const hasChanges = productUrls.some((u) => urlMap.has(u));
    if (!hasChanges) continue;
    const patch = remapProductImages(p, urlMap);
    await db.collection('products').doc(p.id).update(patch);
    updatedDocs += 1;
    console.log(`Updated product ${p.id} (${p.name ?? ''})`);
  }

  console.log(`\nDone. ${updatedDocs} product document(s) updated. Backup: ${backupPath.pathname.replace(/^\//, '')}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration script crashed:', err);
    process.exit(1);
  });
