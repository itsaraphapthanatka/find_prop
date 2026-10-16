import type { PropertyInput } from '../types'

// ไฟล์ตัวอย่างนำเข้า "บ้าน/คอนโด" (ปุ่มในหน้านำเข้า) — เทมเพลต CSV เดิมเป็นตัวอย่างโกดัง
// ทีมที่เก็บข้อมูลที่อยู่อาศัยดาวน์โหลดไปกรอกต่อได้เลย
// หัวคอลัมน์สร้างจาก LABELS ตอนดาวน์โหลด → ป้ายเปลี่ยนเมื่อไหร่ ไฟล์ตัวอย่างก็ยังจับคู่อัตโนมัติได้เสมอ
// ข้อมูลสมมติล้วน (ชื่อ/เบอร์/โครงการไม่ใช่ของจริง) · รหัส TST- กันชนรหัสจริง (รหัสห้ามซ้ำทั้งระบบ)

type Cell = string | number | Date
type SampleRow = Partial<Record<keyof PropertyInput, Cell>>

export const RESIDENTIAL_SAMPLE_FIELDS: (keyof PropertyInput)[] = [
  'code', 'record_date', 'property_type', 'sub_type', 'listing_type', 'project_name', 'house_no',
  'unit_building', 'unit_floor', 'tower_floors', 'subdistrict', 'district', 'province', 'nearby',
  'usable_area', 'land_wa', 'floors', 'bedrooms', 'bathrooms', 'parking_spaces', 'maid_room',
  'furniture', 'appliances', 'balcony_direction', 'house_direction',
  'rent_per_month', 'sale_price', 'common_fee', 'deposit', 'advance_rent', 'contract_period',
  'lessor_status', 'lessor_name', 'phone', 'lat', 'lng',
]

export const RESIDENTIAL_SAMPLE_ROWS: SampleRow[] = [
  {
    code: 'TST-C01', record_date: new Date('2026-10-01'), property_type: 'คอนโด', sub_type: '1 ห้องนอน', listing_type: 'เช่า',
    project_name: 'คอนโดตัวอย่าง สุขุมวิท 77', unit_building: 'A', unit_floor: '12', tower_floors: 25,
    subdistrict: 'สวนหลวง', district: 'สวนหลวง', province: 'กรุงเทพมหานคร', nearby: 'BTS อ่อนนุช 400 ม.',
    usable_area: 32.5, bedrooms: 1, bathrooms: 1, furniture: 'มีครบ', appliances: 'แอร์, ตู้เย็น, เครื่องซักผ้า, ทีวี',
    balcony_direction: 'ตะวันออก', rent_per_month: 12000, common_fee: '45 บาท/ตร.ม.', deposit: '2 เดือน',
    advance_rent: '1 เดือน', contract_period: '1 ปี',
    lessor_status: 'เจ้าของ', lessor_name: 'คุณตัวอย่าง หนึ่ง', phone: '0800000001', lat: 13.7055, lng: 100.6012,
  },
  {
    code: 'TST-C02', record_date: new Date('2026-10-02'), property_type: 'คอนโด', sub_type: '2 ห้องนอน', listing_type: 'ขาย',
    project_name: 'คอนโดตัวอย่าง พระราม 9', unit_building: 'B', unit_floor: '28', tower_floors: 40,
    subdistrict: 'ห้วยขวาง', district: 'ห้วยขวาง', province: 'กรุงเทพมหานคร', nearby: 'MRT พระราม 9 200 ม.',
    usable_area: 68, bedrooms: 2, bathrooms: 2, furniture: 'มีบางส่วน', appliances: 'แอร์, เครื่องทำน้ำอุ่น',
    balcony_direction: 'ตะวันออกเฉียงเหนือ', sale_price: 7900000, common_fee: '55 บาท/ตร.ม.',
    lessor_status: 'เอเจนต์', lessor_name: 'คุณตัวอย่าง สอง', phone: '0800000002', lat: 13.7579, lng: 100.5655,
  },
  {
    code: 'TST-C03', record_date: new Date('2026-10-03'), property_type: 'คอนโด', sub_type: 'สตูดิโอ', listing_type: 'เช่า/ขาย',
    project_name: 'คอนโดตัวอย่าง บางนา', unit_building: 'C', unit_floor: '7', tower_floors: 18,
    subdistrict: 'บางนาใต้', district: 'บางนา', province: 'กรุงเทพมหานคร', nearby: 'ใกล้เซ็นทรัลบางนา',
    usable_area: 24, bedrooms: 0, bathrooms: 1, furniture: 'มีครบ', appliances: 'แอร์, ตู้เย็น',
    balcony_direction: 'ใต้', rent_per_month: 8500, sale_price: 1850000, common_fee: '40 บาท/ตร.ม.', deposit: '2 เดือน',
    lessor_status: 'เจ้าของ', lessor_name: 'คุณตัวอย่าง สาม', phone: '0800000003', lat: 13.6672, lng: 100.6213,
  },
  {
    code: 'TST-H01', record_date: new Date('2026-10-04'), property_type: 'บ้าน', sub_type: 'บ้านเดี่ยว', listing_type: 'ขาย',
    project_name: 'หมู่บ้านตัวอย่าง บางพลี', house_no: '99/12',
    subdistrict: 'บางพลีใหญ่', district: 'บางพลี', province: 'สมุทรปราการ', nearby: 'ใกล้เมกาบางนา 3 กม.',
    usable_area: 180, land_wa: 60, floors: '2', bedrooms: 4, bathrooms: 3, parking_spaces: 2, maid_room: 'มี',
    furniture: 'บ้านเปล่า/ห้องเปล่า', house_direction: 'เหนือ', sale_price: 5900000, common_fee: '1,200 บาท/เดือน',
    lessor_status: 'เจ้าของ', lessor_name: 'คุณตัวอย่าง สี่', phone: '0800000004', lat: 13.6105, lng: 100.7051,
  },
  {
    code: 'TST-H02', record_date: new Date('2026-10-05'), property_type: 'บ้าน', sub_type: 'ทาวน์เฮาส์/ทาวน์โฮม', listing_type: 'เช่า',
    project_name: 'ทาวน์โฮมตัวอย่าง ลาดกระบัง', house_no: '55/8',
    subdistrict: 'ลาดกระบัง', district: 'ลาดกระบัง', province: 'กรุงเทพมหานคร', nearby: 'ใกล้นิคมลาดกระบัง',
    usable_area: 120, land_wa: 20, floors: '3', bedrooms: 3, bathrooms: 2, parking_spaces: 1,
    furniture: 'มีบางส่วน', appliances: 'แอร์ 2 เครื่อง', house_direction: 'ตะวันออก', rent_per_month: 18000,
    deposit: '2 เดือน', advance_rent: '1 เดือน', contract_period: '1 ปี',
    lessor_status: 'เอเจนต์', lessor_name: 'คุณตัวอย่าง ห้า', phone: '0800000005', lat: 13.7271, lng: 100.7787,
  },
  {
    code: 'TST-H03', record_date: new Date('2026-10-06'), property_type: 'บ้าน', sub_type: 'บ้านแฝด', listing_type: 'เช่า/ขาย',
    project_name: 'หมู่บ้านตัวอย่าง ลำลูกกา', house_no: '120/4',
    subdistrict: 'ลาดสวาย', district: 'ลำลูกกา', province: 'ปทุมธานี', nearby: 'ใกล้ถนนลำลูกกา คลอง 4',
    usable_area: 150, land_wa: 40, floors: '2', bedrooms: 3, bathrooms: 3, parking_spaces: 2,
    furniture: 'มีครบ', appliances: 'แอร์ 3 เครื่อง, ตู้เย็น', house_direction: 'ใต้', rent_per_month: 22000, sale_price: 4200000,
    lessor_status: 'เจ้าของ', lessor_name: 'คุณตัวอย่าง หก', phone: '0800000006', lat: 13.9379, lng: 100.7343,
  },
]

/** แถบ "คำอธิบาย" ในไฟล์ตัวอย่าง — ตัวนำเข้าอ่านเฉพาะแถบแรก แถบนี้จึงไม่ถูกนำเข้า */
export const RESIDENTIAL_SAMPLE_NOTES: [string, string][] = [
  ['รหัสทรัพย์', 'จำเป็น · ห้ามซ้ำทั้งระบบ (รวมองค์กรอื่น) · ใช้ตัวนำเฉพาะทีมคุณ เช่น SCH-001 · ซ้ำกับรหัสในองค์กรตัวเอง = อัปเดตข้อมูลเดิม'],
  ['ประเภททรัพย์', 'บ้าน / คอนโด (ประเภทอื่น: ออฟฟิศ, โฮมออฟฟิศ, โชว์รูม, โกดัง, โรงงาน, ที่ดินเปล่า)'],
  ['ประเภทย่อย', 'บ้าน: บ้านเดี่ยว / บ้านแฝด / ทาวน์เฮาส์/ทาวน์โฮม · คอนโด: สตูดิโอ / ดูเพล็กซ์ / 1 ห้องนอน / 2 ห้องนอน'],
  ['สำหรับ (เช่า/ขาย)', 'เช่า / ขาย / เช่า/ขาย'],
  ['ตัวเลข', 'พื้นที่ ห้องนอน ห้องน้ำ ที่จอด ราคา — ใส่ตัวเลขล้วน (มีจุลภาค/฿ ได้ ระบบตัดให้)'],
  ['เครื่องใช้ไฟฟ้าที่ให้', 'หลายอย่างคั่นด้วยจุลภาค เช่น แอร์, ตู้เย็น'],
  ['วันที่ลงทรัพย์', 'ใส่เป็นวันที่ของ Excel หรือ 2026-10-01 หรือ 1/10/2569 ก็ได้'],
  ['ละติจูด / ลองจิจูด', 'ไม่บังคับ · หรือเพิ่มคอลัมน์ "ลิงก์ Google Maps" แล้วกด "เติมพิกัด" ในหน้ารายการทีหลัง'],
  ['คอลัมน์อื่น', 'ใช้หัวคอลัมน์ตามเทมเพลต CSV ได้ทุกช่อง · คอลัมน์ที่ระบบไม่รู้จัก จะให้เลือกจับคู่เองหรือข้าม'],
  ['ก่อนนำเข้าจริง', 'ลบแถวตัวอย่าง TST- ออก แล้วใส่ข้อมูลของคุณแทน'],
]
