// บันทึกร่างฟอร์มลงทรัพย์อัตโนมัติ (เฉพาะตอน "เพิ่มทรัพย์ใหม่")
// เก็บใน localStorage ของเครื่องนั้น — ไม่ส่งขึ้นเซิร์ฟเวอร์ ปิดแอป/รีเฟรชแล้วกรอกต่อได้
// ตอนแก้ไขทรัพย์เดิมไม่เก็บร่าง เพราะของจริงอยู่ใน DB แล้ว (กันร่างเก่าทับข้อมูลใหม่)
import type { PropertyInput } from '../types'

const KEY = 'find_prop.draft.property.v1'

export interface FormDraft {
  /** เวลาที่บันทึกร่างล่าสุด (ISO) */
  savedAt: string
  /** สเต็ปที่กรอกค้างไว้ (0-4) */
  step: number
  form: PropertyInput
}

/** ส่วนของ localStorage ที่ใช้จริง — แยกไว้เพื่อทดสอบได้โดยไม่ต้องมีเบราว์เซอร์ */
export interface DraftStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** localStorage ที่ใช้ได้จริง (โหมดส่วนตัว/ตั้งค่าบล็อกไว้ = null → ระบบทำงานต่อได้แค่ไม่มีร่าง) */
export function browserStore(): DraftStore | null {
  try {
    const s = window.localStorage
    const probe = `${KEY}.probe`
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

/** ค่าว่างทุกแบบ (null / '' / [] / {}) ถือว่า "ยังไม่ได้กรอก" */
function isBlank(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/** ฟิลด์ที่ต่างจากฟอร์มเปล่า — ใช้ตัดสินว่ามีอะไรให้เก็บเป็นร่างไหม */
export function changedFields(form: PropertyInput, empty: PropertyInput): (keyof PropertyInput)[] {
  // รวม key จากทั้งสองฝั่ง — ฟิลด์ที่มีในฟอร์มแต่ไม่มีในฟอร์มเปล่าก็ต้องนับว่ากรอกแล้ว
  const keys = new Set([...Object.keys(empty), ...Object.keys(form)]) as Set<keyof PropertyInput>
  return [...keys].filter((k) => {
    // วันที่บันทึกถูกเติมให้เป็นวันนี้อยู่แล้ว ไม่นับว่าผู้ใช้กรอกอะไร
    if (k === 'record_date') return false
    const a = form[k]
    const b = empty[k]
    if (isBlank(a) && isBlank(b)) return false
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
  })
}

export function loadDraft(store: DraftStore | null): FormDraft | null {
  if (!store) return null
  const raw = store.getItem(KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as FormDraft
    // ข้อมูลเพี้ยน/รูปแบบเก่า = ทิ้ง ดีกว่าเอามาใส่ฟอร์มแล้วพัง
    if (!d || typeof d !== 'object' || !d.form || typeof d.form !== 'object') return null
    return { savedAt: typeof d.savedAt === 'string' ? d.savedAt : '', step: Number(d.step) || 0, form: d.form }
  } catch {
    return null
  }
}

/**
 * เขียนร่างลง store — คืนร่างที่เขียน (null = ไม่มีอะไรให้เก็บ จึงลบร่างเดิมทิ้ง)
 * ส่ง now เข้ามาได้เพื่อให้ทดสอบเวลาได้แน่นอน
 */
export function saveDraft(
  store: DraftStore | null,
  form: PropertyInput,
  empty: PropertyInput,
  step: number,
  now: Date = new Date(),
): FormDraft | null {
  if (!store) return null
  if (changedFields(form, empty).length === 0) {
    store.removeItem(KEY)
    return null
  }
  const draft: FormDraft = { savedAt: now.toISOString(), step, form }
  try {
    store.setItem(KEY, JSON.stringify(draft))
    return draft
  } catch {
    // localStorage เต็ม/เขียนไม่ได้ — ไม่ต้องขัดจังหวะการกรอก
    return null
  }
}

export function clearDraft(store: DraftStore | null): void {
  store?.removeItem(KEY)
}

/** เวลาแบบสั้นสำหรับโชว์ข้าง ๆ ปุ่ม เช่น "14:35" (savedAt เพี้ยน = null) */
export function draftTimeText(savedAt: string): string | null {
  const d = new Date(savedAt)
  if (isNaN(d.getTime())) return null
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

/** ข้อความบอกว่าร่างเก่าแค่ไหน เช่น "เมื่อ 5 นาทีที่แล้ว" */
export function draftAgeText(savedAt: string, now: Date = new Date()): string {
  const d = new Date(savedAt)
  if (isNaN(d.getTime())) return 'ไม่ทราบเวลา'
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (mins < 1) return 'เมื่อครู่นี้'
  if (mins < 60) return `เมื่อ ${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `เมื่อ ${hrs} ชั่วโมงที่แล้ว`
  return `เมื่อ ${Math.floor(hrs / 24)} วันที่แล้ว`
}
