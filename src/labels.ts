import type { PropertyInput } from './types'

/** ป้ายชื่อฟิลด์ภาษาไทย (ตามแอป AppSheet ต้นแบบ) */
export const LABELS: Record<keyof PropertyInput, string> = {
  code: 'รหัสทรัพย์',
  record_date: 'วันที่',
  photo_url: 'รูป',
  photos: 'รูปภาพ',
  pic: 'PIC',
  // ฟิลด์ยังชื่อ lessor_* ใน DB (ยุคแรกมีแต่ปล่อยเช่า) แต่ความหมายจริงคือ "เจ้าของทรัพย์" ทั้งเช่าและขาย
  lessor_status: 'สถานะ_เจ้าของทรัพย์',
  lessor_company: 'ชื่อบริษัท_เจ้าของทรัพย์',
  lessor_name: 'ชื่อเจ้าของทรัพย์',
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
  contract_end: 'วันสิ้นสุดสัญญาเช่า',
  features: 'คุณสมบัติ',
  usages: 'การใช้งาน',
  sub_type: 'ประเภทย่อย',
  project_name: 'ชื่อหมู่บ้าน/โครงการ',
  usable_area: 'พื้นที่ใช้สอย (ตร.ม.)',
  floors: 'จำนวนชั้น',
  bedrooms: 'ห้องนอน',
  bathrooms: 'ห้องน้ำ',
  kitchens: 'ห้องครัว',
  maid_room: 'ห้องแม่บ้าน',
  parking_spaces: 'ที่จอดรถ (คัน)',
  appliances: 'เครื่องใช้ไฟฟ้าที่ให้',
  furniture: 'เฟอร์นิเจอร์',
  transfer_fee: 'ค่าใช้จ่ายวันโอนกรรมสิทธิ์',
  balcony_direction: 'ระเบียงหันทิศ',
  unit_building: 'อยู่อาคาร/ตึก',
  unit_floor: 'อยู่ชั้นที่',
  tower_floors: 'ตึกสูง (ชั้น)',
  tower_count: 'จำนวนตึกในโครงการ',
  far_ratio: 'FAR',
  osr_ratio: 'OSR',
  road_frontage: 'ติดถนนสาธารณะ',
  road_width: 'ถนนกว้าง (ม.)',
  utilities: 'ไฟฟ้า/น้ำประปาผ่านแปลง',
  video_url: 'วิดีโอ (ลิงก์)',
  documents: 'เอกสารสิทธิ์',
  lat: 'ละติจูด',
  lng: 'ลองจิจูด',
  map_url: 'แผนที่ (ลิงก์)',
  notes: 'หมายเหตุ_ถ้ามี',
}

/** ตัวเลือกตามแอปต้นแบบ (dropdown แบบเพิ่มเองได้ ใช้เป็นค่าเริ่มต้น) */
export const OPTIONS = {
  property_type: ['โรงงาน', 'โชว์รูม', 'โกดัง', 'ออฟฟิศ', 'ครัวกลาง', 'บ้าน', 'คอนโด', 'ที่ดินเปล่า'],
  listing_type: ['เช่า', 'ขาย', 'เช่า/ขาย'],
  lessor_status: ['บุคคล', 'บริษัท'],
  color_zone: ['เขียว', 'เหลือง', 'ส้ม', 'น้ำตาล', 'แดง', 'ชมพู', 'ม่วง'],
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
  // ── ที่อยู่อาศัย (บ้าน/คอนโด) ──
  sub_type: ['บ้านเดี่ยว', 'บ้านแฝด', 'ทาวน์เฮาส์/ทาวน์โฮม', 'สตูดิโอ', 'ดูเพล็กซ์', '1 ห้องนอน', '2 ห้องนอน'],
  floors: ['1 ชั้น', '2 ชั้น', '3 ชั้น', '4 ชั้น'],
  maid_room: ['มี', 'ไม่มี'],
  furniture: ['มีครบ', 'มีบางส่วน', 'บ้านเปล่า/ห้องเปล่า'],
  transfer_fee: ['ผู้ขายรับผิดชอบ 100%', 'คนละครึ่ง (50/50)', 'ผู้ซื้อรับผิดชอบ 100%'],
  balcony_direction: ['เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก', 'ตะวันออกเฉียงเหนือ', 'ตะวันออกเฉียงใต้', 'ตะวันตกเฉียงเหนือ', 'ตะวันตกเฉียงใต้'],
  appliances: ['แอร์', 'เครื่องทำน้ำอุ่น', 'ตู้เย็น', 'เครื่องซักผ้า', 'เตาไฟฟ้า', 'ไมโครเวฟ', 'ทีวี'],
  // ── ที่ดินเปล่า ──
  road_frontage: ['ไม่ติดถนน', 'ติด 1 ด้าน', 'ติด 2 ด้าน', 'ติดมากกว่า 2 ด้าน'],
  utilities: ['มีไฟฟ้า + น้ำประปา', 'มีเฉพาะไฟฟ้า', 'มีเฉพาะน้ำประปา', 'ยังไม่มี'],
}

/** ตัวเลือกประเภทย่อยแยกตามประเภททรัพย์ (ใช้ในฟอร์ม — OPTIONS.sub_type คือรวมทุกแบบสำหรับ AI/นำเข้า) */
export const SUB_TYPE_BY_TYPE: Record<string, string[]> = {
  'บ้าน': ['บ้านเดี่ยว', 'บ้านแฝด', 'ทาวน์เฮาส์/ทาวน์โฮม'],
  'คอนโด': ['สตูดิโอ', 'ดูเพล็กซ์', '1 ห้องนอน', '2 ห้องนอน'],
}

/** ชื่อเอกสารสิทธิ์ที่พบบ่อย (ตาม requirement.md) — ใช้เป็น datalist ให้เลือกหรือพิมพ์เอง */
export const DOC_NAME_OPTIONS = [
  'สำเนาโฉนดที่ดิน (ด้านหน้า)',
  'สำเนาโฉนดที่ดิน (ด้านหลัง)',
  'ใบ ทด.13 (ซื้อขายที่ดิน)',
  'ใบ อ.ช.2 (กรรมสิทธิ์ห้องชุด)',
  'สัญญาเช่า',
  'หนังสือมอบอำนาจ',
]

/** คุณสมบัติแนะนำสำหรับที่อยู่อาศัย (พื้นที่ส่วนกลางโครงการ ฯลฯ) */
export const RESIDENTIAL_FEATURES = [
  'สวน', 'สระว่ายน้ำ', 'ฟิตเนส', 'รปภ. 24 ชม.', 'กล้องวงจรปิด', 'ที่จอดรถส่วนกลาง', 'ใกล้ถนนหลัก',
]

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
