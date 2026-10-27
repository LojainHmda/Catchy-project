import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Regression guard: raising the PRODUCT VIDEO limit to 100 MB must not change any
// other upload limit. These constants live inside components/server modules (not
// exported), so the source is checked directly.
const root = path.resolve(__dirname, '..', '..');
const src = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('other upload limits are unchanged by the product-video limit change', () => {
  it.each([
    ['src/components/admin/AdminProductFormModal.tsx', 'const MAX_FILE_BEFORE_COMPRESS = 15 * 1024 * 1024;'],
    ['src/components/admin/ProductColorVariantsEditor.tsx', 'const MAX_FILE = 15 * 1024 * 1024;'],
    ['src/pages/AdminHero.tsx', 'file.size > 15 * 1024 * 1024'],
    ['src/pages/AdminCategoryTiles.tsx', 'file.size > 15 * 1024 * 1024'],
    ['server/lib/imageProxy.js', 'const MAX_BYTES = 8 * 1024 * 1024;'],
    ['server/index.js', "express.json({ limit: '12mb'"],
    ['src/pages/AdminHeroVideo.tsx', 'file.size > 300 * 1024 * 1024'],
  ])('%s keeps %s', (file, snippet) => {
    expect(src(file)).toContain(snippet);
  });
});

describe('storage.rules — products/ enforces the same 100 MiB video limit server-side', () => {
  const rules = src('storage.rules');
  const block = (name: string) => {
    const start = rules.indexOf(`match /${name}/{filename} {`);
    expect(start).toBeGreaterThan(-1);
    return rules.slice(start, rules.indexOf('\n    }', start));
  };

  it('uses exactly the client limit (MAX_VIDEO_BYTES = 104857600) and requires a video/* content type', async () => {
    const { MAX_VIDEO_BYTES } = await import('./productVideoUpload');
    const products = block('products');
    expect(products).toContain(`request.resource.size <= ${MAX_VIDEO_BYTES}`);
    expect(products).toContain("request.resource.contentType.matches('video/.*')");
  });

  it('every write to products/ still requires an admin; deletes are admin-only and allowed', () => {
    const products = block('products');
    expect(products).toContain('allow read: if true;');
    expect(products).toContain('allow delete: if isAdmin();');
    expect(products).toMatch(/allow create, update: if isAdmin\(\)\s*&&/);
    expect(products).not.toMatch(/allow write/);
    expect(products.match(/allow /g)).toHaveLength(3); // read, delete, create/update — nothing else
  });

  it('the hero/ path and the admin check are unchanged', () => {
    expect(block('hero')).toContain('allow read: if true;');
    expect(block('hero')).toContain('allow write: if isAdmin();');
    expect(rules).toContain(String.raw`request.auth.token.email.matches('(?i)^admin@gmail\\.com$')`);
    expect(rules.match(/match \/[a-z]+\/\{filename\}/g)).toEqual(['match /hero/{filename}', 'match /products/{filename}']);
  });
});
