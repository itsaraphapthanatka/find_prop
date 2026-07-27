import { useAuth, type Organization } from './auth'
import { supabase } from './supabase'

// ลิมิตแพ็กเกจ Free (ต้องตรงกับฝั่งเซิร์ฟเวอร์ใน supabase/plan-tiers.sql + api/create-member.js)
export const FREE_MAX_PROPERTIES = 5
export const FREE_MAX_MEMBERS = 0 // Free ไม่มีลูกทีม
/** ระดับมาตรฐานเมื่อองค์กรยังไม่มี plan_tier (ลูกค้าเดิม/ช่วงทดลอง) */
export const DEFAULT_TIER = 500

export interface PlanAccess {
  pro: boolean
  maxProperties: number | null // null = ไม่จำกัด (enterprise) · Basic/Pro = ตามระดับ 100/250/500
  maxMembers: number | null
  dashboard: boolean // สรุปภาพรวม
  visitPlans: boolean // แผนเยี่ยมชม
  followUps: boolean // นัดติดตาม
  ai: boolean // ผู้ช่วย/กรอกฟอร์ม/วิเคราะห์
  importCsv: boolean // นำเข้า Excel/CSV
}

export function planAccess(plan?: string | null, tier?: number | null): PlanAccess {
  const pro = plan === 'pro' || plan === 'enterprise'
  const paid = pro || plan === 'starter' // 'starter' = แพ็ก Basic (ชื่อคีย์เดิมใน DB)
  return {
    pro,
    // Basic/Pro จำกัดทรัพย์ตามระดับที่ซื้อ (100/250/500) · enterprise ไม่จำกัด · free = 5
    maxProperties: plan === 'enterprise' ? null : paid ? (tier ?? DEFAULT_TIER) : FREE_MAX_PROPERTIES,
    maxMembers: paid ? null : FREE_MAX_MEMBERS,
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
  return planAccess(effectivePlan(org), org?.plan_tier)
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

// ── ช่องทางติดต่อ/ทีมขาย (app_settings key 'contact') — super admin ตั้งได้ · โชว์บน landing + ปุ่มคุยเซลล์ ──
export interface ContactSetting {
  lineId: string  // เช่น @hopplatform
  lineUrl: string // ลิงก์ LINE OA — เว้นว่างตอนบันทึก = สร้างจาก lineId ให้อัตโนมัติ
  phone: string
  email: string
}
export const DEFAULT_CONTACT: ContactSetting = {
  lineId: '@hopplatform',
  lineUrl: 'https://line.me/R/ti/p/@hopplatform',
  phone: '081-234-5678',
  email: 'sales@hop-platform.com',
}

/** โหลดช่องทางติดต่อ — ไม่ throw (แถวยังไม่มี → ใช้ค่ามาตรฐาน) · landing เรียกแบบ anon ได้ */
export async function fetchContactSetting(): Promise<ContactSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'contact').maybeSingle()
    const v = (data?.value ?? null) as Partial<ContactSetting> | null
    if (!v) return DEFAULT_CONTACT
    const lineId = (v.lineId || DEFAULT_CONTACT.lineId).trim()
    return {
      lineId,
      lineUrl: (v.lineUrl || `https://line.me/R/ti/p/${lineId}`).trim(),
      phone: (v.phone || DEFAULT_CONTACT.phone).trim(),
      email: (v.email || DEFAULT_CONTACT.email).trim(),
    }
  } catch {
    return DEFAULT_CONTACT
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
