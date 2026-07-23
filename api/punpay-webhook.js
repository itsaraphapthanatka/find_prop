// Vercel Serverless Function — รับ webhook จาก PunPay (ยืนยันจ่ายทันที)
//
// ความปลอดภัย 2 ชั้น:
//  1) ตรวจลายเซ็น X-Panpay-Signature = HMAC-SHA256(raw_body) ด้วย PUNPAY_WEBHOOK_SECRET
//     → ถ้าไม่ผ่าน = 401 ไม่แตะฐานข้อมูล (กัน webhook ปลอม)
//  2) ถึงลายเซ็นผ่าน ก็ยัง "ถาม PunPay ซ้ำ" (GET /v1/charges/{id}) ด้วย secret key เรา
//     เพื่อยืนยันสถานะ/ยอด/องค์กรจริง ก่อนอัปเกรด (แหล่งความจริงคือ PunPay ไม่ใช่ body)
//  → อัปเกรดผ่าน RPC apply_payment (idempotent) เหมือน verify-charge — กดซ้ำ/ยิงซ้ำไม่ต่ออายุเกิน
//
// ต้องอ่าน raw body เอง (ปิด bodyParser) เพราะ HMAC ต้องคิดจากไบต์ดิบเป๊ะๆ

import crypto from 'crypto'

export const config = { api: { bodyParser: false } }

const PRICES = { starter: 990, pro: 1290 }
const YEARLY_DISCOUNT = 0.15
const PAID_STATUSES = ['paid', 'succeeded', 'success', 'completed', 'complete']

function expectedAmount(plan, cycle) {
  if (!PRICES[plan] || !['monthly', 'yearly'].includes(cycle)) return null
  // โหมดทดสอบชั่วคราว: ต้องตรงกับ create-charge — ⚠️ ลบ env PUNPAY_TEST_AMOUNT ก่อนขึ้นจริง
  const testAmt = Number(process.env.PUNPAY_TEST_AMOUNT)
  if (testAmt > 0) return testAmt
  return cycle === 'yearly' ? Math.round(PRICES[plan] * 12 * (1 - YEARLY_DISCOUNT)) : PRICES[plan]
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const webhookSecret = process.env.PUNPAY_WEBHOOK_SECRET
  const apiKey = process.env.PUNPAY_SECRET_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supaUrl = process.env.VITE_SUPABASE_URL
  if (!webhookSecret || !apiKey || !serviceKey || !supaUrl) {
    return res.status(500).json({ error: 'env ไม่ครบ (PUNPAY_WEBHOOK_SECRET, PUNPAY_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL)' })
  }
  const punpayBase = (process.env.PUNPAY_BASE_URL || 'https://punpay.petgo.asia').replace(/\/+$/, '')

  // ── 1) ตรวจลายเซ็นจาก raw body ──
  const raw = await readRawBody(req)
  const sigHeader = String(req.headers['x-panpay-signature'] || '')
  const expected = crypto.createHmac('sha256', webhookSecret).update(raw).digest('hex')
  let valid = false
  try {
    valid = sigHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sigHeader, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch { valid = false }
  if (!valid) return res.status(401).json({ error: 'ลายเซ็นไม่ถูกต้อง' })

  let evt
  try { evt = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ error: 'bad json' }) }

  const type = evt.event || evt.type || ''
  // v1 สนใจเฉพาะ charge.paid — อีเวนต์อื่น (refund/cancel/subscription) ตอบ 200 ไว้ก่อน
  if (type !== 'charge.paid') return res.status(200).json({ ok: true, ignored: type })

  // หา charge id จาก payload (เผื่อโครงต่างกัน)
  const cObj = evt.data || evt.charge || evt.object || evt
  const chargeId = cObj?.id || evt.charge_id || evt.id
  if (!chargeId) return res.status(200).json({ ok: true, note: 'no charge id' })

  // ── 2) ถาม PunPay ซ้ำ (แหล่งความจริง) แล้วอัปเกรด ──
  try {
    const cRes = await fetch(`${punpayBase}/api/v1/charges/${encodeURIComponent(chargeId)}`, {
      headers: { 'x-api-key': apiKey },
    })
    const c = await cRes.json().catch(() => null)
    if (!cRes.ok || !c?.id) return res.status(500).json({ error: 'ดึงข้อมูล charge ไม่สำเร็จ' }) // 5xx → PunPay retry

    const paid = Boolean(c.paid_at) || PAID_STATUSES.includes(String(c.status || '').toLowerCase())
    if (!paid) return res.status(200).json({ ok: true, note: 'ยังไม่จ่าย' })

    const meta = c.metadata || {}
    const want = expectedAmount(meta.plan, meta.cycle)
    const months = Number(meta.months)
    if (!meta.org_id || want === null || Number(c.amount) !== want || ![1, 12].includes(months)) {
      return res.status(200).json({ ok: true, note: 'metadata/ยอดไม่ตรง' })
    }

    const svc = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }
    const rpc = await fetch(`${supaUrl}/rest/v1/rpc/apply_payment`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({ p_charge_id: chargeId, p_org: meta.org_id, p_plan: meta.plan, p_months: months, p_amount: want }),
    })
    if (!rpc.ok) return res.status(500).json({ error: 'อัปเกรดไม่สำเร็จ' }) // 5xx → retry
    return res.status(200).json({ ok: true, applied: chargeId })
  } catch {
    return res.status(500).json({ error: 'ประมวลผล webhook ไม่สำเร็จ' }) // 5xx → retry
  }
}
