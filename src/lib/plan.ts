import { useAuth, type Organization } from './auth'
import type { SeatBase } from './payments'
import { supabase } from './supabase'

// ลิมิตแพ็กเกจ Free (ต้องตรงกับฝั่งเซิร์ฟเวอร์ใน supabase/plan-tiers.sql + api/create-member.js)
export const FREE_MAX_PROPERTIES = 5
export const FREE_SEATS = 1 // Free = เจ้าของคนเดียว (ไม่มีลูกทีม)
/** ระดับมาตรฐานเมื่อองค์กรยังไม่มี plan_tier (ลูกค้าเดิม/ช่วงทดลอง) */
export const DEFAULT_TIER = 500

/**
 * ที่นั่งที่แถมมากับแพ็กเกจ — 1 ที่นั่ง = 1 บัญชีในองค์กร (นับแอดมิน/เจ้าของด้วย)
 * ค่ามาตรฐาน — ของจริง super admin ตั้งได้ที่ app_settings 'seats' (fetchSeatSetting())
 * ⚠️ ต้องตรงกับ plan_base_seats() ใน supabase/seats-config.sql และ api/_lib/seats.js
 */
export const SEATS_BY_PLAN: Record<'starter' | 'pro', Record<number, number>> = {
  starter: { 100: 3, 250: 5, 500: 10 },
  pro: { 100: 5, 250: 10, 500: 20 },
}

/**
 * ที่นั่งพื้นฐานของแพ็กเกจ (ยังไม่รวมที่นั่งที่ซื้อเพิ่ม) — null = ไม่จำกัด (enterprise)
 * base = ตั้งค่าจาก super admin (ไม่ส่ง = ใช้ค่ามาตรฐาน)
 */
export function baseSeats(plan?: string | null, tier?: number | null, base?: SeatBase): number | null {
  if (plan === 'enterprise') return null
  const cfg = base ?? { free: FREE_SEATS, starter: SEATS_BY_PLAN.starter, pro: SEATS_BY_PLAN.pro }
  const table = plan === 'pro' ? cfg.pro : plan === 'starter' ? cfg.starter : null
  if (!table) return cfg.free
  return table[tier ?? DEFAULT_TIER] ?? table[DEFAULT_TIER]
}

/**
 * ที่นั่งทั้งหมดที่องค์กรใช้ได้ = ของแพ็กเกจ + ที่ซื้อเพิ่ม (ที่ยังไม่หมดอายุ) — null = ไม่จำกัด
 * ⏳ ช่วงทดลองใช้ = ไม่จำกัด (เชิญทีมได้เต็มที่ · หมดทดลองแล้วโควตากลับมาเป็นของแพ็กเกจที่จ่ายจริง)
 * ตรงกับ org_seat_limit() ในฐานข้อมูล (ฐานข้อมูลเป็นตัวบังคับจริง อันนี้ไว้โชว์/กันกดเปล่า)
 */
export function seatLimit(org?: Organization | null, base?: SeatBase): number | null {
  if (onTrial(org)) return null
  const b = baseSeats(effectivePlan(org), org?.plan_tier, base)
  if (b === null) return null
  return b + activeExtraSeats(org)
}

/**
 * ที่นั่งที่ "ขาด" อยู่ = ใช้เกินโควตาไปกี่ที่นั่ง (0 = ไม่เกิน · limit null = ไม่จำกัด)
 * เกิดได้ 2 กรณี: หมดช่วงทดลองใช้ (ตอนทดลองเชิญได้ไม่จำกัด) หรือลดระดับแพ็กเกจ
 * ⚠️ ไม่เตะใครออก — แค่เชิญคนใหม่ไม่ได้จนกว่าจะซื้อที่นั่งเพิ่มให้ครบ
 */
export function seatShortfall(used: number, limit: number | null): number {
  if (limit === null) return 0
  return Math.max(0, used - limit)
}

/** ที่นั่งที่ซื้อเพิ่มและยังไม่หมดอายุ */
export function activeExtraSeats(org?: Organization | null): number {
  const qty = org?.extra_seats ?? 0
  if (qty <= 0 || !org?.extra_seats_expires_at) return 0
  return org.extra_seats_expires_at >= new Date().toISOString().slice(0, 10) ? qty : 0
}

export interface PlanAccess {
  pro: boolean
  maxProperties: number | null // null = ไม่จำกัด (enterprise) · Basic/Pro = ตามระดับ 100/250/500
  /** ที่นั่งพื้นฐานของแพ็กเกจ (ไม่รวมที่ซื้อเพิ่ม — ใช้ seatLimit(org) ถ้าต้องการยอดจริง) · null = ไม่จำกัด */
  maxSeats: number | null
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
    maxSeats: baseSeats(plan, tier),
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
  days: number // 0 = ปิดช่วงทดลอง (ใช้เมื่อไม่ได้กำหนดวันสิ้นสุด)
  plan: 'starter' | 'pro'
  /** กำหนด "วันสิ้นสุดตายตัว" (YYYY-MM-DD) — ถ้าตั้งไว้ องค์กรใหม่ทุกรายจะทดลองถึงวันนี้ (ไม่สนใจ days)
   *  ว่าง/null = ใช้แบบนับวันจากวันสมัคร · เหมาะกับโปรฯ "ทดลองฟรีถึงสิ้นปี" */
  until?: string | null
}
export const DEFAULT_TRIAL: TrialSetting = { days: 14, plan: 'pro', until: null }

/** ช่วงทดลองยังเปิดรับองค์กรใหม่อยู่ไหม (โหมดวันสิ้นสุด: ต้องยังไม่เลยวันนั้น · โหมดนับวัน: days>0) */
export function trialActive(t: TrialSetting): boolean {
  if (t.until) return t.until >= new Date().toISOString().slice(0, 10)
  return t.days > 0
}

/** ข้อความโปรโมตช่วงทดลอง (ใช้บน landing) — คืน '' ถ้าปิดช่วงทดลอง */
export function trialLabel(t: TrialSetting): string {
  if (!trialActive(t)) return ''
  if (t.until) {
    const d = new Date(t.until + 'T00:00:00')
    return `ทดลองฟรีถึง ${d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`
  }
  return `ทดลองฟรี ${t.days} วัน`
}

// ── เกณฑ์ชวนเพื่อน (app_settings key 'referral') — super admin แก้ได้จากหน้า Super Admin ──
export interface ReferralSetting {
  need: number // ชวนครบกี่คนต่อ 1 รอบรางวัล
  days: number // ได้ Pro ฟรีกี่วันต่อรอบ
  /** เพดานรวมของรางวัลต่อองค์กร (วัน) — กันชวนต่อเนื่องแล้วใช้ Pro ฟรีตลอดชีพ · 0 = ปิดรางวัล */
  maxDays: number
}
export const DEFAULT_REFERRAL: ReferralSetting = { need: 2, days: 30, maxDays: 90 }

/** โหลดเกณฑ์ชวนเพื่อน — ไม่ throw (ตาราง/แถวยังไม่มี → ใช้ค่ามาตรฐาน) */
export async function fetchReferralSetting(): Promise<ReferralSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'referral').maybeSingle()
    const v = (data?.value ?? null) as { need?: number; days?: number; maxDays?: number } | null
    if (!v) return DEFAULT_REFERRAL
    const need = Number(v.need)
    const days = Number(v.days)
    const maxDays = Number(v.maxDays)
    return {
      need: Number.isInteger(need) && need >= 1 ? need : DEFAULT_REFERRAL.need,
      days: Number.isInteger(days) && days >= 1 ? days : DEFAULT_REFERRAL.days,
      // 0 = ปิดรางวัล (ตั้งใจได้) จึงยอมรับ 0 แต่ไม่ยอมรับค่าติดลบ/ไม่ใช่จำนวนเต็ม
      maxDays: Number.isInteger(maxDays) && maxDays >= 0 ? maxDays : DEFAULT_REFERRAL.maxDays,
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
    const v = (data?.value ?? null) as { days?: number; plan?: string; until?: string | null } | null
    if (!v) return DEFAULT_TRIAL
    const days = Number(v.days)
    const plan = v.plan === 'starter' ? 'starter' : 'pro'
    const until = typeof v.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.until) ? v.until : null
    return { days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_TRIAL.days, plan, until }
  } catch {
    return DEFAULT_TRIAL
  }
}
