import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Genera un timestamp di build per forzare l'aggiornamento del SW
const buildTime = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    // exceljs/jspdf sono importati dinamicamente (solo alla generazione di
    // un report), quindi finiscono in chunk separati e non pesano sul bundle
    // iniziale: alziamo la soglia per non far scattare warning su di loro.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor stabile (React + router): cache di lungo periodo separata
          // dal codice applicativo che cambia più spesso.
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Sissibol - Gestione Scadenziario Bolli',
        short_name: 'Sissibol',
        description: 'PWA per la gestione dello scadenziario bolli per autotrasporto',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Forza la rigenerazione del SW ad ogni build
        additionalManifestEntries: [
          { url: '/version.json', revision: buildTime }
        ],
        runtimeCaching: [
          {
            // Cache API calls - pattern corretto per qualsiasi origine
            // Matcha sia localhost:3000 che domini di produzione
            urlPattern: ({ url }) => {
              // Lista dei path API da cachare
              const apiPaths = [
                '/auth',
                '/clienti',
                '/veicoli',
                '/scadenze',
                '/pagamenti',
                '/bollo',
                '/utenti',
                '/tariffe',
              ];
              return apiPaths.some(path => url.pathname.startsWith(path));
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400, // 1 giorno
              },
              networkTimeoutSeconds: 10, // Fallback a cache dopo 10s di timeout
              cacheableResponse: {
                statuses: [0, 200], // Cache anche opaque responses
              },
            },
          },
          {
            // Cache immagini e asset statici
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 giorni
              },
            },
          },
          {
            // Cache font
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 anno
              },
            },
          },
        ],
      },
    }),
  ],
})
