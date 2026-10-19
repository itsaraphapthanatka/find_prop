// ทดสอบชุดย้ายขึ้นเครื่อง msi-edgexpert-04dc — รัน: npm run test:server
// ไม่ต้องเปิด dev server · ไม่ต้องมี Docker · ไม่แตะ Supabase/Stripe จริง
//
//   1) server/index.mjs ทำตัวเหมือน Vercel (req.query/body · res.status/json/send/redirect · raw body ของ webhook)
//   2) โหลด api/*.js ของจริงได้ (ไม่มี env → ตอบ 401/4xx แต่ไม่ล้ม)
//   3) Caddy (ถ้ามีในเครื่อง): ทุก redirect/rewrite/header ใน vercel.json ทำงานเหมือนเดิม + /api ส่งต่อถึง server
//   4) ไฟล์ deploy: ไลบรารีครบ · env ครบ · ไม่มีค่าลับ · พอร์ตไม่เปิดออกนอกเครื่อง · cron ไม่ซ้ำ
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'

const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })
const read = (f) => fs.readFileSync(f, 'utf8')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-server-'))
const children = []

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
function startServer(env) {
  const child = spawn(process.execPath, ['server/index.mjs'], { env: { PATH: process.env.PATH, ENABLE_CRON: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => { log += d })
  child.stderr.on('data', (d) => { log += d })
  children.push(child)
  return { child, log: () => log }
}
const noFollow = { redirect: 'manual' }
// fetch ของ Node ไม่ยอมให้ตั้ง Host เอง — ใช้ http.request สำหรับเทสที่ต้องปลอม Host (www / ลิงก์กลับจาก Stripe)
const rawRequest = (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request(url, { method, headers }, (res) => {
    let data = ''
    res.on('data', (c) => { data += c })
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
  })
  req.on('error', reject)
  req.end(body)
})

try {
  // ── 1) ตัวแปลง Vercel → Node (handler ทดสอบ) ──
  const apiDir = path.join(tmp, 'api')
  fs.mkdirSync(path.join(apiDir, '_lib'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}')
  fs.writeFileSync(path.join(apiDir, 'echo.js'), `export default function (req, res) {
    res.status(200).json({ method: req.method, query: req.query, body: req.body ?? null, isBuf: Buffer.isBuffer(req.body), host: req.headers.host, xfh: req.headers['x-forwarded-host'] || null, url: req.url })
  }`)
  fs.writeFileSync(path.join(apiDir, 'raw.js'), `import { createHash } from 'node:crypto'
  export const config = { api: { bodyParser: false } }
  export default async function (req, res) {
    const chunks = []; for await (const c of req) chunks.push(c)
    const buf = Buffer.concat(chunks)
    res.status(200).json({ bodyUntouched: req.body === undefined, len: buf.length, sha: createHash('sha256').update(buf).digest('hex') })
  }`)
  fs.writeFileSync(path.join(apiDir, 'boom.js'), `export default function () { throw new Error('secret-internal-detail') }`)
  fs.writeFileSync(path.join(apiDir, 'redir.js'), `export default function (req, res) { res.redirect(308, '/elsewhere') }`)
  fs.writeFileSync(path.join(apiDir, 'text.js'), `export default function (req, res) { res.status(201).send('สวัสดี') }`)
  fs.writeFileSync(path.join(apiDir, 'ended.js'), `export default function (req, res) { res.status(204).end() }`)
  fs.writeFileSync(path.join(apiDir, '_lib', 'hidden.js'), `export default function (req, res) { res.status(200).json({ leaked: true }) }`)

  const port = await freePort()
  const srv = startServer({ PORT: String(port), HOP_API_DIR: apiDir })
  const B = `http://127.0.0.1:${port}`
  check('server เปิดขึ้นได้', await waitFor(`${B}/healthz`), srv.log())

  let r = await fetch(`${B}/healthz`); let j = await r.json()
  check('/healthz ตอบ ok', r.status === 200 && j.ok === true)

  r = await fetch(`${B}/api/echo?a=1&b=%E0%B8%81`); j = await r.json()
  check('GET: req.query อ่านค่าได้ (รวมภาษาไทย)', j.query.a === '1' && j.query.b === 'ก', JSON.stringify(j.query))
  check('GET: ไม่มี body', j.body === null)
  check('req.url ยังเป็น path+query เดิม (push-cron ใช้เช็ค ?test=1)', j.url === '/api/echo?a=1&b=%E0%B8%81', j.url)

  r = await fetch(`${B}/api/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'บ้าน', n: 2 }) }); j = await r.json()
  check('POST JSON: req.body เป็น object', j.body?.name === 'บ้าน' && j.body?.n === 2, JSON.stringify(j.body))
  check('res.json ใส่ content-type JSON', (r.headers.get('content-type') || '').includes('application/json'))

  r = await fetch(`${B}/api/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })
  check('JSON เสีย → 400 (ไม่ล้ม)', r.status === 400)

  r = await fetch(`${B}/api/echo`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1&y=%E0%B8%82' }); j = await r.json()
  check('POST form: แปลงเป็น object', j.body?.x === '1' && j.body?.y === 'ข')

  r = await fetch(`${B}/api/echo`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }); j = await r.json()
  check('POST text: ได้เป็นข้อความ', j.body === 'hello')

  r = await fetch(`${B}/api/echo/`); check('มี / ท้าย path ก็เรียกได้', r.status === 200)

  // webhook: ต้องได้ไบต์ดิบตรงเป๊ะ (Stripe ตรวจลายเซ็นจาก raw body)
  const payload = Buffer.from(JSON.stringify({ id: 'evt_test', data: { object: { amount: 99000, note: 'ทดสอบ ✓' } } }) + '\n  ')
  r = await fetch(`${B}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }); j = await r.json()
  check('bodyParser:false → handler อ่าน raw body เองได้ ไบต์ตรงเป๊ะ',
    j.bodyUntouched && j.len === payload.length && j.sha === createHash('sha256').update(payload).digest('hex'), JSON.stringify(j))

  r = await fetch(`${B}/api/boom`); j = await r.json()
  check('handler throw → 500 แบบไม่เผยรายละเอียดภายใน', r.status === 500 && !JSON.stringify(j).includes('secret-internal-detail'))
  check('…และบันทึก error ลง log ไว้ไล่ปัญหา', srv.log().includes('secret-internal-detail'))
  r = await fetch(`${B}/healthz`); check('server ยังอยู่หลัง handler พัง', r.status === 200)

  r = await fetch(`${B}/api/redir`, noFollow)
  check('res.redirect(308, url)', r.status === 308 && r.headers.get('location') === '/elsewhere')
  r = await fetch(`${B}/api/text`)
  check('res.status(201).send(ข้อความ)', r.status === 201 && (await r.text()) === 'สวัสดี')
  r = await fetch(`${B}/api/ended`, { method: 'OPTIONS' })
  check('res.status(204).end()', r.status === 204)

  r = await fetch(`${B}/api/_lib/hidden`); check('api/_lib/* ไม่เปิดเป็น endpoint', r.status === 404)
  r = await fetch(`${B}/api/_lib%2Fhidden`); check('…แม้เข้ารหัส / เป็น %2F', r.status === 404)
  r = await fetch(`${B}/api/..%2F..%2Fpackage`); check('กัน path traversal', r.status === 404)
  r = await fetch(`${B}/api/Echo`); check('ชื่อตัวพิมพ์ใหญ่ไม่จับคู่ (เหมือน Vercel บน Linux)', r.status === 404)
  r = await fetch(`${B}/api/nope`); check('endpoint ที่ไม่มี → 404', r.status === 404)
  r = await fetch(`${B}/index.html`); check('server ไม่เสิร์ฟไฟล์อื่นนอก /api', r.status === 404)

  const big = Buffer.alloc(13 * 1024 * 1024, 97)
  r = await fetch(`${B}/api/echo`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: big }).catch((e) => ({ status: 'ERR:' + e.cause?.code }))
  check('body ใหญ่เกิน 12MB ถูกปฏิเสธ (413 หรือตัดการเชื่อมต่อ)', r.status === 413 || String(r.status).startsWith('ERR'), String(r.status))
  r = await fetch(`${B}/healthz`); check('server ยังอยู่หลังโดนยิง body ใหญ่', r.status === 200)

  check('log ไม่บันทึก body/query (ข้อมูลส่วนตัว)', !srv.log().includes('บ้าน') && !srv.log().includes('a=1'))

  // ── 2) api/*.js ของจริง (ไม่มี env ใดๆ) ──
  const realPort = await freePort()
  const real = startServer({ PORT: String(realPort) })
  const R = `http://127.0.0.1:${realPort}`
  check('server โหลดโฟลเดอร์ api/ จริงได้', await waitFor(`${R}/healthz`), real.log())
  r = await fetch(`${R}/api/push-cron`)
  check('push-cron ไม่มี CRON_SECRET → 401 (คนนอกยิงเองไม่ได้)', r.status === 401, String(r.status))
  r = await fetch(`${R}/api/stripe`, { method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } })
  check('CORS preflight ของแอปมือถือผ่าน server', r.status === 204 && r.headers.get('access-control-allow-origin') === 'capacitor://localhost')
  r = await fetch(`${R}/api/stripe-webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  check('stripe-webhook ไม่มีลายเซ็น → ปฏิเสธ (4xx/5xx)', r.status >= 400, String(r.status))
  for (const f of fs.readdirSync('api').filter((f) => f.endsWith('.js'))) {
    const name = f.replace(/\.js$/, '')
    r = await fetch(`${R}/api/${name}`, { method: 'OPTIONS' })
    check(`api/${f} โหลดได้ (ไม่ใช่ 404/500 จากตัวโหลด)`, r.status !== 404 && !(r.status === 500 && real.log().includes(`[api/${name}] โหลดไม่สำเร็จ`)), String(r.status))
  }
  r = await fetch(`${R}/healthz`); check('server จริงยังอยู่หลังเรียกทุก endpoint', r.status === 200)

  // ── 3) Caddy + กฎจาก vercel.json ──
  const vercel = JSON.parse(read('vercel.json'))
  const caddyfile = read('deploy/Caddyfile')
  const hasCaddy = spawnSync('caddy', ['version']).status === 0
  if (!hasCaddy) {
    console.log('⚠️  ไม่พบคำสั่ง caddy ในเครื่อง — ข้ามการทดสอบ Caddy แบบรันจริง (brew install caddy)')
  } else {
    const valid = spawnSync('caddy', ['validate', '--config', 'deploy/Caddyfile', '--adapter', 'caddyfile'], { encoding: 'utf8' })
    check('Caddyfile ผ่าน caddy validate', valid.status === 0, (valid.stderr || '').split('\n').filter((l) => /error/i.test(l)).join(' ').slice(0, 300))
    const fmt = spawnSync('caddy', ['fmt', 'deploy/Caddyfile'], { encoding: 'utf8' })
    check('Caddyfile จัดรูปแบบแล้ว (caddy fmt)', fmt.stdout === caddyfile)

    // dist จำลอง — ไฟล์ปลายทางของทุก redirect/rewrite
    const dist = path.join(tmp, 'dist')
    const put = (p, body = `<!-- /${p} -->`) => { fs.mkdirSync(path.dirname(path.join(dist, p)), { recursive: true }); fs.writeFileSync(path.join(dist, p), body) }
    for (const p of ['index.html', 'sw.js', 'guide.html', 'flow.html', 'flow-internal.html', 'features.html', 'qa-review.html',
      'stats.html', 'presentation.html', 'docs/training.html', 'docs/system.html', 'docs/features.html', 'assets/index-abc123.js',
      'app-update.json', 'app-update.zip', 'registerSW.js', 'workbox-abc123.js', 'manifest.webmanifest']) put(p)

    const webPort = await freePort()
    const local = caddyfile
      .replace(/^:8080 \{/m, `:${webPort} {`)
      .replaceAll('api:3000', `127.0.0.1:${port}`)
      .replace('root * /srv/dist', `root * ${dist}`)
    fs.writeFileSync(path.join(tmp, 'Caddyfile'), local)
    const caddy = spawn('caddy', ['run', '--config', path.join(tmp, 'Caddyfile'), '--adapter', 'caddyfile'], { stdio: 'ignore' })
    children.push(caddy)
    const W = `http://127.0.0.1:${webPort}`
    check('Caddy เปิดขึ้นได้', await waitFor(`${W}/index.html`))

    for (const rd of vercel.redirects) {
      r = await fetch(W + rd.source, noFollow)
      const want = rd.permanent ? 308 : 307
      check(`redirect ${rd.source} → ${rd.destination}`, r.status === want && r.headers.get('location') === rd.destination, `${r.status} ${r.headers.get('location')}`)
    }
    // ปลายทางตัวพิมพ์เล็กต้องเปิดได้เลย ไม่วน redirect (matcher path ของ Caddy ไม่สนตัวพิมพ์)
    for (const d of new Set(vercel.redirects.map((x) => x.destination))) {
      r = await fetch(W + d, noFollow)
      check(`ปลายทาง ${d} เปิดได้ ไม่วน redirect`, r.status === 200, String(r.status))
    }
    for (const rw of vercel.rewrites.filter((x) => x.destination.startsWith('/'))) {
      r = await fetch(W + rw.source, noFollow)
      const body = await r.text()
      check(`rewrite ${rw.source} → ${rw.destination} (URL ไม่เปลี่ยน)`, r.status === 200 && body.includes(rw.destination), `${r.status}`)
    }

    r = await fetch(`${W}/app-update.json`)
    check('app-update.json: CORS * + no-store (ตาม vercel.json)', r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', r.headers.get('cache-control'))
    r = await fetch(`${W}/app-update.zip`)
    check('app-update.zip: CORS *', r.headers.get('access-control-allow-origin') === '*')
    r = await fetch(`${W}/assets/index-abc123.js`)
    check('/assets/* แคชยาว immutable', (r.headers.get('cache-control') || '').includes('immutable'))
    for (const p of ['/', '/index.html']) {
      r = await fetch(W + p)
      check(`${p} ต้องสดเสมอ (max-age=0) ไม่งั้นค้างเวอร์ชันเก่า`, r.status === 200 && (r.headers.get('cache-control') || '').includes('max-age=0'), r.headers.get('cache-control'))
    }
    // Cloudflare ทับ max-age=0 ของ .js/.zip เป็น 4 ชม. → ไฟล์ชื่อคงที่ที่เปลี่ยนทุก build ต้องเป็น no-cache
    for (const p of ['/sw.js', '/registerSW.js', '/workbox-abc123.js', '/app-update.zip', '/manifest.webmanifest']) {
      r = await fetch(W + p)
      check(`${p} เป็น no-cache (Cloudflare ทับ max-age=0 ได้ แต่ไม่ทับ no-cache)`, r.status === 200 && r.headers.get('cache-control') === 'no-cache', r.headers.get('cache-control'))
    }
    r = await fetch(`${W}/nope.html`); check('ไฟล์ที่ไม่มี → 404', r.status === 404)

    const viaHost = await rawRequest(`${W}/api/echo?q=1`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'hopai.online' }, body: '{"k":"ค"}' })
    j = JSON.parse(viaHost.body)
    check('Caddy ส่ง /api/* ถึง server (method/query/body ครบ)', j.method === 'POST' && j.query.q === '1' && j.body?.k === 'ค', JSON.stringify(j))
    check('Host เดิมส่งถึง API (appUrl ใช้สร้างลิงก์กลับจาก Stripe)', j.host === 'hopai.online' || j.xfh === 'hopai.online', `${j.host} / ${j.xfh}`)
    const rawCaddy = await fetch(`${W}/api/raw`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload }).then((x) => x.json())
    check('webhook ผ่าน Caddy ไบต์ยังตรงเป๊ะ', rawCaddy.len === payload.length && rawCaddy.sha === createHash('sha256').update(payload).digest('hex'))
    r = await fetch(`${W}/healthz`); check('/healthz ผ่าน Caddy ถึง API', r.status === 200 && (await r.json()).ok === true)
    const www = await rawRequest(`${W}/guide.html?x=1`, { headers: { host: 'www.hopai.online' } })
    check('www.hopai.online → hopai.online (308 เก็บ path+query)', www.status === 308 && www.headers.location === 'https://hopai.online/guide.html?x=1', `${www.status} ${www.headers.location}`)
    const apex = await rawRequest(`${W}/guide.html`, { headers: { host: 'hopai.online' } })
    check('hopai.online ไม่โดน redirect ซ้ำ', apex.status === 200, String(apex.status))
  }

  // GEO ไปบริการภายนอก — ไม่ยิงเน็ตจริงในเทส ตรวจว่า Caddy ส่งไป path เดียวกับ vercel.json
  for (const rw of vercel.rewrites.filter((x) => /^https?:/.test(x.destination))) {
    const u = new URL(rw.destination.replace(':path*', ''))
    check(`GEO ${rw.source} ส่งต่อไป ${u.host}${u.pathname}`, caddyfile.includes(`reverse_proxy ${u.origin}`) && caddyfile.includes(u.pathname))
  }

  // ── 4) ไฟล์ deploy ──
  const serverPkg = JSON.parse(read('server/package.json'))
  const serverLock = JSON.parse(read('server/package-lock.json'))
  const imports = new Set()
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    if (!p.endsWith('.js')) return
    for (const m of read(p).matchAll(/(?:from\s+|import\(\s*)['"]([^'"./][^'"]*)['"]/g)) if (!m[1].startsWith('node:')) imports.add(m[1].split('/')[0])
  })
  walk('api')
  for (const dep of imports) {
    check(`ไลบรารี "${dep}" ที่ api/ ใช้ อยู่ใน server/package.json`, serverPkg.dependencies?.[dep])
    const rootVer = JSON.parse(read(`node_modules/${dep}/package.json`)).version
    check(`"${dep}" รุ่นเดียวกับที่ทดสอบบน Vercel (${rootVer})`, serverLock.packages?.[`node_modules/${dep}`]?.version === rootVer, serverLock.packages?.[`node_modules/${dep}`]?.version)
  }
  check('server/package.json เป็น ESM (api/*.js ใช้ export default)', serverPkg.type === 'module')

  const envVars = new Set()
  const walkEnv = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walkEnv(p)
    for (const m of read(p).matchAll(/process\.env\.([A-Z0-9_]+)/g)) envVars.add(m[1])
  })
  walkEnv('api')
  const envExample = read('deploy/.env.example')
  for (const v of envVars) check(`.env.example มี ${v}`, new RegExp(`^${v}=`, 'm').test(envExample))
  check('.env.example ไม่มีค่าลับจริง', !/(sk_live_|sk_test_|rk_live_|whsec_[A-Za-z0-9]{8}|eyJ[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20})/.test(envExample))

  const compose = read('deploy/docker-compose.yml')
  check('compose ไม่มีค่าลับฝัง', !/(sk_live_|sk_test_|whsec_|eyJ[A-Za-z0-9_-]{20,})/.test(compose))
  check('เว็บเปิดพอร์ตเฉพาะในเครื่อง (127.0.0.1) — ภายนอกเข้าผ่าน tunnel เท่านั้น', /"127\.0\.0\.1:\$\{WEB_PORT:-8098\}:8080"/.test(compose) && !/^\s*-\s*"?(0\.0\.0\.0:)?\d+:\d+"?\s*$/m.test(compose))
  check('api ไม่เปิดพอร์ตออกนอก docker', !/api:[\s\S]*?ports:[\s\S]*?web:/.test(compose))
  const images = [...compose.matchAll(/image:\s*(\S+)/g), ...read('deploy/api.Dockerfile').matchAll(/^FROM\s+(\S+)/gm), ...read('deploy/web.Dockerfile').matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1])
  check('ไม่ชนพอร์ตที่บริการอื่นบนเครื่อง edgexpert ใช้อยู่ (8080, 3000)', !/127\.0\.0\.1:\$\{WEB_PORT:-(8080|3000)\}/.test(compose) && /^WEB_PORT=8098$/m.test(envExample))
  for (const svc of ['api', 'web', 'tunnel']) {
    const block = compose.split(/\n  (?=[a-z]+:\n)/).find((b) => b.startsWith(`${svc}:`)) || ''
    check(`compose: ${svc} จำกัดแรม (เครื่องใช้ร่วมกับบริการอื่น)`, /mem_limit: \d+m/.test(block))
  }
  check('tunnel ใน compose เปิดเฉพาะเมื่อเลือก (เครื่องที่มี cloudflared อยู่แล้วไม่ซ้อน)', /tunnel:\s*\n(?:\s*#.*\n)*\s*profiles: \["tunnel"\]/.test(compose) || /profiles: \["tunnel"\]\s*\n\s*image: cloudflare/.test(compose))
  const ours = (i) => i.startsWith('ghcr.io/itsaraphapthanatka/hop-')
  check('ทุก image ภายนอกระบุรุ่น (ไม่ใช้ :latest)', images.filter((i) => !ours(i)).every((i) => /:[\w.-]+$/.test(i) && !i.endsWith(':latest')), images.join(', '))

  // image ของ HOP: CI build (ARM64) → เครื่อง pull ตาม commit ที่ checkout อยู่ (ไม่ build บนเครื่อง — แรมไม่พอ)
  const wf = read('.github/workflows/deploy-images.yml')
  const deploySh = read('deploy/deploy.sh')
  check('compose ใช้ image hop-api / hop-web จาก ghcr ตามแท็ก HOP_TAG (ไม่มีค่าเริ่มที่อาจไม่มีอยู่จริง)',
    /image: ghcr\.io\/itsaraphapthanatka\/hop-api:\$\{HOP_TAG:\?/.test(compose) && /image: ghcr\.io\/itsaraphapthanatka\/hop-web:\$\{HOP_TAG:\?/.test(compose))
  const composeBuild = read('deploy/docker-compose.build.yml')
  check('compose หลักไม่มีส่วน build (คำสั่ง compose ใดๆ ไม่ build บนเครื่องเอง — แรมไม่พอ)', !/^\s+build:/m.test(compose))
  check('build เองได้ผ่านไฟล์แยก docker-compose.build.yml (deploy.sh --build)', /api:\s*\n\s+build:/.test(composeBuild) && /web:\s*\n\s+build:/.test(composeBuild) && deploySh.includes('-f docker-compose.build.yml'))
  check('deploy.sh จดแท็กที่ deploy ลง .env (คำสั่ง compose ที่พิมพ์เองใช้ image เดียวกัน)', /echo "HOP_TAG=\$HOP_TAG"/.test(deploySh) && /chmod 600 \.env/.test(deploySh))
  check('CI build บน runner ARM64 แบบ native', /runs-on: ubuntu-24\.04-arm/.test(wf) && (wf.match(/platforms: linux\/arm64/g) || []).length === 2)
  check('CI ติดแท็ก commit sha ให้ทั้งสอง image (deploy.sh ดึงตาม commit)',
    wf.includes('/hop-api:${{ github.sha }}') && wf.includes('/hop-web:${{ github.sha }}') && /HOP_TAG="\$GIT_SHA"/.test(deploySh))
  check('CI build ทุก commit ของ main + deploy/edgexpert (ไม่ข้ามไฟล์ใด ไม่งั้น deploy.sh รอ image ไม่มีวันมา)',
    /branches: \[main, deploy\/edgexpert\]/.test(wf) && !/paths(-ignore)?:/.test(wf))
  check('CI ใช้แค่ GITHUB_TOKEN (ไม่มี secret อื่น)', [...wf.matchAll(/secrets\.(\w+)/g)].every((m) => m[1] === 'GITHUB_TOKEN'))
  check('CI ส่ง GIT_SHA ให้ web (buildId ของ live-update ตรง commit)', wf.includes('GIT_SHA=${{ github.sha }}'))
  check('deploy.sh รันด้วย image ที่ pull มา ไม่ build เอง (เว้นสั่ง --build)', deploySh.includes('up -d --no-build') && deploySh.includes('--build) MODE=build'))

  const dockerignore = read('.dockerignore')
  for (const p of ['.env', '.env.*', '.git', '.claude', 'node_modules', 'dist', 'docs/COSTS.html', 'docs/COSTS.md'])
    check(`.dockerignore ตัด ${p}`, dockerignore.split('\n').includes(p))
  check('.dockerignore ไม่ตัด android/app/build.gradle (update-zip อ่าน versionName)', !/^android\/?$|^android\/\*\*?$|^android\/app\/?$/m.test(dockerignore))
  check('deploy/.env อยู่ใน .gitignore', spawnSync('git', ['check-ignore', '-q', 'deploy/.env']).status === 0)

  check('ไฟล์สำรอง deploy/.env.bak-* ไม่เข้า git', spawnSync('git', ['check-ignore', '-q', 'deploy/.env.bak-20261019-120000']).status === 0)
  check('deploy/.env.example ยังอยู่ใน git', spawnSync('git', ['check-ignore', '-q', 'deploy/.env.example']).status !== 0)

  // นำเข้า env จาก Vercel (deploy/import-vercel-env.sh → vercel-env-to-compose.mjs)
  const { convert, BOX_ONLY } = await import('../deploy/vercel-env-to-compose.mjs')
  const fakeVercel = [
    '# Created by Vercel CLI', 'VERCEL="1"', 'VERCEL_ENV="production"',
    'STRIPE_SECRET_KEY="fake_value"', 'SUPABASE_SERVICE_ROLE_KEY=""', 'SMTP_PASS="a$b$c"',
    'FCM_SERVICE_ACCOUNT="{"type":"service_account","private_key":"-----BEGIN-----\\nAAA\\n-----END-----\\n"}"', // \\n = แบ็กสแลช+n ตรงตัวแบบที่ Vercel เขียน
    'AI_MODEL="it\'s"', 'PUBLIC_APP_URL="https://hob-alpha.vercel.app"', 'ENABLE_CRON="1"',
    'AI_API_KEY="[SENSITIVE]"', // Vercel CLI ≥ 64 คืนข้อความนี้แทนค่าจริงของตัวแปร Sensitive
  ].join('\n')
  const conv = convert(fakeVercel, envExample)
  const line = (k) => conv.lines.find((l) => l.startsWith(`${k}=`))
  check('นำเข้า: ครอบ \'...\' (compose ไม่แปล $)', line('SMTP_PASS') === "SMTP_PASS='a$b$c'")
  check('นำเข้า: JSON ของ FCM คง \\n ตรงตัว (JSON.parse แล้วได้ private_key หลายบรรทัด)', (() => {
    const v = line('FCM_SERVICE_ACCOUNT')?.slice('FCM_SERVICE_ACCOUNT='.length + 1, -1)
    try { return JSON.parse(v).private_key.split('\n').length === 4 } catch { return false }
  })())
  check('นำเข้า: ค่าว่าง (Sensitive) ไม่ทับค่าที่กรอกเองบนเครื่อง', conv.empty.includes('SUPABASE_SERVICE_ROLE_KEY') && !line('SUPABASE_SERVICE_ROLE_KEY'))
  check('นำเข้า: "[SENSITIVE]" จาก Vercel CLI รุ่นใหม่ ไม่ทับค่าบนเครื่อง', conv.empty.includes('AI_API_KEY') && !line('AI_API_KEY'))
  const allSensitive = convert('A="[SENSITIVE]"\nSTRIPE_SECRET_KEY="[SENSITIVE]"\nVITE_SUPABASE_URL="[SENSITIVE]"', envExample)
  check('นำเข้า: ถ้าทุกค่าเป็น [SENSITIVE] → ไม่มีบรรทัดส่งไปเครื่องเลย (สคริปต์หยุดก่อน ssh)', allSensitive.lines.length === 0)
  check('นำเข้า: ค่าที่มี \' ให้กรอกเอง (ครอบ \'...\' ไม่ได้)', conv.manual.includes('AI_MODEL') && !line('AI_MODEL'))
  check('นำเข้า: ไม่ทับค่าของเครื่อง (PUBLIC_APP_URL, ENABLE_CRON ฯลฯ)', !line('PUBLIC_APP_URL') && !line('ENABLE_CRON') && BOX_ONLY.has('WEB_PORT'))
  check('นำเข้า: ไม่ลาก VERCEL_* มาด้วย', !conv.lines.some((l) => l.startsWith('VERCEL')))
  const importSh = read('deploy/import-vercel-env.sh')
  check('import-vercel-env.sh ไม่พิมพ์ค่าออกจอ (ไม่มี cat ไฟล์ env มาที่ stdout)', !/cat "\$TMP\/(vercel|import)\.env"(?!\s*>)/.test(importSh) && /trap 'rm -rf "\$TMP"' EXIT/.test(importSh))
  check('import-vercel-env.sh ส่งค่าผ่าน stdin ของ ssh (ไม่ใส่ในคำสั่ง — คนอื่นในเครื่องเห็นผ่าน ps ได้)', /ssh "\$HOST" "\$REMOTE" < "\$TMP\/import\.env"/.test(importSh))
  const setSh = read('deploy/set-remote-env.sh'), mergeSh = read('deploy/merge-env.remote.sh')
  check('set-remote-env.sh พิมพ์ค่าแบบซ่อน (read -s) และไม่ echo ค่าออกจอ', /read -r -s/.test(setSh) && !/echo[^\n]*\$VAL/.test(setSh))
  check('set-remote-env.sh ส่งค่าทาง stdin ของ ssh (printf builtin → ไม่โผล่ใน ps)', /printf "%s='%s'\\n" "\$KEY" "\$VAL" \| ssh "\$HOST"/.test(setSh))
  check('set-remote-env.sh / import ใช้ตัวรวม .env ตัวเดียวกัน (merge-env.remote.sh)', setSh.includes('deploy/merge-env.remote.sh') && importSh.includes('deploy/merge-env.remote.sh'))
  check('merge-env: สำรองก่อนแก้ + สิทธิ์ 600 + เก็บสำรองแค่ 5 ไฟล์ล่าสุด', /cp \.env "\$BAK" && chmod 600 "\$BAK"/.test(mergeSh) && /chmod 600 \.env/.test(mergeSh) && /tail -n \+6/.test(mergeSh))
  check('merge-env: บอกแค่ชื่อค่าที่เปลี่ยน ไม่พิมพ์ค่า', /cut -d= -f1 \.env\.import/.test(mergeSh) && !/cat \.env/.test(mergeSh))

  // cron: เครื่องใหม่ต้องยิงเวลาเดียวกับ Vercel และตัวส่งต่อห้ามมี cron (แจ้งเตือนซ้ำ)
  const serverSrc = read('server/index.mjs')
  for (const c of vercel.crons || []) {
    check(`cron ${c.path} (${c.schedule}) มีในตัวตั้งเวลาของ server`, c.schedule === '0 0 * * *' && serverSrc.includes(c.path) && serverSrc.includes('scheduleDailyUtc(0,'))
  }
  const maxDur = Math.max(...Object.values(vercel.functions || {}).map((f) => f.maxDuration || 10))
  check(`Caddy รอ API ได้นานกว่า maxDuration บน Vercel (${maxDur}s)`, Number(/response_header_timeout (\d+)s/.exec(caddyfile)?.[1]) >= maxDur)
  check('server รอ request ได้นานกว่า maxDuration', Number(/requestTimeout = ([\d_]+)/.exec(serverSrc)?.[1].replaceAll('_', '')) >= maxDur * 1000)

  const fwd = JSON.parse(read('deploy/vercel-forwarder/vercel.json'))
  check('ตัวส่งต่อ Vercel ไม่มี crons', !fwd.crons)
  const fwdRe = new RegExp('^' + fwd.redirects[0].source + '$')
  check('ตัวส่งต่อ: หน้าเว็บ redirect ถาวร (308)', fwd.redirects[0].permanent === true && fwdRe.test('/') && fwdRe.test('/guide.html') && fwdRe.test('/docs/training'))
  check('ตัวส่งต่อ: /api/* และ app-update.* ไม่ถูก redirect (POST จากแอปเก่าไม่หาย)', !fwdRe.test('/api/stripe') && !fwdRe.test('/app-update.json') && !fwdRe.test('/app-update.zip'))
  check('ตัวส่งต่อ: proxy /api/* + app-update.* ไป hopai.online',
    ['/api/:path*', '/app-update.json', '/app-update.zip'].every((s) => fwd.rewrites.some((x) => x.source === s && x.destination.startsWith('https://hopai.online/'))))
  check('ตัวส่งต่อ: ไม่มีโฟลเดอร์ api (Vercel จะรันฟังก์ชันเองแทนการส่งต่อ)', !fs.existsSync('deploy/vercel-forwarder/api'))

  // โดเมนใหม่
  const native = read('src/lib/native.ts')
  check('แอปมือถือ (bundle ใหม่) เรียก API ที่ hopai.online', /isNativeApp \? 'https:\/\/hopai\.online' : ''/.test(native) && !/'https:\/\/hob-alpha\.vercel\.app'/.test(native))
  check('ลิงก์เชิญลูกทีมใช้ hopai.online เป็นค่าเริ่มต้น', read('api/send-invite.js').includes("|| 'https://hopai.online'"))
  check('APK ใหม่ build ชี้ hopai.online', /VITE_API_BASE: https:\/\/hopai\.online\s*$/m.test(read('.github/workflows/android-apk.yml')))
  check('Vercel Analytics โหลดเฉพาะบนโดเมน vercel.app', /vercel\.app/.test(read('src/main.tsx')))
} finally {
  for (const c of children) c.kill('SIGTERM')
  fs.rmSync(tmp, { recursive: true, force: true })
}

const failed = results.filter((x) => !x.ok)
for (const x of results) console.log(`${x.ok ? '✅' : '❌'} ${x.name}${!x.ok && x.extra ? `  — ${x.extra}` : ''}`)
console.log(`\n${results.length - failed.length}/${results.length} ผ่าน`)
process.exit(failed.length ? 1 : 0)
