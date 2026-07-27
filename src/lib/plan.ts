import { useAuth, type Organization } from './auth'
import { supabase } from './supabase'

// ลิมิตแพ็กเกจ Free (ต้องตรงกับฝั่งเซิร์ฟเวอร์ใน supabase/plan-gating.sql)
export const FREE_MAX_PROPERTIES = 10
export const FREE_MAX_MEMBERS = 2

export interface PlanAccess {
  pro: boolean
  maxProperties: number | null // null = ไม่จำกัด
  maxMembers: number | null
  dashboard: boolean // สรุปภาพรวม
  visitPlans: boolean // แผนเยี่ยมชม
  followUps: boolean // นัดติดตาม
  ai: boolean // ผู้ช่วย/กรอกฟอร์ม/วิเคราะห์
  importCsv: boolean // นำเข้า Excel/CSV
}

export function planAccess(plan?: string | null): PlanAccess {
  const pro = plan === 'pro' || plan === 'enterprise'
  // 'starter' (เริ่มต้น ฿990) = ปลดลิมิตจำนวน (ทรัพย์/ทีมไม่จำกัด) แต่ยังไม่มีฟีเจอร์พรีเมียม
  const unlimited = pro || plan === 'starter'
  return {
    pro,
    maxProperties: unlimited ? null : FREE_MAX_PROPERTIES,
    maxMembers: unlimited ? null : FREE_MAX_MEMBERS,
    dashboard: pro,
    visitPlans: pro,
    followUps: pro,
    ai: pro,
    importCsv: pro,
  }
}

/** แพ็กเกจที่มีผลจริงตอนนี้ — จ่ายจริง > ช่วงทดลองยังไม่หมด > free (ตรงกับ org_effective_plan ใน supabase/trial.sql) */
export function effectivePlan(org?: Organization | null): string {
  if (!org) return 'free'
  if (org.plan && org.plan !== 'free') return org.plan
  const today = new Date().toISOString().slice(0, 10)
  if (org.trial_expires_at && org.trial_expires_at >= today) return org.trial_plan || 'free'
  return 'free'
}

/** กำลังอยู่ในช่วงทดลองใช้ (ยังไม่ได้จ่ายจริง) หรือไม่ */
export function onTrial(org?: Organization | null): boolean {
  if (!org || (org.plan && org.plan !== 'free')) return false
  const today = new Date().toISOString().slice(0, 10)
  return Boolean(org.trial_plan && org.trial_expires_at && org.trial_expires_at >= today)
}

/** สิทธิ์ของผู้ใช้ปัจจุบัน — super (โหมดภาพรวม) เข้าถึงทุกอย่าง · สวมสิทธิ์ = ตามแพ็กเกจองค์กรนั้น */
export function usePlanAccess(): PlanAccess {
  const { org, profile } = useAuth()
  if (profile?.is_super && !profile?.impersonate_org_id) return planAccess('enterprise')
  return planAccess(effectivePlan(org))
}

// ── ตั้งค่าทดลองใช้ (app_settings key 'trial') — super admin แก้ได้จากหน้า Super Admin ──
export interface TrialSetting {
  days: number // 0 = ปิดช่วงทดลอง
  plan: 'starter' | 'pro'
}
export const DEFAULT_TRIAL: TrialSetting = { days: 14, plan: 'pro' }

// ── เกณฑ์ชวนเพื่อน (app_settings key 'referral') — super admin แก้ได้จากหน้า Super Admin ──
export interface ReferralSetting {
  need: number // ชวนครบกี่คนต่อ 1 รอบรางวัล
  days: number // ได้ Pro ฟรีกี่วันต่อรอบ
}
export const DEFAULT_REFERRAL: ReferralSetting = { need: 2, days: 30 }

/** โหลดเกณฑ์ชวนเพื่อน — ไม่ throw (ตาราง/แถวยังไม่มี → ใช้ค่ามาตรฐาน) */
export async function fetchReferralSetting(): Promise<ReferralSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'referral').maybeSingle()
    const v = (data?.value ?? null) as { need?: number; days?: number } | null
    if (!v) return DEFAULT_REFERRAL
    const need = Number(v.need)
    const days = Number(v.days)
    return {
      need: Number.isInteger(need) && need >= 1 ? need : DEFAULT_REFERRAL.need,
      days: Number.isInteger(days) && days >= 1 ? days : DEFAULT_REFERRAL.days,
    }
  } catch {
    return DEFAULT_REFERRAL
  }
}

// ── แจ้งเตือนสัญญาเช่าใกล้หมด (app_settings key 'contract_alert') — แจ้งล่วงหน้ากี่วันบ้าง ──
export interface ContractAlertSetting {
  days: number[] // เช่น [60, 30] = แจ้งตอนเหลือ 60 วัน และอีกครั้งตอนเหลือ 30 วัน
}
export const DEFAULT_CONTRACT_ALERT: ContractAlertSetting = { days: [60, 30] }

/** โหลดเกณฑ์แจ้งเตือนสัญญา — ไม่ throw (ตาราง/แถวยังไม่มี → ใช้ค่ามาตรฐาน 60/30 วัน) */
export async function fetchContractAlertSetting(): Promise<ContractAlertSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'contract_alert').maybeSingle()
    const v = (data?.value ?? null) as { days?: unknown } | null
    const days = Array.isArray(v?.days)
      ? v.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365)
      : []
    return days.length > 0 ? { days } : DEFAULT_CONTRACT_ALERT
  } catch {
    return DEFAULT_CONTRACT_ALERT
  }
}

/** โหลดตั้งค่าทดลองใช้ — ไม่ throw (ตาราง/แถวยังไม่มี → ใช้ค่ามาตรฐาน) */
export async function fetchTrialSetting(): Promise<TrialSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'trial').maybeSingle()
    const v = (data?.value ?? null) as { days?: number; plan?: string } | null
    if (!v) return DEFAULT_TRIAL
    const days = Number(v.days)
    const plan = v.plan === 'starter' ? 'starter' : 'pro'
    return { days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_TRIAL.days, plan }
  } catch {
    return DEFAULT_TRIAL
  }
}
