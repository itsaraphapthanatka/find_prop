// ราคาแพ็กเกจ (ฝั่งเซิร์ฟเวอร์) — อ่านจากตาราง plan_prices ซึ่ง super admin ตั้งได้จากหน้า Super Admin
// ⚠️ ระบบจ่ายเงินห้ามล่มเพราะเรื่องราคา: ถ้าตารางยังไม่ถูกสร้าง/อ่านไม่สำเร็จ ให้ถอยไปใช้ราคามาตรฐานนี้
// (ไฟล์/โฟลเดอร์ขึ้นต้นด้วย _ → Vercel ไม่ทำเป็น endpoint แต่ import ได้)

export const DEFAULT_PRICES = {
  starter: { monthly: 990, yearly: 10098 },   // 990×12 ลด 15%
  pro: { monthly: 1290, yearly: 13158 },      // 1290×12 ลด 15%
}

/** คืน { starter: {monthly, yearly}, pro: {...} } — ไม่ throw เด็ดขาด */
export async function fetchPlanPrices(supaUrl, apiKey) {
  try {
    const res = await fetch(`${supaUrl}/rest/v1/plan_prices?select=plan,monthly,yearly`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    })
    const rows = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(rows)) return DEFAULT_PRICES
    const out = { starter: { ...DEFAULT_PRICES.starter }, pro: { ...DEFAULT_PRICES.pro } }
    for (const r of rows) {
      if (out[r.plan] && Number(r.monthly) > 0 && Number(r.yearly) > 0) {
        out[r.plan] = { monthly: Number(r.monthly), yearly: Number(r.yearly) }
      }
    }
    return out
  } catch {
    return DEFAULT_PRICES
  }
}
