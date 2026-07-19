import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ลงทะเบียน SW เองใน main.tsx (ข้ามเมื่อรันในแอป Capacitor — ดูคอมเมนต์ที่นั่น)
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'HOB — ฐานข้อมูลทรัพย์ให้เช่า/ขาย',
        short_name: 'HOB',
        description: 'ฐานข้อมูลอสังหาริมทรัพย์ให้เช่า/ขาย — โกดัง โรงงาน โชว์รูม ออฟฟิศ',
        lang: 'th',
        display: 'standalone',
        start_url: '/',
        theme_color: '#ffffff',
        background_color: '#f7f7f9',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // หน้าเอกสาร static ต้องไม่ถูก SW ดักพาเข้า SPA
        navigateFallbackDenylist: [/\/features\.html$/],
        runtimeCaching: [
          {
            // แผนที่ OSM — ใช้ซ้ำบ่อย เก็บ cache ไว้ดู offline ได้
            urlPattern: /^https:\/\/[a-z]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/leaflet/,
            handler: 'CacheFirst',
            options: { cacheName: 'leaflet-assets', expiration: { maxEntries: 10 } },
          },
          {
            // ข้อมูลทรัพย์ — เอาสดก่อน ถ้า offline ใช้ตัวล่าสุดที่เคยโหลด
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 3600 },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-photos',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
})
