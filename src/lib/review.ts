import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

// ── จุดตรวจ (checkpoint) — ยึดหลัก "ปิดท้าย journey ที่มีจุดตัดสินใจ/ผลตรวจสอบได้" ──
// ตรงกับเอกสาร public/qa-review.html
export interface Checkpoint {
  id: string
  flow: string
  label: string
  expect: string
  critical?: boolean
}

export const CHECKPOINTS: Checkpoint[] = [
  { id: 'add.voice', flow: 'เพิ่มทรัพย์', label: 'หลังกด "🎤 พูด" แล้วพูดข้อมูล', expect: 'ถอดเสียงตรงกับที่พูด — ตัวเลข/หน่วยถูก (แปดหมื่นห้า → 85,000)' },
  { id: 'add.aifill', flow: 'เพิ่มทรัพย์', label: 'หลังกด "ให้ AI กรอกฟอร์ม"', expect: 'แมปเข้าช่องถูกทุกช่อง โดยเฉพาะขนาดที่ดิน ≠ อาคาร (ห้ามสลับ)' },
  { id: 'add.save', flow: 'เพิ่มทรัพย์', label: 'หลังกด "บันทึก" ทรัพย์สำเร็จ', expect: 'เปิดดูรายละเอียด/แก้ไข ข้อมูลตรงกับที่กรอกครบ' },
  { id: 'add.mappin', flow: 'เพิ่มทรัพย์', label: 'ปักหมุดแผนที่ → "+ เพิ่มทรัพย์ที่จุดนี้"', expect: 'ฟอร์มเปิดพร้อม lat/lng ตรงกับจุดที่ปัก' },

  { id: 'edit.save', flow: 'แก้ไข/ลบ', label: 'หลังกด "บันทึก" การแก้ไข', expect: 'ค่าที่แก้เปลี่ยนตามจริง ค่าอื่นไม่เพี้ยน (เทียบก่อน-หลัง)' },
  { id: 'edit.delete', flow: 'แก้ไข/ลบ', label: 'ก่อนกด "ลบ" — หยุดรีวิวก่อนคลิก', expect: 'ต้องมี dialog ยืนยันก่อนลบทุกที่/ในแอปมือถือ ถ้าลบทันที = ไม่ผ่าน (critical)', critical: true },

  { id: 'search.header', flow: 'ค้นหา/กรอง', label: 'ช่องค้นหาบน header', expect: 'พิมพ์รหัส/ทำเล/ประเภท → กรองถูกและทันที' },
  { id: 'search.consistency', flow: 'ค้นหา/กรอง', label: 'เทียบช่องหลัก vs dropdown (เทียบ/แผนเยี่ยม/AI)', expect: 'พิมพ์คำเดียวกันทั้งสองที่ ได้ผลสอดคล้องกัน' },

  { id: 'ai.compare', flow: 'AI วิเคราะห์', label: 'เปรียบเทียบทรัพย์ — AI เขียนบทวิเคราะห์', expect: 'อิงสเปกจริง สมเหตุสมผล + เวลาตอบสนองรับได้' },
  { id: 'ai.dashboard', flow: 'AI วิเคราะห์', label: 'Dashboard — วิเคราะห์พอร์ตรายวัน', expect: 'ตรงกับข้อมูลพอร์ตจริง + เวลาตอบสนองรับได้' },
  { id: 'ai.rematch', flow: 'AI วิเคราะห์', label: 'แผนเยี่ยม — เปลี่ยน requirement → re-match', expect: 'แนะนำทรัพย์ที่มีจริง ตรง requirement ใหม่ + ชี้จุดเดิมที่ไม่ตรง' },
  { id: 'ai.chat', flow: 'AI วิเคราะห์', label: 'AI Assistant — แชทถาม/สั่งงาน', expect: 'ตอบจากข้อมูลจริง (ไม่มโน) คำสั่งมีปุ่มยืนยัน' },

  { id: 'risk.team_submit', flow: 'ความเสี่ยงสูง', label: 'เพิ่มลูกทีม — ก่อนกด submit', expect: 'ใช้อีเมล/ข้อมูลทดสอบเท่านั้น ทวนก่อนกด' },
  { id: 'risk.team_valid', flow: 'ความเสี่ยงสูง', label: 'เพิ่มลูกทีม — validation', expect: 'กันอีเมลซ้ำ/รหัสสั้นเกิน/ช่องว่าง (ยังไม่เคยทดสอบ)' },
  { id: 'risk.import_submit', flow: 'ความเสี่ยงสูง', label: 'นำเข้า — ก่อน upload จริง', expect: 'ใช้ไฟล์ทดสอบเท่านั้น ทวนก่อนนำเข้า' },
  { id: 'risk.import_valid', flow: 'ความเสี่ยงสูง', label: 'นำเข้า — validation', expect: 'กันคอลัมน์ไม่ครบ/ชนิดผิด/รหัสซ้ำ (ยังไม่เคยทดสอบ)' },
]

export type ReviewStatus = 'pass' | 'fail' | 'note'

export interface ReviewRow {
  id: string
  checkpoint: string
  flow: string | null
  label: string | null
  status: ReviewStatus | null
  comment: string | null
  created_by_name: string | null
  created_at: string
}

// ── สวิตช์ review_mode: เก็บใน module + แจ้ง subscriber (reactive ทั้งแอปโดยไม่ต้อง context) ──
let mode = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** โหลดสถานะ review_mode ครั้งแรก (เรียกหลังล็อกอิน) — ถ้าตาราง/สิทธิ์ยังไม่พร้อม = ปิดไว้ */
export async function initReviewMode(): Promise<void> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'review_mode').maybeSingle()
    mode = data?.value === 'on'
  } catch {
    mode = false
  }
  emit()
}

/** super เปิด-ปิดโหมด */
export async function setReviewMode(on: boolean): Promise<string | null> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'review_mode', value: on ? 'on' : 'off', updated_at: new Date().toISOString() })
  if (error) return error.message
  mode = on
  emit()
  return null
}

/** hook reactive — คืน true/false ว่าโหมดรีวิวเปิดอยู่ไหม */
export function useReviewMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => mode,
  )
}

export async function submitReview(
  cp: Checkpoint,
  status: ReviewStatus,
  comment: string,
  reviewerName: string | null,
): Promise<string | null> {
  const { error } = await supabase.from('flow_reviews').insert({
    checkpoint: cp.id,
    flow: cp.flow,
    label: cp.label,
    status,
    comment: comment.trim() || null,
    created_by_name: reviewerName,
  })
  return error ? error.message : null
}

export async function listReviews(): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('flow_reviews')
    .select('id, checkpoint, flow, label, status, comment, created_by_name, created_at')
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as ReviewRow[]
}
