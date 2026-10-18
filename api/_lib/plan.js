// แพ็กเกจที่มีผลจริงขององค์กร (ฝั่งเซิร์ฟเวอร์) — ต้องตรงกับ org_effective_plan ใน supabase/trial.sql
// ลำดับ: จ่ายจริง (plan != free) > ช่วงทดลองยังไม่หมด (trial_plan) > free
// วิธีใช้: select organizations ด้วย `select=plan,trial_plan,trial_expires_at` แล้วส่ง row มาที่นี่

export function effectivePlan(org) {
  if (!org) return 'free'
  if (org.plan && org.plan !== 'free') return org.plan
  const today = new Date().toISOString().slice(0, 10)
  if (org.trial_expires_at && org.trial_expires_at >= today) return org.trial_plan || 'free'
  return 'free'
}

export function isProPlan(plan) {
  return plan === 'pro' || plan === 'enterprise'
}

const PAID_PLANS = ['starter', 'pro', 'enterprise']

/** วันนี้ (YYYY-MM-DD) — เทียบกับ sub_expires_at แบบเดียวกับ org_ok */
const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * องค์กรใช้แพ็กเกจ Enterprise อยู่ (ดีลผ่านทีมงาน) — ตรงกับ enterpriseActive ใน src/lib/plan.ts
 * true = สมัคร/เปลี่ยน Basic/Pro เองไม่ได้ (ไม่งั้นไปแก้ราคาใน subscription ของดีล) ต้องคุยกับทีมงาน
 * หมดอายุแล้ว = false → กลับมาเลือก Basic/Pro เองได้
 */
export function enterpriseActive(org) {
  if (org?.plan !== 'enterprise' || org.sub_status !== 'active') return false
  return !org.sub_expires_at || org.sub_expires_at >= todayIso()
}

/**
 * ซื้อ/ปรับที่นั่งเพิ่มได้ไหม — ที่นั่งผูกกับแพ็กเกจที่จ่ายเงิน (ตรงกับ seatBlock ใน src/lib/plan.ts)
 * Free/ช่วงทดลองซื้อไม่ได้ (Free ไม่มีทีม · ทดลองหมดแล้วที่นั่งใช้ไม่ได้แต่ยังโดนตัดเงินทุกรอบ)
 * แพ็กเกจตั้งยกเลิกไว้ = ที่นั่งกำลังจะยกเลิกตาม (cascadeSeats) → ให้ต่ออายุแพ็กเกจก่อน
 * คืนข้อความเหตุผล · null = ซื้อได้
 */
export function seatPurchaseBlock(org) {
  if (!org || !PAID_PLANS.includes(org.plan)) {
    return 'ซื้อที่นั่งเพิ่มได้เฉพาะองค์กรที่ใช้แพ็กเกจ Basic หรือ Pro — สมัครแพ็กเกจก่อน'
  }
  if (org.sub_status !== 'active' || (org.sub_expires_at && org.sub_expires_at < todayIso())) {
    return 'แพ็กเกจหมดอายุแล้ว — ต่ออายุแพ็กเกจก่อน แล้วค่อยซื้อที่นั่ง'
  }
  if (org.plan === 'enterprise') return 'แพ็กเกจ Enterprise ไม่จำกัดที่นั่งอยู่แล้ว — ไม่ต้องซื้อเพิ่ม'
  if (org.sub_cancel_at_period_end) {
    return 'แพ็กเกจตั้งยกเลิกการต่ออายุไว้ (ที่นั่งเพิ่มจะยกเลิกตาม) — กดต่ออายุแพ็กเกจก่อน แล้วค่อยซื้อ/ปรับที่นั่ง'
  }
  return null
}
