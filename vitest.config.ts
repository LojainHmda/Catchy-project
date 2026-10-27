import path from 'path';
import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.ts (which has dev-server middleware and
// build chunking logic that regression tests don't need) so adding a test runner
// can't affect the build/dev-server config.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // jsdom (not 'node') so localStorage is reliably present for the catalog-cache
    // regression tests, regardless of the Node version running CI.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'server/**/*.test.js', 'scripts/**/*.test.mjs'],
  },
});
