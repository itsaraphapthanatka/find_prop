import type { PropertyInput } from './types'

/** ป้ายชื่อฟิลด์ภาษาไทย (ตามแอป AppSheet ต้นแบบ) */
export const LABELS: Record<keyof PropertyInput, string> = {
  code: 'ลำดับที่',
  record_date: 'วันที่',
  photo_url: 'รูป',
  pic: 'PIC',
  lessor_status: 'สถานะ_ผู้ให้เช่า',
  lessor_company: 'ชื่อบริษัท_ผู้ให้เช่า',
  lessor_name: 'ชื่อผู้ให้เช่า',
  phone: 'เบอร์โทรติดต่อ',
  deed_no: 'เลขโฉนด',
  property_type: 'ประเภททรัพย์',
  listing_type: 'เช่า_หรือ_ขาย',
  subdistrict: 'แขวง/ตำบล',
  district: 'เขต/อำเภอ',
  province: 'จังหวัด',
  color_zone: 'พื้นที่สี',
  zones: 'โซน',
  nearby: 'อยู่ใกล้',
  land_wxd: 'กว้าง x ลึก ที่ดิน',
  land_area: 'ขนาด_ที่ดิน_รวม',
  building_area: 'ขนาด_อาคาร (ตร.ม.)',
  building_wxd: 'กว้าง x ลึก อาคาร',
  office_floors: 'จำนวน_ชั้น_ออฟฟิศ',
  office_area_fl1: 'ขนาด_ออฟฟิศ_ชั้น 1',
  office_area_total: 'ขนาด_ออฟฟิศ_รวม',
  building_area_total: 'ขนาด_อาคาร_รวม',
  rent_per_month: 'ราคา_เช่า/เดือน',
  price_per_sqm: 'ราคา/ตร.ม.',
  sale_price: 'ราคาขาย',
  withholding_tax: 'ภาษีหัก_ณ_ที่จ่าย',
  land_building_tax: 'ภาษีที่ดิน_และ_สิ่งปลูกสร้าง',
  common_fee: 'ค่าส่วนกลาง',
  electricity_rate: 'ค่าไฟฟ้า',
  water_rate: 'ค่าน้ำประปา',
  door_count: 'จำนวน_ประตู',
  door_wxh: 'ประตู_กว้าง x ยาว',
  building_height: 'ความสูง_อาคาร',
  floor_load: 'รับน้ำหนัก (ตัน)',
  power_system: 'ระบบ_ไฟฟ้า',
  water_per_day: 'จำนวนน้ำ_ที่ใช้ได้ต่อวัน',
  contract_period: 'ระยะ_เวลา_สัญญา',
  deposit: 'ค่าประกัน',
  advance_rent: 'ค่าเช่า_ล่วงหน้า',
  features: 'คุณสมบัติ',
  usages: 'การใช้งาน',
  lat: 'ละติจูด',
  lng: 'ลองจิจูด',
  map_url: 'แผนที่ (ลิงก์)',
  notes: 'หมายเหตุ_ถ้ามี',
}

/** ตัวเลือกตามแอปต้นแบบ (dropdown แบบเพิ่มเองได้ ใช้เป็นค่าเริ่มต้น) */
export const OPTIONS = {
  property_type: ['โรงงาน', 'โชว์รูม', 'โกดัง', 'ออฟฟิศ', 'ครัวกลาง'],
  listing_type: ['เช่า', 'ขาย', 'เช่า/ขาย'],
  lessor_status: ['บุคคล', 'บริษัท'],
  color_zone: ['เขียว', 'เหลือง', 'แดง', 'ม่วง'],
  zones: ['เขตปลอดอากร'],
  office_floors: ['1 ชั้น', '2 ชั้น', '3 ชั้น', '4 ชั้น', '5 ชั้น', '6 ชั้น', '7 ชั้น'],
  withholding_tax: ['รวมแล้ว', 'ไม่รวม'],
  land_building_tax: ['รวมแล้ว', 'ไม่รวม'],
  floor_load: ['3 ตัน', '5 ตัน'],
  power_system: ['3 Phase 15/45 amp (Upgradeable)', '3 Phase 30/100 amp (Upgradeable)'],
  contract_period: ['1 ปี', '3 ปี', '5 ปี'],
  deposit: ['1 เดือน', '2 เดือน', '3 เดือน'],
  advance_rent: ['1 เดือน', '2 เดือน', '3 เดือน'],
  features: [
    'พื้นที่สีม่วง',
    'พื้นที่สำนักงาน',
    'รถหัวลากเข้าได้',
    'พื้นยกระดับ',
    'ใกล้ถนนหลัก',
    'เครนยกเหนือศรีษะ',
    'อาคารเดี่ยว',
  ],
  usages: [
    'โชว์รูม',
    'สตูดิโอ',
    'โรงงาน',
    'อู่ซ่อมรถ',
    'ครัวกลาง',
    'โลจิสติกส์',
    'ห้องเก็บของ',
    'E-Commerce',
  ],
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('th-TH')
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}
