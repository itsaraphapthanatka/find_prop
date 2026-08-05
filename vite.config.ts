import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// รหัส build = commit ที่กำลัง build (CI/Vercel มี env ให้ / เครื่อง dev ถามจาก git)
// แอปมือถือใช้เทียบกับ /app-update.json เพื่อรู้ว่าตัวเองรันโค้ดชุดล่าสุดหรือยัง
// — ต้องคำนวณเหมือนกันกับ scripts/update-zip.mjs
function buildId(): string {
  const fromEnv = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA
  if (fromEnv) return fromEnv
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

/**
 * คู่มือ HTML ใน docs/ ให้เปิดได้จากในแอปโดย "ไม่โชว์ .html" ใน URL
 * ⚠️ ไฟล์ใน PRIVATE_DOCS ไม่ถูกก๊อปขึ้น production (เอกสารภายใน เช่นเอกสารนำเสนอนักลงทุน)
 *    — เปิดได้เฉพาะตอน dev หรือดับเบิลคลิกไฟล์เปิดในเบราว์เซอร์ (ไฟล์ self-contained)
 *   /docs/training → docs/TRAINING.html   ·   /docs/system → docs/SYSTEM.html
 * - dev: เสิร์ฟผ่าน middleware (รับทั้งแบบไม่มีนามสกุลและแบบเต็มชื่อไฟล์ เผื่อลิงก์เก่า)
 * - build: ก๊อปไป dist/docs/ เป็นชื่อพิมพ์เล็ก (training.html) แล้วให้ vercel.json rewrite
 *          จาก /docs/training → /docs/training.html (rewrite ไม่เปลี่ยน URL บนแถบที่อยู่)
 * เก็บไฟล์ต้นทางไว้ที่ docs/ ที่เดียว ไม่ต้องมีสำเนาใน public/ (กันแก้แล้วลืมอีกที่)
 */
/** เอกสารภายใน — ห้ามขึ้น production (เทียบชื่อไฟล์แบบไม่สนตัวพิมพ์) */
const PRIVATE_DOCS = ['investor.html']

function docsPlugin(): Plugin {
  const files = () => (existsSync('docs') ? readdirSync('docs').filter((f) => f.endsWith('.html')) : [])
  const isPrivate = (f: string) => PRIVATE_DOCS.includes(f.toLowerCase())
  /** ชื่อที่ผู้ใช้ขอ (training / TRAINING.html) → ชื่อไฟล์จริงใน docs/ */
  const resolve = (want: string) => {
    const slug = want.replace(/\.html$/i, '').toLowerCase()
    return files().find((f) => f.replace(/\.html$/i, '').toLowerCase() === slug)
  }
  return {
    name: 'hop-docs',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/docs/')) return next()
        const file = resolve(decodeURIComponent(req.url.split('?')[0].slice('/docs/'.length)))
        if (!file) return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(readFileSync(join('docs', file)))
      })
    },
    closeBundle() {
      const list = files().filter((f) => !isPrivate(f))   // เอกสารภายในไม่ขึ้น production
      if (list.length === 0) return
      mkdirSync('dist/docs', { recursive: true })
      // ชื่อไฟล์พิมพ์เล็กเสมอ — URL สวยและตรงกับ rewrite ใน vercel.json
      for (const f of list) copyFileSync(join('docs', f), join('dist/docs', f.toLowerCase()))
    },
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()), __BUILT_AT__: JSON.stringify(Date.now()) },
  plugins: [
    react(),
    docsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // ลงทะเบียน SW เองใน main.tsx (ข้ามเมื่อรันในแอป Capacitor — ดูคอมเมนต์ที่นั่น)
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'HOP — ฐานข้อมูลทรัพย์ให้เช่า/ขาย',
        short_name: 'HOP',
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
        navigateFallbackDenylist: [/\/features\.html$/, /\/guide\.html$/, /\/flow\.html$/, /\/flow-internal\.html$/, /\/qa-review\.html$/],
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
      // ปิด SW ตอน dev — แคชของ SW ทำให้แก้โค้ดแล้วเบราว์เซอร์ยังโชว์ของเก่า (ดู src/main.tsx)
      // ทดสอบ PWA/offline ให้ build จริงแล้ว npm run preview
      devOptions: { enabled: false },
    }),
  ],
})
