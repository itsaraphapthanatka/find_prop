import { supabase } from './supabase'
import type { Property, PropertyInput } from '../types'
import { LABELS, OPTIONS, formatNumber } from '../labels'
import { ARRAY_FIELDS, BOOL_FIELDS, DATE_FIELDS, IMPORT_FIELDS, NUM_FIELDS, convertValue } from './importProps'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ฐาน URL ของ API — บนเว็บว่าง (เรียก /api/ai โดเมนเดียวกัน) ในแอปชี้กลับเว็บ prod เสมอ
import { API_BASE } from './native'

/** เรียก LLM ผ่าน serverless proxy (/api/ai) — ต้องล็อกอินอยู่
    บริการ AI สะดุดเป็นช่วงๆ กับ prompt ยาว จึง retry ให้เองหนึ่งครั้ง */
export async function aiChat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('ยังไม่ได้เข้าสู่ระบบ')

  let lastError = 'เรียก AI ไม่สำเร็จ'
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500))
    try {
      const res = await fetch(`${API_BASE}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages, temperature }),
      })
      const body = (await res.json().catch(() => null)) as { content?: string; error?: string } | null
      if (res.ok && body?.content) return body.content
      lastError = body?.error || `เรียก AI ไม่สำเร็จ (${res.status})`
      if (res.status === 401 || res.status === 400) break // ปัญหาฝั่งเรา retry ไปก็ไม่หาย
    } catch {
      lastError = 'เชื่อมต่อ AI ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่'
    }
  }
  throw new Error(lastError)
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
    // สถานะปิดงานสำคัญมาก — AI ต้องไม่เสนอทรัพย์ที่เช่า/ขายไปแล้วว่า "ว่าง"
    p.deal_status === 'rented' ? '⛔ปิดงาน:มีคนเช่าแล้ว' : p.deal_status === 'sold' ? '⛔ปิดงาน:ขายแล้ว' : null,
    [p.property_type, p.sub_type, p.listing_type].filter(Boolean).join(' '),
    p.project_name ? `โครงการ ${p.project_name}` : null,
    [p.subdistrict, p.district, p.province].filter(Boolean).join(' '),
  ]
  if (p.rent_per_month != null) parts.push(`เช่า ${formatNumber(p.rent_per_month)} บ./ด.`)
  if (p.sale_price != null) parts.push(`ขาย ${formatNumber(p.sale_price)} บ.`)
  if (p.building_area != null) parts.push(`อาคาร ${formatNumber(p.building_area)} ตร.ม.`)
  if (p.usable_area != null) parts.push(`ใช้สอย ${formatNumber(p.usable_area)} ตร.ม.`)
  if (p.bedrooms != null || p.bathrooms != null)
    parts.push(`${p.bedrooms ?? '?'} นอน ${p.bathrooms ?? '?'} น้ำ`)
  if (p.floors) parts.push(p.floors)
  if (p.furniture) parts.push(`เฟอร์ฯ ${p.furniture}`)
  // สัญญาเช่าใกล้หมด = โอกาสต่อสัญญา/หาผู้เช่าใหม่ — AI ควรหยิบมาเตือนได้
  if (p.contract_end) {
    const dLeft = Math.ceil((new Date(`${p.contract_end}T00:00:00`).getTime() - Date.now()) / 86400e3)
    if (dLeft < 0) parts.push(`⏰สัญญาหมดแล้ว (${p.contract_end})`)
    else if (dLeft <= 60) parts.push(`⏰สัญญาเหลือ ${dLeft} วัน (${p.contract_end})`)
  }
  const landSize = [
    p.land_rai != null ? `${formatNumber(p.land_rai)} ไร่` : null,
    p.land_ngan != null ? `${formatNumber(p.land_ngan)} งาน` : null,
    p.land_wa != null ? `${formatNumber(p.land_wa)} ตร.วา` : null,
  ].filter(Boolean).join(' ')
  if (landSize) parts.push(`ที่ดิน ${landSize}`)
  else if (p.land_area) parts.push(`ที่ดิน ${p.land_area}`)
  if (p.building_height != null) parts.push(`สูง ${formatNumber(p.building_height)} ม.`)
  if (p.floor_load) parts.push(`พื้นรับ ${p.floor_load}`)
  if (p.power_system) parts.push(`ไฟ ${p.power_system}`)
  if (p.zones?.length) parts.push(`โซน ${p.zones.join('/')}`)
  if (p.features?.length) parts.push(p.features.slice(0, 6).join(', '))
  if (p.usages?.length) parts.push(`ใช้ทำ ${p.usages.slice(0, 4).join(', ')}`)
  if (p.nearby) parts.push(`ใกล้ ${p.nearby.slice(0, 80)}`)
  return parts.filter(Boolean).join(' | ')
}

/** คู่มือฟิลด์สำหรับ prompt แกะข้อมูลจากคำพูด (key | ความหมาย | ชนิดค่า | ตัวเลือก) */
function fieldGuide(): string {
  return IMPORT_FIELDS
    .filter((f) => f !== 'photo_url') // รูปไม่ได้มาจากคำพูด
    .map((f) => {
      const opts = (OPTIONS as Partial<Record<keyof PropertyInput, string[]>>)[f]
      const kind = NUM_FIELDS.has(f)
        ? 'ตัวเลขล้วน'
        : ARRAY_FIELDS.has(f)
          ? 'array ของข้อความ'
          : DATE_FIELDS.has(f)
            ? 'วันที่ YYYY-MM-DD'
            : BOOL_FIELDS.has(f)
              ? 'true/false'
              : 'ข้อความ'
      return `${f} | ${LABELS[f]} | ${kind}${opts ? ` | ตัวเลือกแนะนำ: ${opts.join(', ')}` : ''}`
    })
    .join('\n')
}

/** แกะข้อมูลทรัพย์จากคำบอกเล่า (เสียงถอดเป็นข้อความ/ข้อความที่วางมา) → ฟิลด์ของฟอร์ม */
export async function aiExtractProperty(speech: string): Promise<Partial<PropertyInput>> {
  const raw = await aiChat(
    [
      {
        role: 'system',
        content:
          'คุณแกะข้อมูลอสังหาริมทรัพย์จากคำบอกเล่าภาษาไทยของนายหน้า ตอบเป็น JSON object เดียวล้วนๆ ใส่เฉพาะฟิลด์ที่ถูกพูดถึงจริง ห้ามเดาหรือแต่งเติมค่าที่ไม่ได้พูด',
      },
      {
        role: 'user',
        content: `ฟิลด์ทั้งหมดที่ใช้ได้ (key | ความหมาย | ชนิดค่า | ตัวเลือกถ้ามี):
${fieldGuide()}

กติกา:
- ตัวเลขที่พูดเป็นคำไทยให้แปลงเป็นตัวเลข เช่น "แปดหมื่นห้า" → 85000, "พันสอง" → 1200, "สองแสน" → 200000, "สามล้านครึ่ง" → 3500000
- ราคาหน่วยบาท พื้นที่หน่วยตารางเมตร ความสูงหน่วยเมตร — ตัวเลขล้วนไม่มีคอมมา/หน่วย
- ถ้าค่าที่พูดใกล้เคียงตัวเลือกแนะนำ ให้ใช้คำจากตัวเลือกนั้น
- แขวง/ตำบล เขต/อำเภอ จังหวัด แยกให้ถูกฟิลด์
- เบอร์โทรเป็นข้อความตัวเลขติดกัน
- จุดเด่น/สิ่งอำนวยความสะดวกของทรัพย์ (เช่น มีรถโฟล์คลิฟท์ มีเครน รปภ. ที่จอดรถ) ใส่ array ของ features ไม่ใช่ notes

คำบอกเล่าของนายหน้า:
"""${speech.trim()}"""

ตอบ JSON object เดียว โดย key เป็นชื่อฟิลด์ภาษาอังกฤษจากรายการด้านบนเท่านั้น`,
      },
    ],
    0.1,
  )
  const parsed = extractJson<Record<string, unknown>>(raw)
  if (!parsed) throw new Error('อ่านคำตอบ AI ไม่ได้ ลองใหม่อีกครั้ง')
  const out: Partial<PropertyInput> = {}
  for (const f of IMPORT_FIELDS) {
    if (!(f in parsed)) continue
    const v = parsed[f]
    if (v === null || v === undefined || v === '') continue
    const converted = convertValue(f, Array.isArray(v) ? v.join(', ') : v)
    if (converted !== null) (out as Record<string, unknown>)[f] = converted
  }
  return out
}

/** ข้อมูลทรัพย์แบบละเอียด (หลายบรรทัด) สำหรับชอร์ตลิสต์เปรียบเทียบ */
export function propertyDetailText(p: Property): string {
  const line = (label: string, v: unknown) =>
    v === null || v === undefined || v === '' ? null : `  ${label}: ${String(v)}`
  return [
    `ทรัพย์ ${p.code}`,
    line('ประเภท', [p.property_type, p.sub_type, p.listing_type].filter(Boolean).join(' / ')),
    line('หมู่บ้าน/โครงการ', p.project_name),
    line('ทำเล', [p.subdistrict, p.district, p.province].filter(Boolean).join(', ')),
    line('ค่าเช่า/เดือน', p.rent_per_month != null ? `${formatNumber(p.rent_per_month)} บาท` : null),
    line('ราคาขาย', p.sale_price != null ? `${formatNumber(p.sale_price)} บาท` : null),
    line('ราคา/ตร.ม.', p.price_per_sqm != null ? formatNumber(p.price_per_sqm) : null),
    line('พื้นที่ที่ดิน', p.land_area),
    line('พื้นที่อาคาร (ตร.ม.)', p.building_area != null ? formatNumber(p.building_area) : null),
    line('พื้นที่ใช้สอย (ตร.ม.)', p.usable_area != null ? formatNumber(p.usable_area) : null),
    line('ชั้น/ห้องนอน/ห้องน้ำ', [p.floors, p.bedrooms != null ? `${p.bedrooms} นอน` : null, p.bathrooms != null ? `${p.bathrooms} น้ำ` : null].filter(Boolean).join(' / ')),
    line('เฟอร์นิเจอร์', p.furniture),
    line('เครื่องใช้ไฟฟ้า', p.appliances?.join(', ')),
    line('ค่าโอน', p.transfer_fee),
    line('VAT', p.vat),
    line('ประเภทสัญญานายหน้า', p.agreement_type),
    line('ความสูงอาคาร (ม.)', p.building_height),
    line('ความสูงเพดาน (ม.)', p.ceiling_height),
    line('พื้นยกสูง (ซม.)', p.floor_raise_cm),
    line('พื้นรับน้ำหนัก', p.floor_load),
    line('ระบบไฟฟ้า', p.power_system),
    line('จำนวน/ขนาดประตู', [p.door_count, p.door_wxh].filter(Boolean).join(' / ')),
    line('สเปกพิเศษ', [
      p.has_crane ? 'มีเครน' : null,
      p.near_main_road ? 'ใกล้ถนนหลัก' : null,
      p.standalone_building ? 'อาคารเดี่ยว' : null,
      p.container_access ? 'คอนเทนเนอร์เข้าได้' : null,
      p.wastewater_pond === 'มี' ? 'มีบ่อบำบัดน้ำเสีย' : null,
    ].filter(Boolean).join(', ') || null),
    line('พื้นที่สีผังเมือง', p.color_zone),
    line('โซน', p.zones?.join(', ')),
    line('คุณสมบัติ', p.features?.join(', ')),
    line('เหมาะกับการใช้งาน', p.usages?.join(', ')),
    line('สัญญา/มัดจำ/ล่วงหน้า', [p.contract_period, p.deposit, p.advance_rent].filter(Boolean).join(' / ')),
    line('วันสิ้นสุดสัญญาเช่า', p.contract_end),
    line('ค่าส่วนกลาง', p.common_fee),
    line('ใกล้เคียง', p.nearby),
    line('เอกสารสิทธิ์', p.documents?.map((d) => d.name).filter(Boolean).join(', ')),
    line('หมายเหตุ', p.notes),
  ]
    .filter(Boolean)
    .join('\n')
}
