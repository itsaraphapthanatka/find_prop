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

/** ป้ายภาษาไทยของแต่ละการกระทำ — ใช้ทั้งหน้า logs และที่อื่นที่อยากโชว์ */
export const ACTION_LABELS: Record<string, string> = {
  'property.create': 'เพิ่มทรัพย์',
  'property.update': 'แก้ไขทรัพย์',
  'property.delete': 'ลบทรัพย์',
  'plan.create': 'สร้างแผนเยี่ยมชม',
  'plan.delete': 'ลบแผนเยี่ยมชม',
  'import.run': 'นำเข้าข้อมูล',
  'ai.voice_fill': 'AI กรอกฟอร์มจากเสียง',
  'ai.assistant': 'สั่งงานผู้ช่วย AI',
}

/** กลุ่มสำหรับตัวกรองในหน้า logs */
export const ACTION_GROUPS: { value: string; label: string }[] = [
  { value: '', label: 'ทุกการกระทำ' },
  { value: 'property.', label: 'ข้อมูลทรัพย์' },
  { value: 'plan.', label: 'แผนเยี่ยมชม' },
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
