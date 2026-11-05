// Vitest settings for the web app (ADR-0013, NFR-MAINT-04).
//
// It reuses vite.config.ts, so the tests compile the app exactly like the dev
// server and the build do (same React plugin, same settings).

import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default defineConfig((configEnv) =>
  mergeConfig(viteConfig(configEnv), {
    test: {
      // jsdom is a fake browser (document, window, localStorage) inside Node.js,
      // so components can be rendered without a real browser.
      environment: 'jsdom',
      // Tests import describe/it/expect from 'vitest' explicitly instead of using
      // globals, so it is always clear where each function comes from.
      globals: false,
      // Tests live next to src/, in tests/ (docs/architecture.md).
      include: ['tests/**/*.test.{ts,tsx}'],
      // Runs before every test file: DOM matchers and the fake network (MSW).
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
