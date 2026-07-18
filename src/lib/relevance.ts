import type { Property } from '../types'

/* คัดทรัพย์ที่ "เกี่ยวกับบทสนทนา" ก่อนยัดเข้า prompt — prompt สั้นลง 3-4 เท่า
   = AI ตอบเร็วขึ้นทั้งระบบและรองรับคนพร้อมกันได้มากขึ้น (คอขวดคือ token throughput)
   วิธีให้คะแนน: เทียบค่าฟิลด์ของทรัพย์เป็น substring กับข้อความบทสนทนา
   (ภาษาไทยไม่ต้องตัดคำ เพราะคำสำคัญอย่าง "โกดัง"/"บางพลี" ปรากฏตรงตัวอยู่แล้ว) */

const STRONG = 3 // ประเภท/ทำเล — ชี้เจตนาชัดสุด
const MED = 2 // โซน/คุณสมบัติ/การใช้งาน/พื้นที่สี/เช่า-ขาย

function searchables(p: Property): { v: string; w: number }[] {
  const out: { v: string; w: number }[] = []
  const push = (v: string | null | undefined, w: number) => {
    if (v && v.trim().length >= 2) out.push({ v: v.trim().toLowerCase(), w })
  }
  push(p.property_type, STRONG)
  push(p.subdistrict, STRONG)
  push(p.district, STRONG)
  push(p.province, STRONG)
  push(p.listing_type, MED)
  push(p.color_zone, MED)
  for (const z of p.zones ?? []) push(z, MED)
  for (const f of p.features ?? []) push(f, MED)
  for (const u of p.usages ?? []) push(u, MED)
  return out
}

export interface RelevantPick {
  picked: Property[]
  total: number
  trimmed: boolean
}

/** เลือกทรัพย์ที่เกี่ยวข้องกับข้อความมากสุดไม่เกิน limit — ถ้าคะแนนเท่ากันเอาตัวใหม่ก่อน
    (พอร์ตเล็กกว่า limit = ส่งครบ ไม่คัด) */
export function selectRelevant(items: Property[], context: string, limit: number): RelevantPick {
  if (items.length <= limit) return { picked: items, total: items.length, trimmed: false }
  const q = context.toLowerCase()
  const scored = items.map((p) => {
    let s = 0
    if (p.code && q.includes(p.code.toLowerCase())) s += 10 // ถูกเอ่ยชื่อ = ต้องติดเสมอ
    for (const { v, w } of searchables(p)) if (q.includes(v)) s += w
    return { p, s }
  })
  scored.sort(
    (a, b) => b.s - a.s || (b.p.record_date ?? '').localeCompare(a.p.record_date ?? ''),
  )
  return { picked: scored.slice(0, limit).map((x) => x.p), total: items.length, trimmed: true }
}
