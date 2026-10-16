// ⚠️ ชั่วคราว — ตรวจว่ายอดชำระเงินบน production ถูกต้องหลังลบ env PUNPAY_TEST_AMOUNT (ลบไฟล์นี้หลังตรวจ)
// ตอบเฉพาะ: มีค่าบังคับยอดทดสอบอยู่ไหม (true/false — ไม่เปิดเผยค่า) + ยอดที่จะคิดจริงของแพ็กเกจตัวอย่าง
// (ราคาเป็นข้อมูลสาธารณะอยู่แล้วบนหน้า landing) · ไม่สร้างรายการ ไม่แตะ PunPay

import { fetchPlanPrices } from './_lib/prices.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const testAmt = Number(process.env.PUNPAY_TEST_AMOUNT)
  const override = testAmt > 0
  const prices = await fetchPlanPrices(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
  // สูตรเดียวกับ quote() ใน create-charge.js: ราคาจากตาราง → ถ้ามี env ทดสอบ บังคับยอดเป็นค่านั้น
  const sample = (plan, tier, cycle) => {
    const p = prices[plan]?.[tier]
    const base = cycle === 'yearly' ? p?.yearly : p?.monthly
    return { plan, tier, cycle, price_table: base ?? null, will_charge: override ? testAmt : base ?? null }
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    test_amount_override: override,
    samples: [sample('starter', 100, 'monthly'), sample('pro', 500, 'monthly'), sample('starter', 250, 'yearly')],
    checked_at: new Date().toISOString(),
  })
}
