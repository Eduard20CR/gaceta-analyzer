// Vite settings for the web app (ADR-0008).

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Reads apps/web/.env.local (see .env.example). Only the dev server uses it:
  // the built app calls /api on its own domain, so it needs no configuration.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const apiProxyTarget = env['VITE_DEV_API_PROXY_TARGET'];

  return {
    plugins: [react()],
    server: {
      // In production CloudFront sends /api/* to API Gateway. In development the
      // dev server does the same, so the code uses the same relative paths.
      proxy: apiProxyTarget
        ? {
            '/api': {
              target: apiProxyTarget,
              // API Gateway routes by Host, so it must see its own host name.
              changeOrigin: true,
            },
          }
        : {},
    },
    build: {
      // dist/index.html plus hashed files in dist/assets/. deploy.yml uploads
      // assets/ as immutable and index.html with no-cache (docs/architecture.md).
      outDir: 'dist',
      assetsDir: 'assets',
    },
  };
});
