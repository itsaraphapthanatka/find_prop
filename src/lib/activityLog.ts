import { supabase, supabaseConfigured } from './supabase'

// ชื่อผู้ใช้ปัจจุบัน — AuthProvider ตั้งให้ตอนโหลดโปรไฟล์ (เก็บ snapshot ลง log
// เพื่อให้ประวัติอ่านได้แม้โปรไฟล์ถูกแก้ชื่อ/ลบทีหลัง)
let actorName: string | null = null
export function setLogActor(name: string | null) {
  actorName = name
}

/**
 * บันทึกประวัติการใช้งาน — fire-and-forget: ห้ามทำให้งานหลักช้าหรือล้ม
 * (ตารางยังไม่ถูกสร้าง / สิทธิ์ไม่ผ่าน ก็แค่ไม่มี log ไม่กระทบผู้ใช้)
 */
export function logActivity(
  action: string,
  entityCode?: string | null,
  detail?: Record<string, unknown>,
) {
  if (!supabaseConfigured) return
  void supabase
    .from('activity_logs')
    .insert({
      action,
      entity_code: entityCode ?? null,
      detail: detail ?? {},
      user_name: actorName,
    })
    .then(() => undefined)
}

/**
 * ป้ายภาษาไทยของแต่ละการกระทำ — ใช้ทั้งหน้า logs และที่อื่นที่อยากโชว์
 * ส่วนใหญ่เขียนโดย trigger ในฐานข้อมูล (supabase/logs-triggers.sql) จึงครอบทุกช่องทาง
 * ที่เหลือ (import./ai.) มาจากฝั่งเว็บ เพราะเป็น "เจตนา" ที่ฐานข้อมูลมองไม่เห็น
 */
export const ACTION_LABELS: Record<string, string> = {
  'property.create': 'เพิ่มทรัพย์',
  'property.update': 'แก้ไขทรัพย์',
  'property.delete': 'ลบทรัพย์',
  'deal.close': 'ปิดงานทรัพย์',
  'deal.reopen': 'เปิดงานทรัพย์อีกครั้ง',
  'followup.create': 'ตั้งนัดติดตาม',
  'followup.done': 'ปิดนัด + บันทึกผล',
  'followup.update': 'แก้ไขนัดติดตาม',
  'followup.delete': 'ลบนัดติดตาม',
  'plan.create': 'สร้างแผนเยี่ยมชม',
  'plan.update': 'แก้ไขแผนเยี่ยมชม',
  'plan.delete': 'ลบแผนเยี่ยมชม',
  'member.add': 'เพิ่มสมาชิกในองค์กร',
  'member.update': 'แก้สิทธิ์สมาชิก',
  'member.remove': 'ถอดสมาชิกออกจากองค์กร',
  'profile.rights': 'เปลี่ยนบทบาท/สถานะบัญชี',
  'org.switch': 'สลับองค์กร',
  'org.create': 'สร้างองค์กร',
  'org.update': 'แก้ไของค์กร/แพ็กเกจ',
  'org.delete': 'ลบองค์กร',
  'super.impersonate': 'สวมสิทธิ์องค์กร',
  'super.exit': 'ออกจากการสวมสิทธิ์',
  'import.run': 'นำเข้าข้อมูล',
  'ai.voice_fill': 'AI กรอกฟอร์มจากเสียง',
  'ai.assistant': 'สั่งงานผู้ช่วย AI',
}

/** กลุ่มสำหรับตัวกรองในหน้า logs */
export const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: '', label: 'ทุกการกระทำ' },
  { value: 'property.', label: 'ข้อมูลทรัพย์' },
  { value: 'deal.', label: 'ปิด/เปิดงาน' },
  { value: 'followup.', label: 'นัดติดตาม' },
  { value: 'plan.', label: 'แผนเยี่ยมชม' },
  { value: 'member.', label: 'ทีมและสิทธิ์' },
  { value: 'org.', label: 'องค์กร' },
  { value: 'super.', label: 'การสวมสิทธิ์ (super)' },
  { value: 'import.', label: 'นำเข้าข้อมูล' },
  { value: 'ai.', label: 'การใช้ AI' },
]

export interface ActivityLog {
  id: string
  org_id: string | null
  user_id: string | null
  user_name: string | null
  action: string
  entity_code: string | null
  detail: Record<string, unknown>
  created_at: string
}
