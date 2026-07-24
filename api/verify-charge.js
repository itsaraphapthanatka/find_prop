// Vercel Serverless Function — ยืนยันการชำระเงินกับ PunPay แล้วอัปเกรดแพ็กเกจ
//
// ปลอดภัย: อัปเกรด "ก็ต่อเมื่อ" ถาม PunPay ตรงๆ (ด้วย secret key) แล้วได้ว่าจ่ายจริง
//   • ไม่เชื่อ client ว่า "จ่ายแล้ว"
//   • ตรวจว่า charge เป็นขององค์กรผู้เรียก (metadata.org_id) + ยอด/แพ็กเกจตรงกับที่คำนวณเอง
//   • อัปเกรดผ่าน RPC apply_payment (service-role) — กันอัปเกรดซ้ำด้วย charge_id (idempotent)

const PRICES = { starter: 990, pro: 1290 }
const YEARLY_DISCOUNT = 0.15
const PAID_STATUSES = ['paid', 'succeeded', 'success', 'completed', 'complete']

function expectedAmount(plan, cycle) {
  // 🧪 แพ็กเกจทดสอบ ฿1 — ต้องตรงกับ quote() ใน create-charge · ⚠️ ลบก่อนเปิดใช้จริง!
  if (plan === 'test') return 1
  if (!PRICES[plan] || !['monthly', 'yearly'].includes(cycle)) return null
  // โหมดทดสอบชั่วคราว: ต้องตรงกับ create-charge — ⚠️ ลบ env PUNPAY_TEST_AMOUNT ก่อนขึ้นจริง
  const testAmt = Number(process.env.PUNPAY_TEST_AMOUNT)
  if (testAmt > 0) return testAmt
  return cycle === 'yearly' ? Math.round(PRICES[plan] * 12 * (1 - YEARLY_DISCOUNT)) : PRICES[plan]
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

  const secretKey = process.env.PUNPAY_SECRET_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supaUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!secretKey || !serviceKey || !supaUrl || !anonKey) {
    return res.status(500).json({ error: 'ตั้ง env ไม่ครบ (PUNPAY_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL/ANON_KEY)' })
  }
  const punpayBase = (process.env.PUNPAY_BASE_URL || 'https://punpay.petgo.asia').replace(/\/+$/, '')

  // ── ตรวจผู้ใช้ + องค์กร (แอดมิน active) ──
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })
  const userAuth = { apikey: anonKey, Authorization: `Bearer ${token}` }
  let uid
  try {
    const uRes = await fetch(`${supaUrl}/auth/v1/user`, { headers: userAuth })
    if (!uRes.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง' })
    uid = (await uRes.json())?.id
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }
  let orgId
  try {
    const pRes = await fetch(
      `${supaUrl}/rest/v1/profiles?id=eq.${uid}&select=role,org_id,is_super,impersonate_org_id,active`,
      { headers: userAuth },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    orgId = (prof?.is_super ? prof?.impersonate_org_id : null) || prof?.org_id
    const isAdmin = (prof?.role === 'admin' && prof?.active === true) || Boolean(prof?.is_super && prof?.impersonate_org_id)
    if (!orgId || !isAdmin) return res.status(403).json({ error: 'เฉพาะแอดมินขององค์กรเท่านั้น' })
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }

  const chargeId = (req.body || {}).charge_id
  if (!chargeId) return res.status(400).json({ error: 'ต้องระบุ charge_id' })

  // ── ถาม PunPay ว่า charge นี้จ่ายแล้วหรือยัง (แหล่งความจริง) ──
  let charge
  try {
    const cRes = await fetch(`${punpayBase}/api/v1/charges/${encodeURIComponent(chargeId)}`, {
      headers: { 'x-api-key': secretKey },
    })
    charge = await cRes.json().catch(() => null)
    if (!cRes.ok || !charge?.id) {
      return res.status(502).json({ error: 'ตรวจสอบรายการกับ PunPay ไม่สำเร็จ', detail: `HTTP ${cRes.status}` })
    }
  } catch {
    return res.status(502).json({ error: 'เชื่อมต่อ PunPay ไม่สำเร็จ' })
  }

  const paid = Boolean(charge.paid_at) || PAID_STATUSES.includes(String(charge.status || '').toLowerCase())
  if (!paid) {
    return res.status(200).json({ paid: false, status: charge.status || 'pending' })
  }

  // ── charge ต้องเป็นขององค์กรนี้ + แพ็กเกจ/ยอดตรงกับที่เราคำนวณ ──
  const meta = charge.metadata || {}
  const plan = meta.plan
  const cycle = meta.cycle
  const months = Number(meta.months)
  if (meta.org_id !== orgId) {
    return res.status(403).json({ error: 'รายการนี้ไม่ใช่ขององค์กรคุณ' })
  }
  const want = expectedAmount(plan, cycle)
  if (want === null || Number(charge.amount) !== want || ![1, 12].includes(months)) {
    return res.status(400).json({ error: 'ข้อมูลแพ็กเกจ/ยอดเงินไม่ถูกต้อง' })
  }

  // ── อัปเกรด (idempotent ด้วย charge_id) ผ่าน RPC service-role ──
  // แพ็กเกจทดสอบ ฿1 → ให้สิทธิ์ 'starter' จริงๆ (จะได้ทดสอบ gating ครบวงจร)
  const applyPlan = plan === 'test' ? 'starter' : plan
  try {
    const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
    const rpc = await fetch(`${supaUrl}/rest/v1/rpc/apply_payment`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({ p_charge_id: chargeId, p_org: orgId, p_plan: applyPlan, p_months: months, p_amount: want }),
    })
    const out = await rpc.json().catch(() => null)
    if (!rpc.ok) {
      return res.status(502).json({ error: 'อัปเกรดไม่สำเร็จ', detail: out?.message || `HTTP ${rpc.status}` })
    }
    const row = Array.isArray(out) ? out[0] : out
    return res.status(200).json({
      paid: true,
      plan: applyPlan,
      applied: row?.applied ?? false, // false = charge นี้เคยอัปเกรดไปแล้ว (กันซ้ำ)
      expires: row?.expires ?? null,
    })
  } catch {
    return res.status(502).json({ error: 'อัปเกรดไม่สำเร็จ (เชื่อมต่อฐานข้อมูล)' })
  }
}
