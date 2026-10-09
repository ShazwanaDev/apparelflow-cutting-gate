import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Each file boots its own in-process Postgres, which takes a moment on cold start.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters-long' },
  },
});
