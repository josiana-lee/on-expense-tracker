import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom rather than node: the restore path reaches downloadBlob, which
    // needs document/URL to exist. fake-indexeddb supplies the rest.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
