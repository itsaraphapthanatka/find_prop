// เซิร์ฟเวอร์ API สำหรับรันนอก Vercel (เครื่อง msi-edgexpert-04dc) — โหลด handler เดิมใน api/*.js โดยไม่ต้องแก้โค้ด
//
// เลียนแบบ helper ของ Vercel Node runtime ที่ handler ใช้อยู่:
//   req.query · req.body (JSON / form / ข้อความ) · res.status() · res.json() · res.send() · res.redirect()
// handler ที่ export `config = { api: { bodyParser: false } }` (stripe-webhook) ได้ stream ดิบ ไปอ่าน raw body เอง
// แทน Vercel Cron: ยิง /api/push-cron ทุกวัน 00:00 UTC (07:00 เวลาไทย) พร้อม Bearer CRON_SECRET — ตรงกับ vercel.json
//
// รัน: node server/index.mjs (PORT ค่าเริ่ม 3000) · health check: GET /healthz

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = process.env.HOP_API_DIR || path.join(ROOT, 'api')
const PORT = Number(process.env.PORT || 3000)
const BODY_LIMIT = 12 * 1024 * 1024 // เผื่อรูปจากผู้ช่วย AI (Vercel จำกัดราว 4.5MB)
// ที่เก็บข้อมูลถาวรของเซิร์ฟเวอร์ — ในคอนเทนเนอร์คือ /app/data (volume hop-data ใน docker-compose.yml)
const DATA_DIR = process.env.HOP_DATA_DIR || path.join(ROOT, 'data')

// ── โหลด handler (แคชไว้หลังโหลดครั้งแรก) ──
const handlers = new Map()
async function loadHandler(name) {
  // อนุญาตเฉพาะชื่อไฟล์ระดับบนสุดของ api/ — กัน ../ และไม่เปิด api/_lib/* เป็น endpoint (เหมือน Vercel)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return null
  if (handlers.has(name)) return handlers.get(name)
  const file = path.join(API_DIR, `${name}.js`)
  if (!fs.existsSync(file)) return null
  const mod = await import(pathToFileURL(file).href)
  const h = { fn: mod.default, config: mod.config || {} }
  handlers.set(name, h)
  return h
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > BODY_LIMIT) { reject(Object.assign(new Error('Request body too large'), { status: 413 })); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseBody(buf, contentType) {
  if (!buf.length) return undefined
  const type = String(contentType || '').split(';')[0].trim().toLowerCase()
  const text = buf.toString('utf8')
  if (type === 'application/json' || type.endsWith('+json')) {
    try { return JSON.parse(text) } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }) }
  }
  if (type === 'application/x-www-form-urlencoded') return Object.fromEntries(new URLSearchParams(text))
  if (type.startsWith('text/')) return text
  return buf
}

function enhance(req, res, url) {
  req.query = Object.fromEntries(url.searchParams)
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
    return res
  }
  res.send = (body) => {
    if (body === undefined || body === null) { res.end(); return res }
    if (Buffer.isBuffer(body)) { res.end(body); return res }
    if (typeof body === 'object') return res.json(body)
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(String(body))
    return res
  }
  res.redirect = (a, b) => {
    const [code, location] = typeof a === 'number' ? [a, b] : [307, a]
    res.statusCode = code
    res.setHeader('location', location)
    res.end()
    return res
  }
}

// สถานะตัวตั้งเวลา — โชว์ใน /healthz ให้ตรวจจากข้างนอกได้ว่ารอบล่าสุดยิงสำเร็จไหม
// ไม่มีข้อมูลส่วนตัว: แค่เวลา สถานะ และจำนวนที่ส่ง
// ผลแต่ละรอบเก็บลงดิสก์ (DATA_DIR/cron-state.json) — เดิมอยู่ในหน่วยความจำ deploy ทีไรหายหมด
// (2026-11-16: ดูผลรอบ 15–16 พ.ย. ย้อนหลังไม่ได้เพราะ deploy ทับ) · history = 14 รอบล่าสุด ใหม่สุดก่อน
// disk = 'ok' | ข้อความ error — ตรวจได้ทันทีหลัง deploy ว่า volume เขียนได้ ไม่ต้องรอรอบ 07:00
export const cron = { enabled: false, next: null, last: null, history: [], disk: null }
const CRON_FILE = path.join(DATA_DIR, 'cron-state.json')
const CRON_HISTORY = 14

function saveCronState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${CRON_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify({ last: cron.last, history: cron.history }))
    fs.renameSync(tmp, CRON_FILE) // เขียนไฟล์ชั่วคราวแล้วสลับ — ไฟล์ไม่ขาดครึ่งถ้าดับกลางทาง
    cron.disk = 'ok'
  } catch (e) {
    cron.disk = `เขียนไม่ได้: ${e.code || e.message}`
    console.error('[cron] บันทึกผลลงดิสก์ไม่สำเร็จ:', e.message)
  }
}

/** โหลดผลรอบก่อนๆ จากดิสก์ แล้วเขียนกลับหนึ่งครั้งเพื่อเช็คว่า volume เขียนได้ (ผลอยู่ใน cron.disk) */
export function loadCronState() {
  try {
    const s = JSON.parse(fs.readFileSync(CRON_FILE, 'utf8'))
    cron.last = s?.last ?? null
    cron.history = Array.isArray(s?.history) ? s.history.slice(0, CRON_HISTORY) : []
  } catch { /* ยังไม่มีไฟล์ (ครั้งแรก) หรือไฟล์เสีย — เริ่มว่าง */ }
  saveCronState()
}

/** บันทึกผลรอบล่าสุด (หน่วยความจำ + ดิสก์) */
export function recordCronRun(entry) {
  cron.last = entry
  cron.history = [entry, ...cron.history].slice(0, CRON_HISTORY)
  saveCronState()
}

const sendJson = (res, status, obj) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

export const server = http.createServer(async (req, res) => {
  const t0 = Date.now()
  const url = new URL(req.url || '/', 'http://localhost')
  res.on('finish', () => {
    // บันทึกแค่ method/path/สถานะ/เวลา — ไม่บันทึก body หรือ header (มีข้อมูลส่วนตัว/โทเคน)
    if (url.pathname !== '/healthz') console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`)
  })

  if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()), cron })

  const m = /^\/api\/([^/]+?)\/?$/.exec(url.pathname)
  if (!m) return sendJson(res, 404, { error: 'Not found' })

  let h
  try { h = await loadHandler(decodeURIComponent(m[1])) } catch (e) {
    console.error(`[api/${m[1]}] โหลดไม่สำเร็จ:`, e)
    return sendJson(res, 500, { error: 'Internal Server Error' })
  }
  if (!h || typeof h.fn !== 'function') return sendJson(res, 404, { error: 'Not found' })

  enhance(req, res, url)
  try {
    if (h.config?.api?.bodyParser !== false && req.method !== 'GET' && req.method !== 'HEAD') {
      req.body = parseBody(await readBody(req), req.headers['content-type'])
    }
    await h.fn(req, res)
  } catch (e) {
    console.error(`[api/${m[1]}]`, e)
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : 'Internal Server Error' })
    else res.end()
  }
})

// ── แทน Vercel Cron: /api/push-cron ทุกวัน 00:00 UTC ──
function scheduleDailyUtc(hour, job) {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  cron.next = next.toISOString()
  setTimeout(async () => {
    try { await job() } catch (e) {
      recordCronRun({ at: new Date().toISOString(), status: 0, error: true })
      console.error('[cron]', e)
    }
    scheduleDailyUtc(hour, job)
  }, next - now).unref()
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  server.requestTimeout = 120_000 // AI/cron เคยตั้ง maxDuration 60s บน Vercel — เผื่อไว้สองเท่า
  server.listen(PORT, () => console.log(`HOP API พร้อมที่พอร์ต ${PORT} (api: ${API_DIR})`))
  if (process.env.CRON_SECRET && process.env.ENABLE_CRON !== '0') {
    cron.enabled = true
    loadCronState()
    scheduleDailyUtc(0, async () => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/push-cron`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
      const out = await r.json().catch(() => ({}))
      recordCronRun({ at: new Date().toISOString(), status: r.status, sent: out.sent ?? null, jobs: out.jobs ?? null })
      console.log('[cron] push-cron', r.status, `sent=${out.sent ?? '-'} jobs=${out.jobs ?? '-'}`)
    })
    console.log('ตั้งเวลา push-cron ทุกวัน 00:00 UTC (07:00 เวลาไทย) แล้ว')
  }
  const stop = () => { console.log('กำลังปิดเซิร์ฟเวอร์…'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10_000).unref() }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
