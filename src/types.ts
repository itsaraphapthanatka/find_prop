/** เอกสารสิทธิ์แนบกับทรัพย์ (เก็บใน storage ถังเดียวกับรูป โฟลเดอร์ docs/) */
export interface PropertyDoc {
  name: string
  url: string
}

/** สถานที่สำคัญใกล้ทรัพย์ + ระยะทาง (ตาม HOP Form STEP 2) */
export interface NearbyPlace {
  name: string
  km: number | null
}

/** จำนวนเครื่องใช้ไฟฟ้าที่ให้ แยกตามชนิด เช่น { "แอร์": 3 } */
export type ApplianceCounts = Record<string, number>

export interface Property {
  id: string
  code: string
  record_date: string | null
  photo_url: string | null
  /** แกลเลอรีรูป (สูงสุด 10) — photos[0] = รูปปก = photo_url */
  photos: string[] | null
  pic: string | null
  /** สถานะผู้ติดต่อ: เจ้าของ / เอเจนต์ (ค่าเดิม บุคคล/บริษัท ย้ายไป contact_form แล้ว) */
  lessor_status: string | null
  lessor_company: string | null
  lessor_name: string | null
  phone: string | null
  deed_no: string | null
  property_type: string | null
  listing_type: string | null
  // ── HOP Form STEP 1 (ดู docs/hop-form-spec.md) ──
  /** ประเภทสัญญานายหน้า: ปิด (exclusive) / เปิด (open) */
  agreement_type: string | null
  /** รูปแบบผู้ติดต่อ: บุคคล / นิติบุคคล */
  contact_form: string | null
  subdistrict: string | null
  district: string | null
  province: string | null
  color_zone: string | null
  zones: string[] | null
  nearby: string | null
  land_wxd: string | null
  land_area: string | null
  building_area: number | null
  building_wxd: string | null
  office_floors: string | null
  office_area_fl1: number | null
  office_area_total: number | null
  building_area_total: number | null
  rent_per_month: number | null
  price_per_sqm: number | null
  sale_price: number | null
  withholding_tax: string | null
  land_building_tax: string | null
  common_fee: string | null
  electricity_rate: string | null
  water_rate: string | null
  door_count: number | null
  door_wxh: string | null
  building_height: number | null
  floor_load: string | null
  power_system: string | null
  water_per_day: string | null
  contract_period: string | null
  deposit: string | null
  advance_rent: string | null
  /** วันสิ้นสุดสัญญาเช่าปัจจุบัน (YYYY-MM-DD) — ใช้แจ้งเตือนสัญญาใกล้หมด */
  contract_end: string | null
  features: string[] | null
  usages: string[] | null
  // ── ฟิลด์ที่อยู่อาศัย (บ้าน/คอนโด) — ดู requirement.md ──
  sub_type: string | null
  /** บ้านเลขที่ (คอนโดใช้เป็นเลขที่ห้อง) — ทุกหมวดยกเว้นที่ดินเปล่า · text เพราะมีขีด/ทับ เช่น 88/123 */
  house_no: string | null
  project_name: string | null
  usable_area: number | null
  floors: string | null
  bedrooms: number | null
  bathrooms: number | null
  kitchens: number | null
  maid_room: string | null
  parking_spaces: number | null
  appliances: string[] | null
  furniture: string | null
  transfer_fee: string | null
  balcony_direction: string | null
  unit_building: string | null
  unit_floor: string | null
  tower_floors: number | null
  tower_count: number | null
  // ── ฟิลด์ที่ดินเปล่า ──
  far_ratio: string | null
  osr_ratio: string | null
  road_frontage: string | null
  road_width: number | null
  utilities: string | null
  // ── HOP Form STEP 3 รายละเอียด (ดู docs/hop-form-spec.md) ──
  /** บ้านหันหน้าทิศ */
  house_direction: string | null
  /** จำนวนเครื่องใช้ไฟฟ้าต่อชนิด — คู่กับ appliances ที่เป็นรายการชนิด */
  appliance_counts: ApplianceCounts | null
  /** ขนาดที่ดินแบบไทย (แทน land_area ที่เป็นข้อความ — ข้อความเดิมยังอ่านได้) */
  land_rai: number | null
  land_ngan: number | null
  land_wa: number | null
  /** จำนวนห้อง (ออฟฟิศ/โฮมออฟฟิศ) */
  rooms: number | null
  /** ความสูงของเพดาน (ม.) */
  ceiling_height: number | null
  /** ความสูงอาคารต่อชั้น (ม.) */
  floor_height: number | null
  /** พื้นอาคารยกสูง (ซม.) */
  floor_raise_cm: number | null
  has_crane: boolean | null
  near_main_road: boolean | null
  standalone_building: boolean | null
  container_access: boolean | null
  /** บ่อบำบัดน้ำเสีย: มี / ไม่มี (โรงงาน) */
  wastewater_pond: string | null
  /** ค่าน้ำ/ค่าไฟ/ค่าส่วนกลาง ชำระกับใคร (ราคาต่อหน่วยอยู่ที่ water_rate/electricity_rate/common_fee) */
  water_payee: string | null
  power_payee: string | null
  common_fee_payee: string | null
  /** สถานที่สำคัญใกล้เคียง + ระยะทาง (nearby = ข้อความอิสระ ยังใช้ได้ตามเดิม) */
  nearby_places: NearbyPlace[] | null
  /** VAT: รวมแล้ว / ไม่รวม */
  vat: string | null
  video_url: string | null
  documents: PropertyDoc[] | null
  lat: number | null
  lng: number | null
  map_url: string | null
  notes: string | null
  created_at?: string
  /** องค์กรเจ้าของแถว (RLS เติมให้อัตโนมัติตอนสร้าง) */
  org_id?: string | null
  /** ชื่อองค์กรเจ้าของแถว (จับคู่ตอนอ่าน) — ใช้แสดงเฉพาะมุมมอง super admin */
  org_name?: string | null
  /** ผู้ลงทรัพย์ (auth.users.id) — DB เติมให้อัตโนมัติตอนสร้าง (default auth.uid()) */
  created_by?: string | null
  /** ชื่อผู้ลงทรัพย์ (จับคู่ตอนอ่านผ่าน org_member_names) — read-only สำหรับแสดงผล */
  created_by_name?: string | null
  /** เบอร์โทรผู้ลงทรัพย์ (มาจาก properties_view) — ให้บทบาทที่ถูกปิดข้อมูลเจ้าของติดต่อกันเองได้ */
  created_by_phone?: string | null
  /** ข้อมูลติดต่อเจ้าของทรัพย์ถูกปิดตามสิทธิ์ (ไม่ใช่ "ไม่มีข้อมูล") — จาก properties_view */
  contact_masked?: boolean | null
  /** พิกัด/ลิงก์แผนที่ถูกปิดตามสิทธิ์ — จาก properties_view */
  location_masked?: boolean | null
  /** บ้านเลขที่/เลขที่ห้องถูกปิดตามสิทธิ์ (เห็นเฉพาะของตัวเอง) — จาก properties_view */
  house_no_masked?: boolean | null
  /** สถานะงาน: open = เปิดงานอยู่ · rented = ปิดงาน (มีคนเช่าแล้ว) · sold = ปิดงาน (ขายแล้ว) */
  deal_status?: 'open' | 'rented' | 'sold' | null
}

export type PropertyInput = Omit<
  Property,
  'id' | 'created_at' | 'org_id' | 'org_name' | 'created_by' | 'created_by_name' | 'deal_status'
  | 'created_by_phone' | 'contact_masked' | 'location_masked' | 'house_no_masked'
>

/** จุดแวะในรูทเยี่ยมชม (อ้างถึงทรัพย์ด้วย id) */
export interface VisitStop {
  property_id: string
  note?: string
}

/** แผนเยี่ยมชมทรัพย์ของลูกค้าหนึ่งราย */
export interface VisitPlan {
  id: string
  org_id?: string
  title: string
  customer_name: string | null
  requirement: string | null
  visit_date: string | null
  stops: VisitStop[]
  created_at?: string
  updated_at?: string
}

/** บทวิเคราะห์เปรียบเทียบจาก AI ต่อชอร์ตลิสต์หนึ่งชุด (เก็บลง shortlists.ai) */
export interface CompareResult {
  intro?: string
  items?: { code: string; pros?: string[]; cons?: string[]; fit?: string }[]
  recommendation?: string
}

/** ชอร์ตลิสต์เสนอลูกค้า — ชุดทรัพย์ที่เลือกเปรียบเทียบ + บทวิเคราะห์ที่บันทึกไว้ */
export interface Shortlist {
  id: string
  org_id?: string
  title: string
  customer_name: string | null
  requirement: string | null
  codes: string[]
  ai: CompareResult | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
  /** ลิงก์แชร์ให้ลูกค้า (null = ยังไม่แชร์) — ดู supabase/shortlist-share.sql */
  share_token?: string | null
  share_expires_at?: string | null
  shared_at?: string | null
  share_views?: number | null
  /** สำเนาข้อมูลทรัพย์ที่ตรึงไว้ตอนสร้างลิงก์ — ลูกค้าเห็นราคานี้ ไม่ใช่ราคาปัจจุบัน */
  snapshot?: SharedItem[] | null
  snapshot_at?: string | null
}

/** ทรัพย์ 1 รายการในสำเนาที่ตรึงไว้ (ชุดฟิลด์เดียวกับ shortlist_items ใน SQL) */
export type SharedItem = Partial<Property> & { code: string }
