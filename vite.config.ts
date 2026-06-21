import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const plugins: PluginOption[] = [react(), tailwindcss()];

// Register a service worker so installed PWAs pick up new builds instead of
// staying pinned to a cached bundle. We use `autoUpdate` with `skipWaiting` +
// `clientsClaim`: a freshly deployed worker activates and claims open pages
// immediately, then the page reloads onto the new assets. A `prompt` flow left
// iOS/WebKit stranded on a stale (or half-updated, blank) shell — updates never
// reliably reached the home-screen instance. Skipped under Vitest, where the
// `virtual:pwa-register` module isn't wired up.
if (!process.env.VITEST) {
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // The manifest already ships in public/manifest.webmanifest (linked from
      // index.html); let the plugin own only the service worker.
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins,
  // Vite's default build target ('baseline-widely-available') assumes Safari 16+.
  // On an older iOS WebKit the bundle can then ship syntax Safari can't parse,
  // which fails silently as a blank white screen (while Chrome/Android runs the
  // same build fine). Down-level to Safari 14 so the emitted JS is parseable on
  // the iOS versions still in the wild.
  build: {
    target: ['es2020', 'safari14'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Under Vitest the PWA plugin is skipped, so stub its virtual module.
      ...(process.env.VITEST
        ? {
            'virtual:pwa-register': fileURLToPath(
              new URL('./src/tests/pwaRegisterStub.ts', import.meta.url),
            ),
          }
        : {}),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
