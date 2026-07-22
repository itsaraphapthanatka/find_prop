import { useAuth } from './auth'

// ลิมิตแพ็กเกจ Free (ต้องตรงกับฝั่งเซิร์ฟเวอร์ใน supabase/plan-gating.sql)
export const FREE_MAX_PROPERTIES = 10
export const FREE_MAX_MEMBERS = 2

export interface PlanAccess {
  pro: boolean
  maxProperties: number | null // null = ไม่จำกัด
  maxMembers: number | null
  dashboard: boolean // สรุปภาพรวม
  visitPlans: boolean // แผนเยี่ยมชม
  ai: boolean // ผู้ช่วย/กรอกฟอร์ม/วิเคราะห์
  importCsv: boolean // นำเข้า Excel/CSV
}

export function planAccess(plan?: string | null): PlanAccess {
  const pro = plan === 'pro' || plan === 'enterprise'
  return {
    pro,
    maxProperties: pro ? null : FREE_MAX_PROPERTIES,
    maxMembers: pro ? null : FREE_MAX_MEMBERS,
    dashboard: pro,
    visitPlans: pro,
    ai: pro,
    importCsv: pro,
  }
}

/** สิทธิ์ของผู้ใช้ปัจจุบัน — super (โหมดภาพรวม) เข้าถึงทุกอย่าง · สวมสิทธิ์ = ตามแพ็กเกจองค์กรนั้น */
export function usePlanAccess(): PlanAccess {
  const { org, profile } = useAuth()
  if (profile?.is_super && !profile?.impersonate_org_id) return planAccess('enterprise')
  return planAccess(org?.plan)
}
