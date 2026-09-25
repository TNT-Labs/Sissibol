import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Genera un timestamp di build per forzare l'aggiornamento del SW
const buildTime = new Date().toISOString()

// Percorso in cui è pubblicata l'app: "/" in locale, "/bolli/" dietro il
// tunnel Cloudflare (shopbeautylab.it/bolli). Sempre con la barra finale.
const base = `/${(process.env.VITE_BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')

// https://vite.dev/config/
export default defineConfig({
  base,
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
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'Sissibol - Gestione Scadenziario Bolli',
        short_name: 'Sissibol',
        lang: 'it',
        description: 'PWA per la gestione dello scadenziario bolli per autotrasporto',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        // Relativi: il manifest vale sotto qualunque percorso base.
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // (Prima qui c'era version.json, un file che non esiste: un file
        // mancante nel precache fa fallire l'installazione del service worker.)
        runtimeCaching: [
          {
            // Risposte delle API per l'uso offline, solo sotto il percorso
            // dell'app e solo risposte riuscite. Mai autenticazione e stato
            // del sistema. La cache viene svuotata al logout (clearApiCache).
            urlPattern: ({ url, sameOrigin }) => {
              const api = `${base}api/`
              const percorso = sameOrigin && url.pathname.startsWith(api)
                ? url.pathname.slice(api.length - 1)
                : url.pathname
              const apiPaths = ['/clienti', '/veicoli', '/scadenze', '/pagamenti', '/bollo', '/tariffe']
              return apiPaths.some(path => percorso.startsWith(path))
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
                // Solo 200: una risposta opaca (0) potrebbe essere un errore.
                statuses: [200],
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
