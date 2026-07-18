import type { PropertyInput } from '../types'
import { LABELS } from '../labels'

/** ฟิลด์ที่นำเข้าได้ (ทุกฟิลด์ของทรัพย์) เรียงตามลำดับใน LABELS */
export const IMPORT_FIELDS = Object.keys(LABELS) as (keyof PropertyInput)[]

export const NUM_FIELDS = new Set<keyof PropertyInput>([
  'building_area', 'office_area_fl1', 'office_area_total', 'building_area_total',
  'rent_per_month', 'price_per_sqm', 'sale_price', 'door_count', 'building_height',
  'lat', 'lng',
])
export const ARRAY_FIELDS = new Set<keyof PropertyInput>(['zones', 'features', 'usages'])
export const DATE_FIELDS = new Set<keyof PropertyInput>(['record_date'])

/** ชื่อเรียกอื่นที่พบบ่อยในไฟล์จริง (นอกเหนือจากป้าย LABELS และชื่อฟิลด์อังกฤษ) */
const ALIASES: Record<string, keyof PropertyInput> = {
  'รหัส': 'code', 'รหัสทรัพย์': 'code', 'ลำดับ': 'code', 'no': 'code', 'id': 'code',
  'วันที่บันทึก': 'record_date', 'date': 'record_date',
  'รูปภาพ': 'photo_url', 'photo': 'photo_url', 'image': 'photo_url',
  'เบอร์โทร': 'phone', 'โทรศัพท์': 'phone', 'tel': 'phone',
  'ประเภท': 'property_type',
  'เช่าหรือขาย': 'listing_type', 'เช่า/ขาย': 'listing_type',
  'ตำบล': 'subdistrict', 'แขวง': 'subdistrict',
  'อำเภอ': 'district', 'เขต': 'district',
  'ค่าเช่า': 'rent_per_month', 'ค่าเช่า/เดือน': 'rent_per_month', 'ราคาเช่า': 'rent_per_month',
  'ราคา': 'sale_price',
  'latitude': 'lat', 'longitude': 'lng', 'long': 'lng',
  'พิกัด lat': 'lat', 'พิกัด lng': 'lng',
  'ลิงก์แผนที่': 'map_url', 'google maps': 'map_url', 'map': 'map_url',
  'หมายเหตุ': 'notes',
}

/** ปรับหัวคอลัมน์ให้เทียบกันได้ (ตัดช่องว่าง/ขีดล่าง/ตัวพิมพ์) */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, '')
}

/** จับคู่หัวคอลัมน์ในไฟล์ → ฟิลด์ของระบบอัตโนมัติ ('' = ไม่นำเข้า) */
export function autoMapColumns(headers: string[]): Record<string, keyof PropertyInput | ''> {
  const byLabel = new Map<string, keyof PropertyInput>()
  for (const f of IMPORT_FIELDS) {
    byLabel.set(normalizeHeader(LABELS[f]), f)
    byLabel.set(normalizeHeader(f), f)
  }
  for (const [alias, f] of Object.entries(ALIASES)) byLabel.set(normalizeHeader(alias), f)

  const used = new Set<keyof PropertyInput>()
  const mapping: Record<string, keyof PropertyInput | ''> = {}
  for (const h of headers) {
    const f = byLabel.get(normalizeHeader(h))
    if (f && !used.has(f)) {
      mapping[h] = f
      used.add(f)
    } else {
      mapping[h] = ''
    }
  }
  return mapping
}

/** แปลงวันที่หลายรูปแบบ → 'YYYY-MM-DD' (รองรับ พ.ศ. และ serial ของ Excel) */
export function parseDateValue(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate())
  }
  if (typeof raw === 'number' && isFinite(raw)) {
    // Excel serial date (จำนวนวันนับจาก 1899-12-30)
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const s = String(raw).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) // YYYY-MM-DD
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/) // D/M/Y (แบบไทย วันก่อนเดือน)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    return toIso(y, Number(m[2]), Number(m[1]))
  }
  return null
}

function toIso(y: number, mo: number, d: number): string | null {
  if (y > 2300) y -= 543 // ปี พ.ศ. → ค.ศ.
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** แปลงค่าดิบจากเซลล์ → ค่าตามชนิดของฟิลด์ */
export function convertValue(field: keyof PropertyInput, raw: unknown): PropertyInput[keyof PropertyInput] {
  if (raw === null || raw === undefined) return null
  if (DATE_FIELDS.has(field)) return parseDateValue(raw)
  if (NUM_FIELDS.has(field)) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : null
    const n = Number(String(raw).replace(/[,฿\s]/g, ''))
    return isFinite(n) && String(raw).trim() !== '' ? n : null
  }
  if (ARRAY_FIELDS.has(field)) {
    const items = String(raw).split(/[,|;]/).map((x) => x.trim()).filter(Boolean)
    return items.length ? items : null
  }
  const s = raw instanceof Date ? raw.toISOString() : String(raw).trim()
  return s === '' ? null : s
}

export interface ImportRow {
  rowNo: number                       // เลขแถวในไฟล์ (เริ่ม 2 = ถัดจากหัวตาราง)
  input: Partial<PropertyInput>
  code: string | null
}

/** แปลงแถวจากไฟล์ → ข้อมูลทรัพย์ตาม mapping ที่ผู้ใช้ยืนยัน */
export function rowsToProperties(
  rows: Record<string, unknown>[],
  mapping: Record<string, keyof PropertyInput | ''>,
): ImportRow[] {
  const cols = Object.entries(mapping).filter(([, f]) => f !== '') as [string, keyof PropertyInput][]
  return rows.map((row, i) => {
    const input: Partial<PropertyInput> = {}
    for (const [header, field] of cols) {
      const v = convertValue(field, row[header])
      if (v !== null) (input as Record<string, unknown>)[field] = v
    }
    return { rowNo: i + 2, input, code: (input.code as string | undefined)?.trim() || null }
  })
}

/** สร้างไฟล์เทมเพลต CSV หัวคอลัมน์ภาษาไทย + แถวตัวอย่าง (มี BOM ให้ Excel อ่านไทยถูก) */
export function buildTemplateCsv(): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const headers = IMPORT_FIELDS.map((f) => esc(LABELS[f]))
  const example: Partial<Record<keyof PropertyInput, string>> = {
    code: 'WH-001', record_date: '2026-07-01', property_type: 'โกดัง', listing_type: 'เช่า',
    lessor_name: 'คุณสมชาย', phone: '0812345678', subdistrict: 'บางพลีใหญ่', district: 'บางพลี',
    province: 'สมุทรปราการ', rent_per_month: '120000', building_area: '1500',
    zones: 'เขตปลอดอากร', features: 'พื้นที่สีม่วง, ใกล้ถนนหลัก', usages: 'โลจิสติกส์',
    lat: '13.601234', lng: '100.712345',
  }
  const row = IMPORT_FIELDS.map((f) => esc(example[f] ?? ''))
  return '﻿' + headers.join(',') + '\n' + row.join(',') + '\n'
}
