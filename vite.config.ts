import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Path relatif biar hasil build gampang dibungkus / di-deploy di mana saja.
  base: './',
  // Izinkan host tunnel (Cloudflare) mengakses server dev/preview.
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Aliansi — Ruang Cerita',
        short_name: 'Aliansi',
        description: 'Ruang minimalis untuk berbagi cerita dan jurnal harian.',
        theme_color: '#0d0d0f',
        background_color: '#0d0d0f',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // terser workbox-build gagal exit di environment Android/Termux.
        mode: 'development',
        inlineWorkboxRuntime: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
