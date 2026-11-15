import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['dunu-logo.webp', 'icons/dunu-192.png', 'icons/dunu-512.png', 'icons/dunu-maskable-512.png', 'icon.svg'],
      manifest: {
        name: 'DUNU BÉNIN — Restaurants, commandes et livraison',
        short_name: 'DUNU',
        description: 'Découvrez les restaurants et les plats disponibles autour de vous, commandez et faites-vous livrer au Bénin.',
        lang: 'fr-BJ',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        categories: ['food', 'lifestyle', 'shopping'],
        background_color: '#F5EBDD',
        theme_color: '#6D071A',
        icons: [
          { src: '/icons/dunu-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/dunu-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/dunu-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Les grandes publicités restent accessibles en ligne, mais ne bloquent
        // pas la génération du Service Worker ni le cache initial hors ligne.
        globIgnores: ['**/dunu-publicite.png'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
      },
      devOptions: { enabled: false }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:10000', '/socket.io': 'http://localhost:10000' } }
});
