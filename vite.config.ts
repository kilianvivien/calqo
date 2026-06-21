import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const plugins: PluginOption[] = [react(), tailwindcss()];

// Register a service worker so installed PWAs pick up new builds instead of
// staying pinned to a cached bundle. `prompt` surfaces an in-app update notice
// (see PwaUpdatePrompt) rather than silently reloading. Skipped under Vitest,
// where the `virtual:pwa-register` module isn't wired up.
if (!process.env.VITEST) {
  plugins.push(
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The manifest already ships in public/manifest.webmanifest (linked from
      // index.html); let the plugin own only the service worker.
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
    }),
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins,
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
