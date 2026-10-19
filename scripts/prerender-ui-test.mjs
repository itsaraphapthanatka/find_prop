// ทดสอบ dist ที่ prerender แล้ว (scripts/prerender.mjs) ในเบราว์เซอร์จริง — รัน: node scripts/prerender-ui-test.mjs [dist]
// (2) มี JS → React mount ทับได้ ไม่มี error ของแอป (3) โหมดแอปติดตั้ง → การ์ดล้าง landing ก่อน React
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'
const ROOT = process.argv[2] || 'dist'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' }
const srv = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]))
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(ROOT, 'index.html')   // SPA fallback เหมือน Caddy
  res.setHeader('Content-Type', MIME[extname(p)] || 'application/octet-stream'); res.end(readFileSync(p))
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const url = `http://127.0.0.1:${srv.address().port}/`
const browser = await chromium.launch()
const out = []
// (1) บอทที่ไม่รัน JS
{
  const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const h1 = await page.locator('#root h1').first().textContent().catch(() => null)
  const geo = await page.locator('#root a[href="/geo"]').count()
  const text = (await page.locator('#root').innerText()).replace(/\s+/g, '').length
  out.push(`no-JS: h1="${(h1 || '').trim().slice(0, 40)}" · /geo links ${geo} · visible chars ${text}`)
  if (!h1 || !geo || text < 1500) { console.error('FAIL no-JS view'); process.exit(1) }
  await ctx.close()
}
// (2) ผู้ใช้จริง: React mount ทับ
{
  const ctx = await browser.newContext(); const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/placeholder\.supabase\.co|net::ERR|Failed to fetch|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 120)}`) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const mounted = await page.evaluate(() => Object.keys(document.getElementById('root')).some((k) => k.startsWith('__reactContainer')))
  const h1 = await page.locator('#root h1').first().textContent().catch(() => null)
  const footerGeo = await page.locator('footer a[href="/geo"]').count()
  out.push(`with JS: react mounted ${mounted} · h1 "${(h1 || '').trim().slice(0, 30)}" · footer /geo ${footerGeo} · app errors ${errors.length}`)
  if (!mounted || !h1 || errors.length) { console.error('FAIL hydration view', errors); process.exit(1) }
  await ctx.close()
}
// (3) แอปติดตั้ง (Capacitor) — บล็อกบันเดิล React เพื่อดูผลของการ์ดล้วน ๆ
{
  const ctx = await browser.newContext(); const page = await ctx.newPage()
  await page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true } })
  await page.route(/\/assets\/.*\.js$/, (r) => r.abort())
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const inner = (await page.locator('#root').innerHTML()).trim()
  out.push(`installed app: root after guard = ${inner.length} chars (ต้อง 0)`)
  if (inner.length) { console.error('FAIL guard did not clear root'); process.exit(1) }
  await ctx.close()
}
await browser.close(); srv.close()
console.log(out.join('\n')); console.log('PRERENDER BROWSER TESTS OK')
