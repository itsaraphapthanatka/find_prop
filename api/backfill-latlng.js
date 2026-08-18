// Vercel Serverless Function — เติมพิกัด lat/lng ให้ทรัพย์ที่ยังไม่มี จากลิงก์แผนที่ (map_url)
//
// ทำไมต้องทำที่เซิร์ฟเวอร์: map_url ส่วนใหญ่เป็น "ลิงก์ย่อ" (maps.app.goo.gl) ที่ในตัวลิงก์
//   ไม่มีตัวเลขพิกัด ต้องยิง HTTP ตามลิงก์ไปกางเป็น URL เต็มก่อน (browser ทำข้ามโดเมนไม่ได้ + CORS)
//   และการกางต้องใช้ UA ที่ไม่ใช่เบราว์เซอร์ ไม่งั้น Google เสิร์ฟหน้า app-deeplink แทน 302 (ดู _lib/latlng.js)
//
// สิทธิ์: เฉพาะ super admin (เครื่องมือดูแลข้อมูล) · สวมสิทธิ์องค์กร = องค์กรนั้น · ภาพรวม = ทุกองค์กร
// ทำเป็นชุด (cursor + งบเวลา) client วนเรียกจนจบ · แตะเฉพาะแถวที่ยังไม่มีพิกัด (idempotent)

import { resolveToLatLng, round6 } from './_lib/latlng.js'

const DB_LIMIT = 10
const TIME_BUDGET_MS = 9000

export default async function handler(req, res) {
  const ALLOWED_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost:5173']
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel Environment Variables' })
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })
  const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  // ── ยืนยัน super admin → org เป้าหมาย (สวมสิทธิ์ = องค์กรนั้น · ไม่สวม = ทุกองค์กร) ──
  let uid
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    if (!u.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง — เข้าสู่ระบบใหม่' })
    uid = (await u.json())?.id
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }
  if (!uid) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง' })

  let orgId
  try {
    const pRes = await fetch(
      `${url}/rest/v1/profiles?id=eq.${uid}&select=is_super,impersonate_org_id`,
      { headers: svc },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    if (!prof?.is_super) {
      return res.status(403).json({ error: 'เฉพาะ super admin เท่านั้นที่เติมพิกัดได้' })
    }
    orgId = prof?.impersonate_org_id || null
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }

  // ── ดึงทรัพย์ที่ "ยังไม่มีพิกัด" แต่มี map_url (cursor เดินหน้าตาม id) ──
  const after = String((req.body || {}).after || '')
  const cursor = after ? `&id=gt.${encodeURIComponent(after)}` : ''
  const orgFilter = orgId ? `org_id=eq.${orgId}&` : ''
  let rows
  try {
    const r = await fetch(
      `${url}/rest/v1/properties?${orgFilter}or=(lat.is.null,lng.is.null)&map_url=not.is.null${cursor}`
      + `&order=id.asc&limit=${DB_LIMIT}&select=id,map_url`,
      { headers: svc },
    )
    if (!r.ok) return res.status(502).json({ error: `อ่านรายการทรัพย์ไม่สำเร็จ (${r.status})` })
    rows = (await r.json().catch(() => [])) || []
  } catch {
    return res.status(502).json({ error: 'อ่านรายการทรัพย์ไม่สำเร็จ' })
  }

  const start = Date.now()
  let scanned = 0, filled = 0, unresolved = 0
  let nextAfter = after

  // แกะพิกัด (ยิง redirect) พร้อมกันทั้งชุด แล้วค่อยอัปเดตทีละแถว
  const resolved = await Promise.all(rows.map(async (row) => {
    const coord = await resolveToLatLng(row.map_url).catch(() => null)
    return { id: row.id, coord }
  }))

  for (const { id, coord } of resolved) {
    // งบเวลา: อัปเดตเท่าที่ทัน แล้วให้ client เรียกต่อจาก nextAfter
    if (scanned > 0 && Date.now() - start > TIME_BUDGET_MS) break
    scanned++
    nextAfter = id
    if (!coord) { unresolved++; continue }
    const { lat, lng } = round6(coord)
    const up = await fetch(`${url}/rest/v1/properties?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ lat, lng }),
    })
    if (up.ok) filled++
    else unresolved++
  }

  const done = scanned >= rows.length && rows.length < DB_LIMIT
  return res.status(200).json({ done, next_after: nextAfter, scanned, filled, unresolved })
}
