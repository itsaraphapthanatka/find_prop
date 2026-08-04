import type { PropertyInput } from '../types'
import { LABELS } from '../labels'

/**
 * ฟิลด์ที่นำเข้าได้ เรียงตามลำดับใน LABELS
 * ยกเว้นฟิลด์ที่ไม่ใช่ค่าจากเซลล์เดียว: documents (ไฟล์แนบ),
 * nearby_places / appliance_counts (โครงสร้างซ้อน กรอกในฟอร์มเท่านั้น)
 */
const NON_IMPORTABLE = new Set<keyof PropertyInput>(['documents', 'nearby_places', 'appliance_counts'])
export const IMPORT_FIELDS = (Object.keys(LABELS) as (keyof PropertyInput)[]).filter(
  (f) => !NON_IMPORTABLE.has(f),
)

export const NUM_FIELDS = new Set<keyof PropertyInput>([
  'building_area', 'office_area_fl1', 'office_area_total', 'building_area_total',
  'rent_per_month', 'price_per_sqm', 'sale_price', 'door_count', 'building_height',
  'usable_area', 'bedrooms', 'bathrooms', 'kitchens', 'parking_spaces',
  'tower_floors', 'tower_count', 'road_width',
  'land_rai', 'land_ngan', 'land_wa', 'rooms', 'ceiling_height', 'floor_height', 'floor_raise_cm',
  'lat', 'lng',
])
export const ARRAY_FIELDS = new Set<keyof PropertyInput>(['zones', 'features', 'usages', 'appliances'])
export const DATE_FIELDS = new Set<keyof PropertyInput>(['record_date', 'contract_end'])
/** ฟิลด์ ใช่/ไม่ (สเปกโกดัง-โรงงาน) — รับได้ทั้ง ใช่/มี/true/1 */
export const BOOL_FIELDS = new Set<keyof PropertyInput>([
  'has_crane', 'near_main_road', 'standalone_building', 'container_access',
])

/**
 * ป้ายชื่อฟิลด์ยุคก่อน (แบบมีขีดล่างตาม AppSheet) — ไฟล์/เทมเพลตที่ดาวน์โหลดไปก่อนหน้านี้
 * ยังนำเข้าได้เหมือนเดิม ไม่ต้องแก้หัวคอลัมน์
 */
const LEGACY_LABELS: Record<string, keyof PropertyInput> = {
  'วันที่': 'record_date',
  'รูป': 'photo_url',
  'PIC': 'pic',
  'สถานะ_เจ้าของทรัพย์': 'lessor_status',
  'ชื่อบริษัท_เจ้าของทรัพย์': 'lessor_company',
  'ชื่อเจ้าของทรัพย์': 'lessor_name',
  'เช่า_หรือ_ขาย': 'listing_type',
  'พื้นที่สี': 'color_zone',
  'โซน': 'zones',
  'กว้าง x ลึก ที่ดิน': 'land_wxd',
  'ขนาด_ที่ดิน_รวม': 'land_area',
  'ขนาด_อาคาร (ตร.ม.)': 'building_area',
  'กว้าง x ลึก อาคาร': 'building_wxd',
  'จำนวน_ชั้น_ออฟฟิศ': 'office_floors',
  'ขนาด_ออฟฟิศ_ชั้น 1': 'office_area_fl1',
  'ขนาด_ออฟฟิศ_รวม': 'office_area_total',
  'ขนาด_อาคาร_รวม': 'building_area_total',
  'ราคา_เช่า/เดือน': 'rent_per_month',
  'ราคา/ตร.ม.': 'price_per_sqm',
  'ภาษีหัก_ณ_ที่จ่าย': 'withholding_tax',
  'ภาษีที่ดิน_และ_สิ่งปลูกสร้าง': 'land_building_tax',
  'ค่าไฟฟ้า': 'electricity_rate',
  'ค่าน้ำประปา': 'water_rate',
  'จำนวน_ประตู': 'door_count',
  'ประตู_กว้าง x ยาว': 'door_wxh',
  'ความสูง_อาคาร': 'building_height',
  'รับน้ำหนัก (ตัน)': 'floor_load',
  'ระบบ_ไฟฟ้า': 'power_system',
  'จำนวนน้ำ_ที่ใช้ได้ต่อวัน': 'water_per_day',
  'ระยะ_เวลา_สัญญา': 'contract_period',
  'ค่าประกัน': 'deposit',
  'ค่าเช่า_ล่วงหน้า': 'advance_rent',
  'การใช้งาน': 'usages',
  'ห้องนอน': 'bedrooms',
  'ห้องน้ำ': 'bathrooms',
  'ห้องครัว': 'kitchens',
  'วิดีโอ (ลิงก์)': 'video_url',
  'แผนที่ (ลิงก์)': 'map_url',
  'หมายเหตุ_ถ้ามี': 'notes',
  'ชื่อหมู่บ้าน/โครงการ': 'project_name',
}

/** ชื่อเรียกอื่นที่พบบ่อยในไฟล์จริง (นอกเหนือจากป้าย LABELS และชื่อฟิลด์อังกฤษ) */
const ALIASES: Record<string, keyof PropertyInput> = {
  'รหัส': 'code', 'รหัสทรัพย์': 'code', 'ลำดับ': 'code', 'no': 'code', 'id': 'code',
  'วันที่บันทึก': 'record_date', 'date': 'record_date',
  'รูปภาพ': 'photo_url', 'photo': 'photo_url', 'image': 'photo_url',
  'เบอร์โทร': 'phone', 'โทรศัพท์': 'phone', 'tel': 'phone',
  // ชื่อป้ายเดิมยุค "ผู้ให้เช่า" / "เจ้าของทรัพย์" — ไฟล์/เทมเพลตเก่ายังนำเข้าได้
  'สถานะ_ผู้ให้เช่า': 'lessor_status', 'ชื่อบริษัท_ผู้ให้เช่า': 'lessor_company',
  'ชื่อผู้ให้เช่า': 'lessor_name', 'เจ้าของ': 'lessor_name', 'ชื่อเจ้าของ': 'lessor_name',
  'สถานะ_เจ้าของทรัพย์': 'lessor_status', 'ชื่อบริษัท_เจ้าของทรัพย์': 'lessor_company',
  'ชื่อเจ้าของทรัพย์': 'lessor_name',
  'ประเภท': 'property_type',
  'เช่าหรือขาย': 'listing_type', 'เช่า/ขาย': 'listing_type', 'สำหรับ': 'listing_type',
  'ตำบล': 'subdistrict', 'แขวง': 'subdistrict',
  'อำเภอ': 'district', 'เขต': 'district',
  'ค่าเช่า': 'rent_per_month', 'ค่าเช่า/เดือน': 'rent_per_month', 'ราคาเช่า': 'rent_per_month',
  'ราคา': 'sale_price',
  'latitude': 'lat', 'longitude': 'lng', 'long': 'lng',
  'พิกัด lat': 'lat', 'พิกัด lng': 'lng',
  'ลิงก์แผนที่': 'map_url', 'google maps': 'map_url', 'map': 'map_url',
  'หมายเหตุ': 'notes',
  // บ้านเลขที่ = เลขที่ห้อง (คอนโด) — ช่องเดียวกัน ไฟล์จริงเรียกได้หลายแบบ
  'เลขที่ห้อง': 'house_no', 'เลขห้อง': 'house_no', 'ห้องเลขที่': 'house_no',
  // ไม่ใส่ 'เลขที่' เดี่ยวๆ เพราะไฟล์จริงมักใช้เป็นลำดับแถว (→ code) ไม่ใช่เลขที่บ้าน
  'เลขที่บ้าน': 'house_no', 'บ้านเลขที่/เลขที่ห้อง': 'house_no',
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
  // ป้ายเดิม → ป้ายใหม่ ก่อน แล้วค่อยทับด้วย ALIASES (ชื่อเรียกที่คนใช้กันจริง)
  for (const [old, f] of Object.entries(LEGACY_LABELS)) byLabel.set(normalizeHeader(old), f)
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
  if (BOOL_FIELDS.has(field)) {
    if (typeof raw === 'boolean') return raw
    const s = String(raw).trim().toLowerCase()
    if (s === '') return null
    if (['ใช่', 'มี', 'true', '1', 'y', 'yes'].includes(s)) return true
    if (['ไม่', 'ไม่ใช่', 'ไม่มี', 'false', '0', 'n', 'no'].includes(s)) return false
    return null
  }
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
