import { supabase } from './supabase'
import type { Property } from '../types'
import { formatNumber } from '../labels'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** เรียก LLM ผ่าน serverless proxy (/api/ai) — ต้องล็อกอินอยู่ */
export async function aiChat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, temperature }),
  })
  const body = (await res.json().catch(() => null)) as { content?: string; error?: string } | null
  if (!res.ok || !body?.content) {
    throw new Error(body?.error || `เรียก AI ไม่สำเร็จ (${res.status})`)
  }
  return body.content
}

/** ดึง JSON ก้อนแรกออกจากคำตอบโมเดล (ตัด code fence / ข้อความห่อหุ้มออก) */
export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

/** ข้อมูลทรัพย์แบบย่อ 1 บรรทัด ใช้เป็นแคตตาล็อกใน prompt (ประหยัด context) */
export function propertyBrief(p: Property): string {
  const parts = [
    p.code,
    [p.property_type, p.listing_type].filter(Boolean).join(' '),
    [p.subdistrict, p.district, p.province].filter(Boolean).join(' '),
  ]
  if (p.rent_per_month != null) parts.push(`เช่า ${formatNumber(p.rent_per_month)} บ./ด.`)
  if (p.sale_price != null) parts.push(`ขาย ${formatNumber(p.sale_price)} บ.`)
  if (p.building_area != null) parts.push(`อาคาร ${formatNumber(p.building_area)} ตร.ม.`)
  if (p.land_area) parts.push(`ที่ดิน ${p.land_area}`)
  if (p.building_height != null) parts.push(`สูง ${formatNumber(p.building_height)} ม.`)
  if (p.floor_load) parts.push(`พื้นรับ ${p.floor_load}`)
  if (p.power_system) parts.push(`ไฟ ${p.power_system}`)
  if (p.zones?.length) parts.push(`โซน ${p.zones.join('/')}`)
  if (p.features?.length) parts.push(p.features.slice(0, 6).join(', '))
  if (p.usages?.length) parts.push(`ใช้ทำ ${p.usages.slice(0, 4).join(', ')}`)
  if (p.nearby) parts.push(`ใกล้ ${p.nearby.slice(0, 80)}`)
  return parts.filter(Boolean).join(' | ')
}

/** ข้อมูลทรัพย์แบบละเอียด (หลายบรรทัด) สำหรับชอร์ตลิสต์เปรียบเทียบ */
export function propertyDetailText(p: Property): string {
  const line = (label: string, v: unknown) =>
    v === null || v === undefined || v === '' ? null : `  ${label}: ${String(v)}`
  return [
    `ทรัพย์ ${p.code}`,
    line('ประเภท', [p.property_type, p.listing_type].filter(Boolean).join(' / ')),
    line('ทำเล', [p.subdistrict, p.district, p.province].filter(Boolean).join(', ')),
    line('ค่าเช่า/เดือน', p.rent_per_month != null ? `${formatNumber(p.rent_per_month)} บาท` : null),
    line('ราคาขาย', p.sale_price != null ? `${formatNumber(p.sale_price)} บาท` : null),
    line('ราคา/ตร.ม.', p.price_per_sqm != null ? formatNumber(p.price_per_sqm) : null),
    line('พื้นที่ที่ดิน', p.land_area),
    line('พื้นที่อาคาร (ตร.ม.)', p.building_area != null ? formatNumber(p.building_area) : null),
    line('ความสูงอาคาร (ม.)', p.building_height),
    line('พื้นรับน้ำหนัก', p.floor_load),
    line('ระบบไฟฟ้า', p.power_system),
    line('จำนวน/ขนาดประตู', [p.door_count, p.door_wxh].filter(Boolean).join(' / ')),
    line('พื้นที่สีผังเมือง', p.color_zone),
    line('โซน', p.zones?.join(', ')),
    line('คุณสมบัติ', p.features?.join(', ')),
    line('เหมาะกับการใช้งาน', p.usages?.join(', ')),
    line('สัญญา/มัดจำ/ล่วงหน้า', [p.contract_period, p.deposit, p.advance_rent].filter(Boolean).join(' / ')),
    line('ค่าส่วนกลาง', p.common_fee),
    line('ใกล้เคียง', p.nearby),
    line('หมายเหตุ', p.notes),
  ]
    .filter(Boolean)
    .join('\n')
}
