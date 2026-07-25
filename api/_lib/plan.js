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
