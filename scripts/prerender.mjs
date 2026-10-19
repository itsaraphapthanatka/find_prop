// prerender หน้า landing ลง dist/index.html — รันต่อจาก `vite build` ใน npm run build (ดู package.json)
//
// ทำไม: เว็บเป็น SPA (HashRouter) ที่ส่ง <div id="root"> ว่างให้บอท — บอท AI/Google ที่ไม่รัน JavaScript จึงมองไม่เห็นอะไรเลย
// หน้าสาธารณะมีหน้าเดียวคือ "/" (landing) ส่วน route อื่นอยู่ใต้ #/ และต้องล็อกอิน จึง prerender แค่หน้านี้
// ผลลัพธ์: HTML ของ / มี h1, เนื้อหาจริง และลิงก์ไป /geo (บทความ GEO) ตั้งแต่ตัวแรกที่เซิร์ฟเวอร์ส่ง
// ผู้ใช้จริง: React (createRoot) มาแทนที่เนื้อหานี้ตอน mount · แอป Capacitor / PWA ที่ติดตั้งไว้ไม่ควรเห็น landing แวบ
// ก่อนหน้า login จึงมีสคริปต์เล็ก ๆ ล้างทิ้งก่อน (เงื่อนไขเดียวกับ isInstalledApp ใน src/lib/native.ts)
// ถ้า render ได้เนื้อหาน้อยผิดปกติ สคริปต์จะล้ม build ทันที — ดีกว่าปล่อย HTML ว่างขึ้น production เงียบ ๆ
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const SSR_DIR = 'dist-ssr'
const INDEX = 'dist/index.html'
const MIN_TEXT = 1500 // ตัวอักษรที่มองเห็นขั้นต่ำ — landing จริงมีหลายพัน; ตัวตรวจสุขภาพ GEO ใช้เกณฑ์ 300/800

function fail(msg) {
  console.error(`prerender: ${msg}`)
  process.exit(1)
}

if (!existsSync(INDEX)) fail('ไม่พบ dist/index.html — ต้องรัน vite build ก่อน')

// 1) บันเดิล entry-server เป็นโมดูล Node — ไม่ใช้ vite.config.ts ของโปรเจกต์ (PWA/ปลั๊กอินอื่นไม่เกี่ยวกับงานนี้)
await build({
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA || 'prerender'),
    __BUILT_AT__: JSON.stringify(Date.now()),
  },
  build: { ssr: 'src/entry-server.tsx', outDir: SSR_DIR, emptyOutDir: true, minify: false },
})

// 2) render เป็น HTML แล้วตรวจว่าได้ของจริง
const mod = await import(pathToFileURL(resolve(SSR_DIR, 'entry-server.js')).href)
const markup = mod.render()
const text = markup.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
const hasH1 = /<h1[\s>]/.test(markup)
const hasGeo = markup.includes('href="/geo"')
if (text.length < MIN_TEXT || !hasH1 || !hasGeo) {
  fail(`ผลไม่ผ่านเกณฑ์ — ตัวอักษร ${text.length} (ต้อง ≥ ${MIN_TEXT}) · h1: ${hasH1} · ลิงก์ /geo: ${hasGeo}`)
}

// 3) ใส่แทนเนื้อหาใน <div id="root">…</div> ของ dist/index.html (หา </div> คู่ที่ถูกต้องแบบนับชั้น)
let html = readFileSync(INDEX, 'utf8')
const OPEN = '<div id="root">'
const open = html.indexOf(OPEN)
if (open < 0) fail('ไม่พบ <div id="root"> ใน dist/index.html')
const re = /<div\b|<\/div>/g
re.lastIndex = open + OPEN.length
let depth = 1
let close = -1
let m
while ((m = re.exec(html))) {
  depth += m[0] === '</div>' ? -1 : 1
  if (depth === 0) {
    close = m.index
    break
  }
}
if (close < 0) fail('หา </div> ที่ปิด root ไม่เจอ')

// แอป Capacitor / PWA ที่ติดตั้งไว้ → ล้าง landing ทิ้งก่อน React mount (คนกลุ่มนี้เห็นหน้า login/แอป ไม่ใช่ landing)
const guard =
  '<script>(function(){try{var c=window.Capacitor;' +
  "if((c&&c.isNativePlatform&&c.isNativePlatform())||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true)" +
  "{document.getElementById('root').innerHTML=''}}catch(e){}})()</script>"

html = html.slice(0, open) + OPEN + markup + '</div>' + guard + html.slice(close + '</div>'.length)
writeFileSync(INDEX, html)
rmSync(SSR_DIR, { recursive: true, force: true })
console.log(`prerender: landing → dist/index.html · ${text.length} ตัวอักษร · ${(markup.match(/<a /g) || []).length} ลิงก์ · h1 ✓ · /geo ✓`)
