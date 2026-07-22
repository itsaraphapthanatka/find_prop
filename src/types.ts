export interface Property {
  id: string
  code: string
  record_date: string | null
  photo_url: string | null
  /** แกลเลอรีรูป (สูงสุด 10) — photos[0] = รูปปก = photo_url */
  photos: string[] | null
  pic: string | null
  lessor_status: string | null
  lessor_company: string | null
  lessor_name: string | null
  phone: string | null
  deed_no: string | null
  property_type: string | null
  listing_type: string | null
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
  features: string[] | null
  usages: string[] | null
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
}

export type PropertyInput = Omit<
  Property,
  'id' | 'created_at' | 'org_id' | 'org_name' | 'created_by' | 'created_by_name'
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
