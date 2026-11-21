import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'DawaaSathi — Medicine Companion',
        short_name: 'DawaaSathi',
        description: 'Medicine reminders, dose tracking and caregiver alerts',
        theme_color: '#14284b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      // App shell works offline; patient data is cached in IndexedDB by the app itself.
      workbox: { globPatterns: ['**/*.{js,css,html,svg}'], navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    // The browser talks to /api on the same origin; Vite forwards it to the Express server.
    proxy: { '/api': 'http://localhost:4000' },
  },
  preview: { proxy: { '/api': 'http://localhost:4000' } },
});
