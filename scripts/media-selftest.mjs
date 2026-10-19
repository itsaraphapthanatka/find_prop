// ทดสอบวิดีโอสอนใช้งานแบบป้องกัน (HLS เข้ารหัส AES-128) ครบวง — รัน: npm run test:media
// ไม่ใช้ไฟล์วิดีโอจริง ไม่แตะ Supabase จริง: สร้างคลิปทดสอบ → หั่น+เข้ารหัสด้วยคำสั่ง ffmpeg ชุดเดียวกับ deploy/media-hls.sh
// → Caddy (deploy/Caddyfile) + server/index.mjs + Supabase จำลอง → ตรวจสิทธิ์กุญแจ และเล่นจริงด้วย hls.js ใน Chrome
// ต้องมี: ffmpeg + caddy (brew) · Google Chrome (เล่นจริง — Chromium ของ Playwright ไม่มีตัวถอด H.264)
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-media-'))
const children = []
const servers = []
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
})
async function waitFor(url, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return true } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}
const has = (cmd, arg = '-version') => spawnSync(cmd, [arg], { stdio: 'ignore' }).status === 0

try {
  if (!has('ffmpeg') || !has('caddy', 'version')) {
    console.log('⚠️  ต้องมี ffmpeg และ caddy (brew install ffmpeg caddy) — ข้ามการทดสอบ')
    process.exit(0)
  }

  // ── 1) คลิปทดสอบ → HLS เข้ารหัส (อาร์กิวเมนต์ ffmpeg ชุดเดียวกับ deploy/media-hls.sh) ──
  const keyHex = randomBytes(16).toString('hex')
  const media = path.join(tmp, 'media', 'tutorial')
  const ver = 'vTEST'
  fs.mkdirSync(path.join(media, ver), { recursive: true })
  const src = path.join(tmp, 'clip.mp4')
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=14',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=14', '-c:v', 'libx264', '-g', '50', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src])
  fs.writeFileSync(path.join(tmp, 'enc.key'), Buffer.from(keyHex, 'hex'))
  fs.writeFileSync(path.join(tmp, 'keyinfo'), `/api/media-key?v=tutorial\n${path.join(tmp, 'enc.key')}\n${randomBytes(16).toString('hex')}\n`)
  const script = fs.readFileSync('deploy/media-hls.sh', 'utf8')
  check('สคริปต์ใช้ -hls_key_info_file + -hls_playlist_type vod + -c copy เมื่อเป็น h264/aac',
    /-hls_key_info_file \/k\/keyinfo/.test(script) && /-hls_playlist_type vod/.test(script) && /CODEC="-c copy"/.test(script))
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-c', 'copy', '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod',
    '-hls_key_info_file', path.join(tmp, 'keyinfo'), '-hls_segment_filename', path.join(media, ver, 'seg%04d.ts'), path.join(media, ver, 'index.m3u8')])
  const playlist = fs.readFileSync(path.join(media, ver, 'index.m3u8'), 'utf8')
  const segs = fs.readdirSync(path.join(media, ver)).filter((f) => f.endsWith('.ts'))
  check('หั่นได้หลายชิ้น + playlist เข้ารหัส AES-128 ชี้กุญแจไปที่ /api/media-key', segs.length >= 2 && /METHOD=AES-128,URI="\/api\/media-key\?v=tutorial"/.test(playlist), `${segs.length} ชิ้น`)
  check('playlist ไม่มีที่อยู่ไฟล์กุญแจบนเครื่อง', !playlist.includes('enc.key'))
  const seg0 = fs.readFileSync(path.join(media, ver, segs[0]))
  check('ชิ้นวิดีโอถูกเข้ารหัสจริง (ไม่ใช่ MPEG-TS ดิบ — ไบต์แรกไม่ใช่ 0x47)', seg0[0] !== 0x47 || seg0[188] !== 0x47)
  fs.writeFileSync(path.join(media, 'current.json'), JSON.stringify({ playlist: `${ver}/index.m3u8`, duration: 14, chapters: [{ t: 0, title: 'เริ่ม' }, { t: 7, title: 'ครึ่งหลัง' }] }))
  fs.copyFileSync(src, path.join(media, 'leak.mp4')) // จำลองคนเผลอวางต้นฉบับไว้ในโฟลเดอร์ที่เสิร์ฟ

  // ── 2) Supabase จำลอง: token good = สมาชิก active · inactive = บัญชีถูกระงับ · อื่นๆ = เซสชันผิด ──
  const supaPort = await freePort()
  const users = { good: { id: 'u-good', email: 'viewer@example.com', active: true }, inactive: { id: 'u-off', email: 'off@example.com', active: false } }
  const supa = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/auth/v1/user') {
      const tok = (req.headers.authorization || '').replace('Bearer ', '')
      const user = users[tok]
      res.writeHead(user ? 200 : 403, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(user ? { id: user.id, email: user.email } : { msg: 'invalid JWT' }))
    }
    if (u.pathname === '/rest/v1/profiles') {
      const id = (u.searchParams.get('id') || '').replace('eq.', '')
      const user = Object.values(users).find((x) => x.id === id)
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify(user ? [{ active: user.active, is_super: false }] : []))
    }
    res.writeHead(404); res.end()
  }).listen(supaPort, '127.0.0.1')
  servers.push(supa)

  // ── 3) API + Caddy (Caddyfile จริง แทนที่แค่พอร์ต/ที่อยู่ไฟล์) ──
  const apiPort = await freePort()
  const api = spawn(process.execPath, ['server/index.mjs'], {
    env: { PATH: process.env.PATH, PORT: String(apiPort), ENABLE_CRON: '0', MEDIA_HLS_KEY: keyHex,
      VITE_SUPABASE_URL: `http://127.0.0.1:${supaPort}`, VITE_SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'svc-test' },
    stdio: 'ignore',
  })
  children.push(api)
  const dist = path.join(tmp, 'dist')
  fs.mkdirSync(dist)
  fs.copyFileSync('node_modules/hls.js/dist/hls.min.js', path.join(dist, 'hls.min.js'))
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><meta charset="utf-8"><video id="v" muted playsinline></video>
<script src="/hls.min.js"></script><script>
window.play = (token) => new Promise((resolve) => {
  const v = document.getElementById('v'); const errs = []
  const hls = new Hls({ xhrSetup: (xhr, url) => { if (url.includes('/api/media-key')) xhr.setRequestHeader('Authorization', 'Bearer ' + token) },
    keyLoadPolicy: { default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 20000, timeoutRetry: { maxNumRetry: 1, retryDelayMs: 1000, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 4000, shouldRetry: (_c, n, _t, res) => n < 2 && res?.code !== 401 && res?.code !== 403 } } } })
  hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) { errs.push(d.details + ':' + (d.response && d.response.code)); resolve({ t: v.currentTime, errs }) } })
  fetch('/media/tutorial/current.json').then(r => r.json()).then(m => { hls.loadSource('/media/tutorial/' + m.playlist); hls.attachMedia(v); v.play().catch(() => {}) })
  setTimeout(() => resolve({ t: v.currentTime, errs }), 6000)
})</script>`)
  const webPort = await freePort()
  const caddyfile = fs.readFileSync('deploy/Caddyfile', 'utf8')
    .replace(/^:8080 \{/m, `:${webPort} {`)
    .replaceAll('api:3000', `127.0.0.1:${apiPort}`)
    .replace('root * /srv/dist', `root * ${dist}`)
    .replace('root * /srv/media', `root * ${path.join(tmp, 'media')}`)
  fs.writeFileSync(path.join(tmp, 'Caddyfile'), caddyfile)
  const caddy = spawn('caddy', ['run', '--config', path.join(tmp, 'Caddyfile'), '--adapter', 'caddyfile'], { stdio: 'ignore' })
  children.push(caddy)
  const W = `http://127.0.0.1:${webPort}`
  check('Caddy + API เปิดขึ้น', (await waitFor(`${W}/healthz`)) && (await waitFor(`${W}/index.html`)))

  // ── 4) การเสิร์ฟชิ้นวิดีโอ ──
  let r = await fetch(`${W}/media/tutorial/current.json`)
  check('current.json: no-cache + CORS * (แอปมือถือดึงข้ามโดเมนได้)', r.ok && r.headers.get('cache-control') === 'no-cache' && r.headers.get('access-control-allow-origin') === '*')
  r = await fetch(`${W}/media/tutorial/${ver}/index.m3u8`)
  check('playlist: no-cache', r.ok && r.headers.get('cache-control') === 'no-cache')
  r = await fetch(`${W}/media/tutorial/${ver}/${segs[0]}`)
  check('ชิ้นวิดีโอ: แคชยาว immutable (อยู่ในโฟลเดอร์รุ่น ชื่อไม่ซ้ำ)', r.ok && (r.headers.get('cache-control') || '').includes('immutable'))
  r = await fetch(`${W}/media/tutorial/leak.mp4`)
  check('ไฟล์ .mp4 ในโฟลเดอร์ media ไม่ถูกเสิร์ฟ (404)', r.status === 404, String(r.status))
  r = await fetch(`${W}/media/tutorial/`)
  check('ไม่เปิดรายชื่อไฟล์ในโฟลเดอร์', r.status === 404 || !(await r.text()).includes('seg0000'), String(r.status))

  // ── 5) กุญแจ ──
  r = await fetch(`${W}/api/media-key?v=tutorial`)
  check('กุญแจ: ไม่มี token → 401', r.status === 401, String(r.status))
  r = await fetch(`${W}/api/media-key?v=tutorial`, { headers: { authorization: 'Bearer wrong' } })
  check('กุญแจ: token ผิด/หมดอายุ → 401', r.status === 401, String(r.status))
  r = await fetch(`${W}/api/media-key?v=tutorial`, { headers: { authorization: 'Bearer inactive' } })
  check('กุญแจ: บัญชียังไม่เปิดใช้/ถูกระงับ → 403', r.status === 403, String(r.status))
  r = await fetch(`${W}/api/media-key?v=tutorial`, { headers: { authorization: 'Bearer good' } })
  const keyBuf = Buffer.from(await r.arrayBuffer())
  check('กุญแจ: สมาชิก active → 200 ได้ 16 ไบต์ตรงกับที่เข้ารหัส', r.status === 200 && keyBuf.length === 16 && keyBuf.toString('hex') === keyHex, String(r.status))
  check('กุญแจ: ห้ามแคช (no-store)', (r.headers.get('cache-control') || '').includes('no-store'))
  r = await fetch(`${W}/api/media-key`, { method: 'OPTIONS', headers: { origin: 'https://localhost', 'access-control-request-method': 'GET' } })
  check('กุญแจ: แอปมือถือ (https://localhost) ผ่าน CORS preflight แบบ GET', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://localhost' && (r.headers.get('access-control-allow-methods') || '').includes('GET'))

  // ── 6) เล่นจริงด้วย hls.js ใน Chrome ──
  let chromium = null
  try { ({ chromium } = await import('playwright')) } catch { /* ไม่มี playwright */ }
  if (!chromium || !fs.existsSync('/Applications/Google Chrome.app')) {
    console.log('⚠️  ไม่มี Playwright หรือ Google Chrome — ข้ามการเล่นจริง')
  } else {
    const browser = await chromium.launch({ channel: 'chrome' })
    try {
      const page = await browser.newPage()
      await page.goto(`${W}/index.html`)
      const ok = await page.evaluate(() => window.play('good'))
      check('เล่นได้จริงเมื่อเป็นสมาชิก (ถอดรหัสแล้วเวลาเดิน)', ok.t > 1 && ok.errs.length === 0, JSON.stringify(ok))
      const page2 = await browser.newPage()
      await page2.goto(`${W}/index.html`)
      const bad = await page2.evaluate(() => window.play('wrong'))
      check('ไม่มีสิทธิ์ → เล่นไม่ได้ และแจ้งผู้ใช้ทันที (keyLoadError 401 ไม่ลองซ้ำ)', bad.t < 0.5 && bad.errs.some((e) => e.startsWith('keyLoadError:401')), JSON.stringify(bad))
      const pageSrc = fs.readFileSync('src/pages/TutorialPage.tsx', 'utf8')
      check('หน้าแอปใช้นโยบายกุญแจเดียวกับที่ทดสอบ (หยุดเมื่อ 401/403)', pageSrc.includes("res?.code !== 401 && res?.code !== 403") && pageSrc.includes("url.includes('/api/media-key')"))
    } finally {
      await browser.close()
    }
  }

  // ── 7) ไฟล์ deploy ──
  const compose = fs.readFileSync('deploy/docker-compose.yml', 'utf8')
  check('compose ต่อโฟลเดอร์วิดีโอเข้า web แบบอ่านอย่างเดียว', compose.includes('${HOP_MEDIA_DIR:-../../hop-media}:/srv/media:ro'))
  check('สคริปต์ไม่ใส่กุญแจในอาร์กิวเมนต์คำสั่ง (ps บนเครื่องที่ใช้ร่วมกัน)', /printf '%b' "\$\(echo "\$KEY"/.test(script) && !/docker run[^\n]*\$KEY/.test(script))
  check('สคริปต์จำกัดแรม ffmpeg (เครื่องใช้ร่วม vLLM)', /docker run --rm --memory 1g/.test(script))
  check('สคริปต์ตรวจว่า playlist เข้ารหัสก่อนเปิดให้ดู', script.includes("grep -q 'METHOD=AES-128'"))
  const chapters = JSON.parse(fs.readFileSync('deploy/media/tutorial-chapters.json', 'utf8'))
  check('สารบัญ 17 บท เรียงเวลา เริ่มที่ 0', chapters.length === 17 && chapters[0].t === 0 && chapters.every((c, i) => i === 0 || c.t > chapters[i - 1].t))
} finally {
  for (const c of children) c.kill('SIGTERM')
  for (const s of servers) s.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}

const failed = results.filter((x) => !x.ok)
for (const x of results) console.log(`${x.ok ? '✅' : '❌'} ${x.name}${!x.ok && x.extra ? `  — ${x.extra}` : ''}`)
console.log(`\n${results.length - failed.length}/${results.length} ผ่าน`)
process.exit(failed.length ? 1 : 0)
