import { supabase } from './supabase'

// รีวิวลูกค้าบนหน้า landing (app_settings key 'testimonials') — super admin จัดการจากหน้า Super Admin
// ⚠️ ใส่ได้เฉพาะรีวิวจากลูกค้าจริงที่อนุญาตให้เผยแพร่แล้ว — หน้าเว็บโชว์เฉพาะรายการที่ติ๊ก "อนุญาตแล้ว" + "แสดง"
// (ไม่มีรีวิวที่เผยแพร่ได้ = ไม่โชว์ส่วนรีวิวเลย ดีกว่าโชว์ของปลอม)

export interface Testimonial {
  id: string
  name: string          // ชื่อลูกค้า (ตามที่ลูกค้ายินยอมให้ใช้ เช่น "คุณสมชาย ก.")
  role: string          // ตำแหน่ง / บริษัท เช่น "หัวหน้าทีม · JKP Property"
  quote: string         // ข้อความรีวิว (คำพูดของลูกค้าเอง)
  rating: number | null // 1–5 ดาว (ไม่บังคับ)
  consent: boolean      // ลูกค้าอนุญาตให้เผยแพร่แล้ว
  published: boolean    // แสดงบนหน้าเว็บ
}

export interface TestimonialSetting {
  /** แสดงตัวเลขการใช้งานจริง (ทรัพย์/ทีม/ผู้ใช้ จาก /api/stats — ไม่นับบัญชีทดสอบ) */
  showStats: boolean
  items: Testimonial[]
}

export const DEFAULT_TESTIMONIALS: TestimonialSetting = { showStats: true, items: [] }

/** รายการนี้แสดงบนหน้าเว็บได้ไหม — ต้องยินยอม + เปิดแสดง + มีชื่อและข้อความ */
export const isPublishable = (t: Testimonial) =>
  t.consent && t.published && t.name.trim() !== '' && t.quote.trim() !== ''

/** โหลดการตั้งค่ารีวิว — ไม่ throw (ยังไม่เคยตั้ง/โหลดพลาด → ค่าเริ่มต้น: ไม่มีรีวิว) */
export async function fetchTestimonials(): Promise<TestimonialSetting> {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'testimonials').maybeSingle()
    const v = (data?.value ?? null) as Partial<TestimonialSetting> | null
    if (!v) return DEFAULT_TESTIMONIALS
    const items = Array.isArray(v.items) ? v.items : []
    return {
      showStats: v.showStats !== false,
      items: items.map((t, i) => ({
        id: String(t?.id || `t${i}`),
        name: String(t?.name ?? ''),
        role: String(t?.role ?? ''),
        quote: String(t?.quote ?? ''),
        rating: Number.isInteger(t?.rating) && t.rating! >= 1 && t.rating! <= 5 ? t.rating! : null,
        consent: t?.consent === true,
        published: t?.published === true && t?.consent === true, // ไม่ได้รับอนุญาต = แสดงไม่ได้เสมอ
      })),
    }
  } catch {
    return DEFAULT_TESTIMONIALS
  }
}

export interface PublicStats { orgs_total: number; users_total: number; properties_total: number }

/** ตัวเลขการใช้งานจริงจาก /api/stats (แคชที่ edge 5 นาที) — พลาด = null (ไม่โชว์แถบตัวเลข) */
export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const r = await fetch('/api/stats', { headers: { accept: 'application/json' } })
    if (!r.ok) return null
    const j = await r.json()
    const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0)
    return { orgs_total: n(j.orgs_total), users_total: n(j.users_total), properties_total: n(j.properties_total) }
  } catch {
    return null
  }
}

/** ปัดตัวเลขให้อ่านง่ายแต่ไม่เกินความจริง: < 100 = ตัวเลขจริง · ≥ 100 = ปัดลงหลักร้อย + "+" (412 → 400+) */
export function roughCount(n: number): string {
  if (n < 100) return n.toLocaleString('th-TH')
  return `${(Math.floor(n / 100) * 100).toLocaleString('th-TH')}+`
}
