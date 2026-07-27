// Vercel Serverless Function — สร้างรายการชำระเงิน (charge) กับ PunPay
//
// ความปลอดภัย (สำคัญมาก เพราะเกี่ยวกับเงิน):
//  1) PUNPAY_SECRET_KEY อยู่ใน env ฝั่งเซิร์ฟเวอร์เท่านั้น — client ไม่มีทางเห็น
//  2) จำนวนเงินคำนวณ "ฝั่งเซิร์ฟเวอร์" จาก (plan, cycle) เท่านั้น
//     ❌ ห้ามเชื่อ amount ที่ client ส่งมา (ไม่งั้นจ่าย ฿1 ได้ Pro)
//  3) เฉพาะ "แอดมินที่ active" ขององค์กร ถึงจะสร้าง charge ให้องค์กรตัวเองได้
//  4) การ "อัปเกรดแพ็กเกจ" ไม่ได้ทำที่นี่ — ทำใน api/verify-charge.js ก็ต่อเมื่อ
//     ยืนยันกับ PunPay แล้วว่าจ่ายจริง (กัน client โกหกว่าจ่ายแล้ว)
//
// ราคาอ่านจากตาราง plan_prices (super admin ตั้งเอง) — fallback ราคามาตรฐานใน api/_lib/prices.js

import { fetchPlanPrices, TIERS } from './_lib/prices.js'
import { paymentTestEnabled } from './_lib/settings.js'

// คืนยอดเงิน (บาท) + จำนวนเดือน จาก (plan, tier, cycle, ราคาจาก DB) — ไม่รู้จัก = null
function quote(plan, tier, cycle, prices) {
  // 🧪 แพ็กเกจทดสอบ ฿1 — จ่ายจริงผ่าน PromptPay ยอดต่ำสุด แล้วได้สิทธิ์ Basic ระดับ 100 หนึ่งเดือน
  // เปิด-ปิดจากหน้า Super Admin (app_settings 'payment_test') — เช็คใน handler ก่อนถึงตรงนี้
  if (plan === 'test') return { amount: 1, months: 1 }
  const p = prices[plan]?.[tier]
  if (!p) return null
  let out
  if (cycle === 'monthly') out = { amount: p.monthly, months: 1 }
  else if (cycle === 'yearly') out = { amount: p.yearly, months: 12 }
  else return null
  // โหมดทดสอบชั่วคราว: ตั้ง env PUNPAY_TEST_AMOUNT (เช่น 1) → บังคับยอดเป็นค่านั้น · ⚠️ ลบ env นี้ก่อนขึ้นจริง!
  const testAmt = Number(process.env.PUNPAY_TEST_AMOUNT)
  if (testAmt > 0) out.amount = testAmt
  return out
}

export default async function handler(req, res) {
  // ── CORS (ให้แอปมือถือ/dev เรียกข้ามโดเมนได้ — ความปลอดภัยจริงอยู่ที่ token ด้านล่าง) ──
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

  // ── env ──
  const secretKey = process.env.PUNPAY_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า PUNPAY_SECRET_KEY ใน Vercel Environment Variables' })
  }
  const punpayBase = (process.env.PUNPAY_BASE_URL || 'https://punpay.petgo.asia').replace(/\/+$/, '')
  const accountId = process.env.PUNPAY_ACCOUNT_ID || null // บัญชีรับเงิน (ถ้า punpay ต้องระบุ)

  const supaUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!supaUrl || !anonKey || !token) {
    return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' })
  }
  const userAuth = { apikey: anonKey, Authorization: `Bearer ${token}` }

  // ── ตรวจว่าเป็นผู้ใช้ที่ล็อกอินจริง ──
  let uid
  try {
    const uRes = await fetch(`${supaUrl}/auth/v1/user`, { headers: userAuth })
    if (!uRes.ok) return res.status(401).json({ error: 'เซสชันไม่ถูกต้อง — กรุณาเข้าสู่ระบบใหม่' })
    uid = (await uRes.json())?.id
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบเซสชันไม่สำเร็จ' })
  }

  // ── ต้องเป็นแอดมินที่ active ขององค์กร (super โหมดสวมสิทธิ์ก็ได้) ──
  let orgId
  try {
    const pRes = await fetch(
      `${supaUrl}/rest/v1/profiles?id=eq.${uid}&select=role,org_id,is_super,impersonate_org_id,active`,
      { headers: userAuth },
    )
    const prof = ((await pRes.json().catch(() => [])) || [])[0]
    orgId = (prof?.is_super ? prof?.impersonate_org_id : null) || prof?.org_id
    const isAdmin = (prof?.role === 'admin' && prof?.active === true) || Boolean(prof?.is_super && prof?.impersonate_org_id)
    if (!orgId || !isAdmin) {
      return res.status(403).json({ error: 'เฉพาะแอดมินขององค์กรเท่านั้นที่ทำรายการชำระเงินได้' })
    }
  } catch {
    return res.status(502).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' })
  }

  // ── รับ plan/tier/cycle จาก client แล้วคำนวณยอดเอง (ไม่รับ amount จาก client) ──
  const { plan, cycle } = req.body || {}
  // ระดับ = โควตาทรัพย์ (100/250/500) · test = ระดับ 100 เสมอ
  const tier = plan === 'test' ? 100 : Number((req.body || {}).tier)
  if (plan !== 'test' && !TIERS.includes(tier)) {
    return res.status(400).json({ error: 'ระดับแพ็กเกจไม่ถูกต้อง (tier: 100|250|500) — ทรัพย์เกิน 500 ติดต่อทีมงาน' })
  }
  // แพ็กเกจทดสอบ ฿1 สร้างได้เฉพาะตอนสวิตช์เปิด (super admin ควบคุม) — ปิด = ปฏิเสธตั้งแต่สร้าง
  if (plan === 'test' && !(await paymentTestEnabled(supaUrl, anonKey))) {
    return res.status(400).json({ error: 'โหมดทดสอบระบบชำระเงินถูกปิดอยู่' })
  }
  const prices = await fetchPlanPrices(supaUrl, anonKey)
  const q = quote(plan, tier, cycle, prices)
  if (!q) {
    return res.status(400).json({ error: 'plan/cycle ไม่ถูกต้อง (plan: starter|pro|test, cycle: monthly|yearly)' })
  }

  // reference ไม่ซ้ำ ใช้ผูก charge กับองค์กร/แพ็กเกจ (verify-charge จะอ่าน metadata)
  const reference = `hop-${orgId}-${plan}${tier}-${cycle}-${Date.now()}`
  const body = {
    amount: q.amount,
    description: plan === 'test'
      ? 'HOP ทดสอบระบบชำระเงิน (฿1)'
      : `HOP ${plan === 'pro' ? 'Pro' : 'Basic'} ≤${tier} ทรัพย์ (${cycle === 'yearly' ? 'รายปี' : 'รายเดือน'})`,
    reference,
    metadata: { org_id: orgId, plan, tier, cycle, months: q.months, source: 'hop' },
    expires_in: 3600, // QR หมดอายุใน 1 ชม.
    ...(accountId ? { account_id: accountId } : {}),
  }

  // ── เรียก PunPay สร้าง charge ──
  try {
    const cRes = await fetch(`${punpayBase}/api/v1/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': secretKey },
      body: JSON.stringify(body),
    })
    const charge = await cRes.json().catch(() => null)
    if (!cRes.ok || !charge?.checkout_url) {
      return res.status(502).json({
        error: 'สร้างรายการชำระเงินไม่สำเร็จ',
        detail: charge?.detail || charge?.message || `HTTP ${cRes.status}`,
      })
    }
    // ไม่คืน metadata/secret อะไรเกินจำเป็น
    return res.status(200).json({
      charge_id: charge.id,
      checkout_url: charge.checkout_url,
      amount: charge.amount,
      currency: charge.currency || 'THB',
      status: charge.status,
    })
  } catch {
    return res.status(502).json({ error: 'เชื่อมต่อ PunPay ไม่สำเร็จ' })
  }
}
