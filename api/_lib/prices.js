// ราคาแพ็กเกจ (ฝั่งเซิร์ฟเวอร์) — อ่านจากตาราง plan_prices ซึ่ง super admin ตั้งได้จากหน้า Super Admin
// โครงสร้าง: plan (starter=Basic | pro) × tier (โควตาทรัพย์ 100 | 250 | 500)
// ⚠️ ระบบจ่ายเงินห้ามล่มเพราะเรื่องราคา: ถ้าตารางยังไม่ถูกสร้าง/อ่านไม่สำเร็จ ให้ถอยไปใช้ราคามาตรฐานนี้
// (ไฟล์/โฟลเดอร์ขึ้นต้นด้วย _ → Vercel ไม่ทำเป็น endpoint แต่ import ได้)

export const TIERS = [100, 250, 500]

// รายปี = ×12 ลด 15% — ต้องตรงกับ src/lib/payments.ts และ supabase/plan-tiers.sql
export const DEFAULT_PRICES = {
  starter: {
    100: { monthly: 590, yearly: 6018 },
    250: { monthly: 790, yearly: 8058 },
    500: { monthly: 990, yearly: 10098 },
  },
  pro: {
    100: { monthly: 1190, yearly: 12138 },
    250: { monthly: 1390, yearly: 14178 },
    500: { monthly: 1590, yearly: 16218 },
  },
}

/** คืน { starter: {100:{monthly,yearly},250:…,500:…}, pro: {...} } — ไม่ throw เด็ดขาด */
export async function fetchPlanPrices(supaUrl, apiKey) {
  const out = JSON.parse(JSON.stringify(DEFAULT_PRICES))
  try {
    const res = await fetch(`${supaUrl}/rest/v1/plan_prices?select=plan,tier,monthly,yearly`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    })
    const rows = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(rows)) return out
    for (const r of rows) {
      const tier = Number(r.tier ?? 500) // ตารางยุคก่อนมี tier → ถือเป็นระดับ 500
      if (out[r.plan]?.[tier] && Number(r.monthly) > 0 && Number(r.yearly) > 0) {
        out[r.plan][tier] = { monthly: Number(r.monthly), yearly: Number(r.yearly) }
      }
    }
    return out
  } catch {
    return out
  }
}
