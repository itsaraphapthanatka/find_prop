// ตัวช่วยร่วมของ API ชำระเงิน: CORS + ยืนยันว่าผู้เรียกเป็นเจ้าขององค์กร (Owner) แล้วคืนข้อมูลองค์กร

const ALLOWED_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost:5173']

/** ตั้ง CORS ให้แอปมือถือ/dev เรียกข้ามโดเมนได้ (ความปลอดภัยจริงอยู่ที่ token) · คืน true ถ้าเป็น preflight ที่ตอบไปแล้ว */
export function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return true }
  return false
}

/** ค่า env ของ Supabase ฝั่งเซิร์ฟเวอร์ (service role ใช้เขียนข้อมูลการชำระเงิน — ข้าม RLS) */
export function supa() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) return null
  return { url, anonKey, svc: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
}

// ทั้งแถว (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ไม่ระบุคอลัมน์ เพื่อไม่ให้ทั้งระบบจ่ายเงินล่มช่วงที่ deploy โค้ดก่อนรัน SQL รุ่นใหม่
const ORG_COLS = '*'

/**
 * ยืนยันผู้เรียก = Owner ที่ active ขององค์กร (super ที่สวมสิทธิ์องค์กรนั้นก็ได้)
 * คืน { ok: true, uid, email, orgId, org, s } หรือ { ok: false, status, error }
 */
export async function requireOrgOwner(req) {
  const s = supa()
  if (!s) return { ok: false, status: 500, error: 'เซิร์ฟเวอร์ยังตั้งค่า Supabase ไม่ครบ' }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'ต้องเข้าสู่ระบบก่อน' }

  let user
  try {
    const u = await fetch(`${s.url}/auth/v1/user`, { headers: { apikey: s.anonKey, Authorization: `Bearer ${token}` } })
    if (!u.ok) return { ok: false, status: 401, error: 'เซสชันไม่ถูกต้อง — เข้าสู่ระบบใหม่' }
    user = await u.json()
  } catch {
    return { ok: false, status: 502, error: 'ตรวจสอบเซสชันไม่สำเร็จ' }
  }
  if (!user?.id) return { ok: false, status: 401, error: 'เซสชันไม่ถูกต้อง' }

  try {
    const pRes = await fetch(
      `${s.url}/rest/v1/profiles?id=eq.${user.id}&select=role,org_id,is_super,impersonate_org_id,active`,
      { headers: s.svc },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    const orgId = (prof?.is_super ? prof?.impersonate_org_id : null) || prof?.org_id
    // จัดการแพ็กเกจ/ชำระเงิน = Owner ('admin' = ชื่อบทบาทยุคก่อนแปลง roles.sql)
    const isOwner = ((prof?.role === 'owner' || prof?.role === 'admin') && prof?.active === true)
      || Boolean(prof?.is_super && prof?.impersonate_org_id)
    if (!orgId || !isOwner) {
      return { ok: false, status: 403, error: 'เฉพาะเจ้าขององค์กร (Owner) เท่านั้นที่จัดการแพ็กเกจ/ชำระเงินได้' }
    }
    const oRes = await fetch(`${s.url}/rest/v1/organizations?id=eq.${orgId}&select=${ORG_COLS}`, { headers: s.svc })
    if (!oRes.ok) {
      return { ok: false, status: 500, error: 'ยังไม่ได้ติดตั้งระบบ Stripe ในฐานข้อมูล — ให้ผู้ดูแลรัน supabase/stripe.sql' }
    }
    const org = ((await oRes.json().catch(() => [])) || [])[0]
    if (!org) return { ok: false, status: 404, error: 'ไม่พบองค์กร' }
    return { ok: true, uid: user.id, email: user.email || null, orgId, org, s }
  } catch {
    return { ok: false, status: 502, error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' }
  }
}

/**
 * แก้คอลัมน์ขององค์กรด้วย service role (ผ่าน guard เพราะเป็น service_role) — filter เพิ่มได้ เช่น '&stripe_subscription_id=eq.sub_x'
 * คืนจำนวนแถวที่ตรง filter จริง (PATCH ที่ไม่ตรงแถวไหนเลยก็ตอบ 2xx — ต้องนับเองถึงจะรู้ว่าแก้ได้จริง)
 */
export async function patchOrg(s, orgId, patch, extraFilter = '') {
  const r = await fetch(`${s.url}/rest/v1/organizations?id=eq.${orgId}${extraFilter}&select=id`, {
    method: 'PATCH',
    headers: { ...s.svc, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) throw new Error(`อัปเดตองค์กรไม่สำเร็จ (${r.status})`)
  const rows = await r.json().catch(() => null)
  return Array.isArray(rows) ? rows.length : 0
}
