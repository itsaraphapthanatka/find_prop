// ที่นั่งทีม (ฝั่งเซิร์ฟเวอร์) — ราคาที่นั่งเพิ่ม + โควตาที่นั่งของแต่ละแพ็กเกจ
// ⚠️ ตัวเลขต้องตรงกับ src/lib/plan.ts (SEATS_BY_PLAN) และ plan_base_seats() ใน supabase/seats.sql
// (ไฟล์/โฟลเดอร์ขึ้นต้นด้วย _ → Vercel ไม่ทำเป็น endpoint แต่ import ได้)

export const DEFAULT_SEAT_PRICE = { monthly: 290, yearly: 2958 } // รายปี = ×12 ลด 15%
export const MAX_SEAT_QTY = 50

const SEATS_BY_PLAN = {
  starter: { 100: 3, 250: 5, 500: 10 },
  pro: { 100: 5, 250: 10, 500: 20 },
}

/** ที่นั่งพื้นฐานของแพ็กเกจ — null = ไม่จำกัด (enterprise) · free/ไม่รู้จัก = 1 */
export function baseSeats(plan, tier) {
  if (plan === 'enterprise') return null
  const table = SEATS_BY_PLAN[plan]
  if (!table) return 1
  return table[Number(tier ?? 500)] ?? table[500]
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
