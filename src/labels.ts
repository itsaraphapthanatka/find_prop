import type { PropertyInput } from './types'

/**
 * ป้ายชื่อฟิลด์ภาษาไทยแบบอ่านรู้เรื่อง — เลิกใช้ชื่อคอลัมน์ยุค AppSheet ที่มีขีดล่าง
 * (เช่น 'ขนาด_อาคาร' → 'ขนาดอาคาร (ตร.ม.)') · ใส่หน่วยไว้ในป้ายเลยเพื่อไม่ต้องเดา
 * ป้ายเก่ายังนำเข้าไฟล์ได้ผ่าน LEGACY_LABELS ใน src/lib/importProps.ts
 */
export const LABELS: Record<keyof PropertyInput, string> = {
  code: 'รหัสทรัพย์',
  record_date: 'วันที่ลงทรัพย์',
  photo_url: 'รูปทรัพย์',
  photos: 'คลังรูป',
  pic: 'ผู้ดูแลทรัพย์',
  // ฟิลด์ยังชื่อ lessor_* ใน DB (ยุคแรกมีแต่ปล่อยเช่า) แต่ความหมายจริงคือ "ผู้ติดต่อ" ทั้งเช่าและขาย
  // lessor_status = เจ้าของ/เอเจนต์ · contact_form = บุคคล/นิติบุคคล (แยกกันตาม HOP Form STEP 1)
  lessor_status: 'สถานะผู้ติดต่อ',
  lessor_company: 'ชื่อบริษัท/นิติบุคคล',
  lessor_name: 'ชื่อผู้ติดต่อ',
  phone: 'เบอร์โทรติดต่อ',
  deed_no: 'เลขโฉนด',
  property_type: 'ประเภททรัพย์',
  listing_type: 'สำหรับ (เช่า/ขาย)',
  agreement_type: 'ประเภทสัญญา',
  contact_form: 'รูปแบบผู้ติดต่อ',
  subdistrict: 'แขวง/ตำบล',
  district: 'เขต/อำเภอ',
  province: 'จังหวัด',
  color_zone: 'พื้นที่สีผังเมือง',
  zones: 'โซนพิเศษ',
  nearby: 'อยู่ใกล้',
  land_wxd: 'ที่ดิน กว้าง x ลึก',
  land_area: 'ขนาดที่ดินรวม (ข้อความเดิม)',
  building_area: 'ขนาดอาคาร (ตร.ม.)',
  building_wxd: 'อาคาร กว้าง x ลึก',
  office_floors: 'จำนวนชั้นออฟฟิศ',
  office_area_fl1: 'ขนาดออฟฟิศ ชั้น 1 (ตร.ม.)',
  office_area_total: 'ขนาดออฟฟิศรวม (ตร.ม.)',
  building_area_total: 'ขนาดอาคารรวม (ตร.ม.)',
  rent_per_month: 'ค่าเช่า/เดือน (บาท)',
  price_per_sqm: 'ราคาต่อ ตร.ม. (บาท)',
  sale_price: 'ราคาขาย (บาท)',
  withholding_tax: 'ภาษีหัก ณ ที่จ่าย',
  land_building_tax: 'ภาษีที่ดินและสิ่งปลูกสร้าง',
  common_fee: 'ค่าส่วนกลาง',
  electricity_rate: 'ค่าไฟ (บาท/หน่วย)',
  water_rate: 'ค่าน้ำ (บาท/หน่วย)',
  door_count: 'จำนวนประตู (บาน)',
  door_wxh: 'ขนาดประตู กว้าง x สูง',
  building_height: 'ความสูงอาคาร (ม.)',
  floor_load: 'พื้นรับน้ำหนัก (ตัน)',
  power_system: 'ระบบไฟฟ้า',
  water_per_day: 'ปริมาณน้ำใช้ได้ต่อวัน',
  contract_period: 'ระยะเวลาสัญญา',
  deposit: 'เงินประกัน',
  advance_rent: 'ค่าเช่าล่วงหน้า',
  contract_end: 'วันสิ้นสุดสัญญาเช่า',
  features: 'คุณสมบัติ',
  usages: 'เหมาะกับการใช้งาน',
  sub_type: 'ประเภทย่อย',
  project_name: 'ชื่อหมู่บ้าน/โครงการ',
  usable_area: 'พื้นที่ใช้สอย (ตร.ม.)',
  floors: 'จำนวนชั้น',
  bedrooms: 'จำนวนห้องนอน',
  bathrooms: 'จำนวนห้องน้ำ',
  kitchens: 'จำนวนห้องครัว',
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
  // ── HOP Form STEP 3 ──
  house_direction: 'บ้านหันหน้าทิศ',
  appliance_counts: 'จำนวนเครื่องใช้ไฟฟ้า',
  land_rai: 'ที่ดิน (ไร่)',
  land_ngan: 'ที่ดิน (งาน)',
  land_wa: 'ที่ดิน (ตร.วา)',
  rooms: 'จำนวนห้อง (ทั้งหมด)',
  ceiling_height: 'ความสูงเพดาน (ม.)',
  floor_height: 'ความสูงอาคารต่อชั้น (ม.)',
  floor_raise_cm: 'พื้นอาคารยกสูง (ซม.)',
  has_crane: 'มีเครน',
  near_main_road: 'ใกล้ถนนหลัก',
  standalone_building: 'อาคารเดี่ยว',
  container_access: 'รถตู้คอนเทนเนอร์เข้าได้',
  wastewater_pond: 'บ่อบำบัดน้ำเสีย',
  water_payee: 'ค่าน้ำ ชำระกับ',
  power_payee: 'ค่าไฟ ชำระกับ',
  common_fee_payee: 'ค่าส่วนกลาง ชำระกับ',
  nearby_places: 'สถานที่สำคัญใกล้เคียง',
  vat: 'VAT',
  video_url: 'ลิงก์วิดีโอ',
  documents: 'เอกสารสิทธิ์',
  lat: 'ละติจูด',
  lng: 'ลองจิจูด',
  map_url: 'ลิงก์ Google Maps',
  notes: 'หมายเหตุ',
}

/** ตัวเลือกตามแอปต้นแบบ (dropdown แบบเพิ่มเองได้ ใช้เป็นค่าเริ่มต้น) */
export const OPTIONS = {
  // เรียงตามหมวดใน PROPERTY_CATEGORIES (ที่อยู่อาศัย → พาณิชย์ → อุตสาหกรรม → ที่ดิน)
  property_type: ['บ้าน', 'คอนโด', 'ออฟฟิศ', 'โฮมออฟฟิศ', 'โชว์รูม', 'โกดัง', 'โรงงาน', 'ที่ดินเปล่า'],
  listing_type: ['เช่า', 'ขาย', 'เช่า/ขาย'],
  agreement_type: ['ปิด', 'เปิด'],
  lessor_status: ['เจ้าของ', 'เอเจนต์'],
  contact_form: ['บุคคล', 'นิติบุคคล'],
  // สีผังเมือง — รวมทั้งผังกทม.และผัง EEC (ใส่เฉพาะ "สี" ไม่ผูกความหมาย เพราะสีเดียวกัน
  // คนละผังความหมายต่างกัน เช่น ส้ม กทม.=ที่อยู่อาศัยปานกลาง แต่ EEC=ชุมชนเมือง)
  color_zone: [
    'เหลือง',
    'เหลืองอ่อน',
    'เหลืองมีเส้นแยงเขียว',
    'ส้ม',
    'ส้มอ่อนมีจุดขาว',
    'น้ำตาล',
    'น้ำตาลอ่อน',
    'แดง',
    'ชมพู',
    'ม่วง',
    'ม่วงอ่อนมีจุดขาว',
    'เม็ดมะปราง',
    'เขียว',
    'เขียวอ่อน',
    'เขียวมีเส้นแยงฟ้า',
    'เขียวอ่อนมีเส้นแยงขาว',
    'ขาวมีกรอบเส้นแยงเขียว',
    'น้ำเงิน',
  ],
  // โซนเชิงอุตสาหกรรม (HOP Form STEP 2) — ค่าเก่า "เขตปลอดอากร" ยังโชว์เป็น chip ได้ตามเดิม
  zones: ['ปลอดอากร (Free Zone)', 'การนิคมอุตสาหกรรม (กนอ.)', 'วัตถุอันตราย (DG Zone)'],
  office_floors: ['1 ชั้น', '2 ชั้น', '3 ชั้น', '4 ชั้น', '5 ชั้น', '6 ชั้น', '7 ชั้น'],
  withholding_tax: ['รวมแล้ว', 'ไม่รวม'],
  land_building_tax: ['รวมแล้ว', 'ไม่รวม'],
  vat: ['รวมแล้ว', 'ไม่รวม'],
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
  floors: ['1 ชั้น', '2 ชั้น', '3 ชั้น', '4 ชั้น', '5 ชั้น'],
  maid_room: ['มี', 'ไม่มี'],
  house_direction: ['เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก', 'ตะวันออกเฉียงเหนือ', 'ตะวันออกเฉียงใต้', 'ตะวันตกเฉียงเหนือ', 'ตะวันตกเฉียงใต้'],
  wastewater_pond: ['มี', 'ไม่มี'],
  // "ชำระกับใคร" ของค่าสาธารณูปโภค (HOP Form STEP 3)
  water_payee: ['การประปา', 'นิติบุคคล/โครงการ', 'เจ้าของ/ผู้ให้เช่า'],
  power_payee: ['การไฟฟ้า', 'นิติบุคคล/โครงการ', 'เจ้าของ/ผู้ให้เช่า'],
  common_fee_payee: ['นิติบุคคล/โครงการ', 'เจ้าของ/ผู้ให้เช่า', 'หน่วยงานที่เกี่ยวข้อง'],
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

/** หมวดทรัพย์ 2 ระดับตาม HOP Form (docs/hop-form-spec.md) — หมวดเป็นตัวคุมว่าฟอร์มโชว์ฟิลด์ชุดไหน */
export const PROPERTY_CATEGORIES: { name: string; types: string[] }[] = [
  { name: 'ที่อยู่อาศัย', types: ['บ้าน', 'คอนโด'] },
  { name: 'เชิงพาณิชย์', types: ['ออฟฟิศ', 'โฮมออฟฟิศ', 'โชว์รูม'] },
  { name: 'เชิงอุตสาหกรรม', types: ['โกดัง', 'โรงงาน'] },
  { name: 'ที่ดิน', types: ['ที่ดินเปล่า'] },
]

/** หมวดของประเภททรัพย์ (ประเภทที่พิมพ์เพิ่มเอง/ไม่รู้จัก = null) */
export function categoryOf(propertyType: string | null | undefined): string | null {
  if (!propertyType) return null
  return PROPERTY_CATEGORIES.find((c) => c.types.includes(propertyType))?.name ?? null
}

/**
 * ชุดฟิลด์ของฟอร์ม/หน้ารายละเอียด — 1 ค่าต่อ 1 หน้าใน HOP Form
 * โชว์รูมใช้ชุดเดียวกับโกดัง (ยืนยันกับผู้ใช้แล้ว) แต่ยังอยู่หมวดเชิงพาณิชย์
 * ประเภทที่ไม่รู้จัก/ยังไม่เลือก = industrial (ชุดเดิมของแอปยุคโกดัง-โรงงาน)
 */
export type PropertyKind = 'house' | 'condo' | 'office' | 'homeoffice' | 'industrial' | 'land'
export function kindOf(propertyType: string | null | undefined): PropertyKind {
  switch (propertyType) {
    case 'บ้าน': return 'house'
    case 'คอนโด': return 'condo'
    case 'ออฟฟิศ': return 'office'
    case 'โฮมออฟฟิศ': return 'homeoffice'
    case 'ที่ดินเปล่า': return 'land'
    default: return 'industrial'
  }
}

/** สถานที่สำคัญที่มักถามถึง (HOP Form STEP 2 — ระบุระยะเป็นกิโลเมตร) */
export const NEARBY_PLACE_OPTIONS = [
  'โรงพยาบาล', 'โรงเรียน', 'ตลาดสด', 'ห้างสรรพสินค้า', 'รถไฟฟ้า/สถานี', 'ทางด่วน', 'สนามบิน',
]

/** ชื่อเอกสารสิทธิ์ที่พบบ่อย (ตาม requirement.md) — ใช้เป็น datalist ให้เลือกหรือพิมพ์เอง */
export const DOC_NAME_OPTIONS = [
  'สำเนาโฉนดที่ดิน (ด้านหน้า)',
  'สำเนาโฉนดที่ดิน (ด้านหลัง)',
  'ใบ ทด.13 (ซื้อขายที่ดิน)',
  'ใบ อ.ช.2 (กรรมสิทธิ์ห้องชุด)',
  'สัญญาเช่า',
  'หนังสือมอบอำนาจ',
]

/** พื้นที่ส่วนกลาง/สิ่งอำนวยความสะดวกของโครงการ — ใช้กับที่อยู่อาศัยและออฟฟิศ/โฮมออฟฟิศ */
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
