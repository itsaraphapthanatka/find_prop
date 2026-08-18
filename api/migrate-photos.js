// Vercel Serverless Function — ย้ายรูป migrated (ลิงก์ Google Drive ภายนอก) เข้าถังของระบบ
//
// ทำไมต้องทำที่เซิร์ฟเวอร์ (ไม่ใช่ที่ browser):
//  • Google Drive ไม่ส่ง CORS header → browser fetch()/canvas อ่าน bytes ไม่ได้ (ภาพ tainted)
//  • เขียนลง Storage + อัปเดตตาราง properties ทั้งองค์กร ต้องใช้ service role (ข้าม RLS)
//
// ทำอะไร: สแกนทรัพย์ในองค์กรของผู้เรียกที่ photo_url เป็นลิงก์ภายนอก (Drive) แต่ยังไม่มี photos[]
//  → โหลดรูปจาก Drive (ผ่าน endpoint รูปย่อ ที่แอปใช้แสดงอยู่แล้ว) → อัปโหลดเข้าถัง property-photos
//  → เซ็ต photos[] + photo_url เป็น URL ของถังเรา  ⇒ หลังจากนี้ลบ/จัดเรียงรูปในหน้าแก้ไขได้เต็มที่
//
// ปลอดภัย/ทำซ้ำได้: เฉพาะแอดมิน/owner (หรือ super สวมสิทธิ์) · แตะเฉพาะ org ตัวเอง ·
//   ข้ามแถวที่ย้ายแล้ว (photos ไม่ว่าง) → กดซ้ำได้ · ทำเป็นชุดตาม cursor + งบเวลา กัน timeout

const PHOTO_BUCKET = 'property-photos'
const DB_LIMIT = 6            // ดึงทรัพย์ต่อชุด (client วนเรียกจนกว่า done)
const TIME_BUDGET_MS = 8000   // หยุดเริ่มแถวใหม่เมื่อใช้เวลาเกินนี้ (กัน serverless timeout) แล้วให้ client เรียกต่อ
const MAX_IMAGES = 10         // จำนวนรูปสูงสุดต่อทรัพย์ (เท่าฟอร์ม)

// ลิงก์เดียว → Drive id (รองรับหลายรูปแบบลิงก์ที่ AppSheet ทิ้งไว้)
const DRIVE_ID = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)|[?&]id=)([-\w]{20,})/

/** แตกค่า photo_url (อาจต่อกันด้วย " | " หรือขึ้นบรรทัด) → รายการ URL สำหรับ "โหลด bytes" */
function downloadUrls(raw) {
  if (!raw) return []
  return String(raw)
    .split(/[|\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u) => {
      const m = u.match(DRIVE_ID)
      // endpoint รูปย่อของ Drive: คืน JPEG ตรงๆ (เลี่ยงหน้าสแกนไวรัสของ uc?export=download) — แอปก็ใช้ตัวนี้แสดงอยู่แล้ว
      if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`
      return /^https?:\/\//i.test(u) ? u : null
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGES)
}

function extOf(contentType) {
  if (/png/i.test(contentType)) return 'png'
  if (/webp/i.test(contentType)) return 'webp'
  if (/gif/i.test(contentType)) return 'gif'
  return 'jpg'
}

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

  // ── ยืนยันผู้เรียก = แอดมิน/owner ของ org (super สวมสิทธิ์ได้) → ได้ orgId เป้าหมาย ──
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
      `${url}/rest/v1/profiles?id=eq.${uid}&select=role,org_id,is_super,impersonate_org_id,active`,
      { headers: svc },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    orgId = (prof?.is_super ? prof?.impersonate_org_id : null) || prof?.org_id
    const isAdmin = ((prof?.role === 'owner' || prof?.role === 'admin') && prof?.active === true)
      || Boolean(prof?.is_super && prof?.impersonate_org_id)
    if (!orgId || !isAdmin) {
      return res.status(403).json({ error: 'เฉพาะแอดมินขององค์กรเท่านั้นที่ย้ายรูปเข้าระบบได้' })
    }
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }

  // ── ดึงทรัพย์ที่มี photo_url (เรียงตาม id เดินหน้าอย่างเดียว ด้วย cursor `after`) ──
  const after = String((req.body || {}).after || '')
  const cursor = after ? `&id=gt.${encodeURIComponent(after)}` : ''
  let rows
  try {
    const r = await fetch(
      `${url}/rest/v1/properties?org_id=eq.${orgId}&photo_url=not.is.null${cursor}`
      + `&order=id.asc&limit=${DB_LIMIT}&select=id,photo_url,photos`,
      { headers: svc },
    )
    if (!r.ok) return res.status(502).json({ error: `อ่านรายการทรัพย์ไม่สำเร็จ (${r.status})` })
    rows = (await r.json().catch(() => [])) || []
  } catch {
    return res.status(502).json({ error: 'อ่านรายการทรัพย์ไม่สำเร็จ' })
  }

  const start = Date.now()
  let scanned = 0, migratedRows = 0, uploadedImages = 0, skippedRows = 0, failedImages = 0
  let nextAfter = after
  let timedOut = false

  for (const row of rows) {
    // งบเวลา: ทำอย่างน้อย 1 แถวก่อน แล้วค่อยยอมหยุดกลางชุด (client เรียกต่อจาก nextAfter)
    if (scanned > 0 && Date.now() - start > TIME_BUDGET_MS) { timedOut = true; break }
    scanned++
    nextAfter = row.id

    // ข้ามแถวที่ย้ายแล้ว (photos ไม่ว่าง) → กดซ้ำได้ ไม่อัปโหลดซ้ำ
    if (Array.isArray(row.photos) && row.photos.length > 0) { skippedRows++; continue }

    const srcs = downloadUrls(row.photo_url)
    if (srcs.length === 0) { skippedRows++; continue }

    // โหลด+อัปโหลดรูปของแถวนี้พร้อมกัน (เร็วกว่าทีละใบ) — แล้วค่อยเขียน photos[] ครั้งเดียวเมื่อครบ
    const results = await Promise.all(srcs.map((src, i) => migrateOne(url, svc, orgId, row.id, i, src)))
    const urls = results.filter(Boolean)
    failedImages += results.length - urls.length
    if (urls.length === 0) { skippedRows++; continue }

    // อัปเดตแถว: photos = URL ของถังเรา · photo_url = ปก (ใบแรก)
    const up = await fetch(`${url}/rest/v1/properties?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ photos: urls, photo_url: urls[0] }),
    })
    if (up.ok) { migratedRows++; uploadedImages += urls.length }
    else { skippedRows++ }
  }

  // done = ไม่เหลือแถวให้สแกนแล้ว (ชุดสุดท้ายน้อยกว่า limit) และไม่ได้หยุดเพราะหมดเวลา
  const done = !timedOut && rows.length < DB_LIMIT
  return res.status(200).json({
    done, next_after: nextAfter,
    scanned, migrated_rows: migratedRows, uploaded_images: uploadedImages,
    skipped_rows: skippedRows, failed_images: failedImages,
  })
}

/** โหลด 1 รูปจากลิงก์ภายนอก → อัปโหลดเข้าถัง → คืน public URL (หรือ null ถ้าโหลด/อัปไม่ได้) */
async function migrateOne(url, svc, orgId, propId, idx, src) {
  try {
    const img = await fetch(src, { redirect: 'follow' })
    if (!img.ok) return null
    const ct = img.headers.get('content-type') || ''
    if (!/^image\//i.test(ct)) return null // Drive คืน HTML (ไฟล์ไม่ public) → ข้าม
    const buf = Buffer.from(await img.arrayBuffer())
    if (buf.byteLength < 512) return null // รูป placeholder "ไม่มีตัวอย่าง" ของ Drive → ถือว่าโหลดไม่ได้

    // path: migrated/{org}/{propId}/{idx}.{ext} — x-upsert กันชนตอนกดซ้ำ
    const path = `migrated/${orgId}/${propId}/${idx}.${extOf(ct)}`
    const upRes = await fetch(`${url}/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': ct, 'x-upsert': 'true', 'cache-control': '3600' },
      body: buf,
    })
    if (!upRes.ok) return null
    return `${url}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`
  } catch {
    return null
  }
}
