// ที่นั่งทีม (ฝั่งเซิร์ฟเวอร์) — ราคาที่นั่งเพิ่ม + โควตาที่นั่งของแต่ละแพ็กเกจ
// ⚠️ ตัวเลขต้องตรงกับ src/lib/plan.ts (SEATS_BY_PLAN) และ plan_base_seats() ใน supabase/seats.sql
// (ไฟล์/โฟลเดอร์ขึ้นต้นด้วย _ → Vercel ไม่ทำเป็น endpoint แต่ import ได้)

export const DEFAULT_SEAT_PRICE = { monthly: 290, yearly: 2958 } // รายปี = ×12 ลด 15%
export const MAX_SEAT_QTY = 50

const SEATS_BY_PLAN = {
  starter: { 100: 3, 250: 5, 500: 10 },
  pro: { 100: 5, 250: 10, 500: 20 },
}

/**
 * ที่นั่งพื้นฐานของแพ็กเกจ — null = ไม่จำกัด (enterprise) · free/ไม่รู้จัก = ตามตั้งค่า (มาตรฐาน 1)
 * base = ตั้งค่าจาก super admin (app_settings 'seats') · ไม่ส่ง = ใช้ค่ามาตรฐาน
 */
export function baseSeats(plan, tier, base) {
  if (plan === 'enterprise') return null
  const cfg = base ?? { free: 1, starter: SEATS_BY_PLAN.starter, pro: SEATS_BY_PLAN.pro }
  // เฉพาะ starter/pro ที่มีตารางตามระดับ — free/ไม่รู้จัก ใช้ตัวเลขเดียว
  const table = plan === 'pro' ? cfg.pro : plan === 'starter' ? cfg.starter : null
  if (!table) return Number(cfg.free) >= 1 ? Number(cfg.free) : 1
  const n = Number(table[Number(tier ?? 500)] ?? table[500])
  return n >= 1 ? n : (SEATS_BY_PLAN[plan]?.[Number(tier ?? 500)] ?? SEATS_BY_PLAN[plan]?.[500] ?? 1)
}

/** ตั้งค่าที่นั่งทั้งก้อน (ราคา + โควตาต่อแพ็กเกจ) — ไม่ throw เด็ดขาด */
export async function fetchSeatSetting(supaUrl, apiKey) {
  const price = await fetchSeatPrice(supaUrl, apiKey)
  try {
    const res = await fetch(`${supaUrl}/rest/v1/app_settings?key=eq.seats&select=value`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    })
    const rows = await res.json().catch(() => null)
    let v = Array.isArray(rows) ? rows[0]?.value : null
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
    return { ...price, base: v?.base ?? null }
  } catch {
    return { ...price, base: null }
  }
}

/** ราคาที่นั่งเพิ่มจาก app_settings 'seats' — ไม่ throw เด็ดขาด (ระบบจ่ายเงินห้ามล่มเพราะราคา) */
export async function fetchSeatPrice(supaUrl, apiKey) {
  try {
    const res = await fetch(`${supaUrl}/rest/v1/app_settings?key=eq.seats&select=value`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    })
    const rows = await res.json().catch(() => null)
    let v = Array.isArray(rows) ? rows[0]?.value : null
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch { return DEFAULT_SEAT_PRICE }
    }
    const monthly = Number(v?.monthly)
    const yearly = Number(v?.yearly)
    if (monthly > 0 && yearly > 0) return { monthly, yearly }
    return DEFAULT_SEAT_PRICE
  } catch {
    return DEFAULT_SEAT_PRICE
  }
}
