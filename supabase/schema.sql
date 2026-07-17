-- ============================================================
-- Find Prop — สคีมาฐานข้อมูล (รันใน Supabase Dashboard > SQL Editor)
-- ============================================================

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                -- ลำดับที่ เช่น JKP01
  record_date date,                         -- วันที่
  photo_url text,                           -- รูป
  pic text,                                 -- PIC
  lessor_status text,                       -- สถานะ_ผู้ให้เช่า
  lessor_company text,                      -- ชื่อบริษัท_ผู้ให้เช่า
  lessor_name text,                         -- ชื่อผู้ให้เช่า
  phone text,                               -- เบอร์โทรติดต่อ
  deed_no text,                             -- เลขโฉนด
  property_type text,                       -- ประเภททรัพย์
  listing_type text,                        -- เช่า_หรือ_ขาย
  subdistrict text,                         -- แขวง/ตำบล
  district text,                            -- เขต/อำเภอ
  province text,                            -- จังหวัด
  color_zone text,                          -- พื้นที่สี (ผังเมือง)
  zones text[],                             -- โซน
  nearby text,                              -- อยู่ใกล้
  land_wxd text,                            -- กว้าง x ลึก ที่ดิน
  land_area text,                           -- ขนาด_ที่ดิน_รวม
  building_area numeric,                    -- ขนาด_อาคาร (ตร.ม.)
  building_wxd text,                        -- กว้าง x ลึก อาคาร
  office_floors text,                       -- จำนวน_ชั้น_ออฟฟิศ
  office_area_fl1 numeric,                  -- ขนาด_ออฟฟิศ_ชั้น 1
  office_area_total numeric,                -- ขนาด_ออฟฟิศ_รวม
  building_area_total numeric,              -- ขนาด_อาคาร_รวม
  rent_per_month numeric,                   -- ราคา_เช่า/เดือน
  price_per_sqm numeric,                    -- ราคา/ตร.ม.
  sale_price numeric,                       -- ราคาขาย
  withholding_tax text,                     -- ภาษีหัก_ณ_ที่จ่าย
  land_building_tax text,                   -- ภาษีที่ดิน_และ_สิ่งปลูกสร้าง
  common_fee text,                          -- ค่าส่วนกลาง
  electricity_rate text,                    -- ค่าไฟฟ้า
  water_rate text,                          -- ค่าน้ำประปา
  door_count integer,                       -- จำนวน_ประตู
  door_wxh text,                            -- ประตู_กว้าง x ยาว
  building_height numeric,                  -- ความสูง_อาคาร (ม.)
  floor_load text,                          -- รับน้ำหนัก (ตัน)
  power_system text,                        -- ระบบ_ไฟฟ้า
  water_per_day text,                       -- จำนวนน้ำ_ที่ใช้ได้ต่อวัน
  contract_period text,                     -- ระยะ_เวลา_สัญญา
  deposit text,                             -- ค่าประกัน
  advance_rent text,                        -- ค่าเช่า_ล่วงหน้า
  features text[],                          -- คุณสมบัติ
  usages text[],                            -- การใช้งาน
  lat double precision,                     -- เลขพิกัด (ละติจูด)
  lng double precision,                     -- เลขพิกัด (ลองจิจูด)
  map_url text,                             -- แผนที่ (ลิงก์ Google Maps)
  notes text,                               -- หมายเหตุ_ถ้ามี
  created_at timestamptz not null default now()
);

-- Row Level Security: เปิดไว้และอนุญาต anon ทั้งอ่าน/เขียน (แอปใช้ภายในทีม)
-- ถ้าต้องการจำกัดสิทธิ์ภายหลัง ให้เปลี่ยน policy เหล่านี้เป็นเช็ค auth.uid()
alter table public.properties enable row level security;

drop policy if exists "anon read" on public.properties;
create policy "anon read" on public.properties for select using (true);

drop policy if exists "anon insert" on public.properties;
create policy "anon insert" on public.properties for insert with check (true);

drop policy if exists "anon update" on public.properties;
create policy "anon update" on public.properties for update using (true);

drop policy if exists "anon delete" on public.properties;
create policy "anon delete" on public.properties for delete using (true);

-- Storage bucket สำหรับรูปทรัพย์ (public อ่านได้)
insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos public read" on storage.objects;
create policy "photos public read" on storage.objects
  for select using (bucket_id = 'property-photos');

drop policy if exists "photos anon upload" on storage.objects;
create policy "photos anon upload" on storage.objects
  for insert with check (bucket_id = 'property-photos');

-- ============================================================
-- ข้อมูลตัวอย่าง (จากแอป AppSheet ต้นแบบ — JKP01 คือข้อมูลจริงที่เห็นในแอป)
-- ============================================================
insert into public.properties (
  code, record_date, pic, lessor_status, lessor_name, phone,
  property_type, listing_type, subdistrict, district, province,
  color_zone, zones, nearby,
  building_area, building_wxd, office_floors, office_area_fl1, building_area_total,
  rent_per_month, price_per_sqm, withholding_tax, land_building_tax,
  common_fee, electricity_rate, water_rate,
  door_count, door_wxh, building_height, floor_load, power_system,
  contract_period, deposit, advance_rent,
  features, usages, lat, lng, map_url
) values (
  'JKP01', '2024-04-29', 'Jacky', 'บุคคล', 'K. เบนซ์', '088-888-8888',
  'โชว์รูม', 'เช่า', 'ตำบล เทพารักษ์', 'เมืองสมุทรปราการ', 'สมุทรปราการ',
  'ม่วง', array['เขตปลอดอากร'], 'ปู่เจ้า, สำโรง, ทางด่วนปากน้ำ',
  1457, '23.5 x 62', '1 ชั้น', 100, 1557,
  350000, 240, 'รวมแล้ว', 'รวมแล้ว',
  '5000', '12', '20',
  1, '4.8 x 3.9', 12, '3 ตัน', '3 Phase 15/45 amp (Upgradeable)',
  '3 ปี', '3 เดือน', '1 เดือน',
  array['พื้นที่สำนักงาน', 'พื้นยกระดับ', 'ใกล้ถนนหลัก', 'อาคารเดี่ยว'],
  array['โชว์รูม', 'สตูดิโอ', 'ห้องเก็บของ', 'E-Commerce', 'โลจิสติกส์', 'อู่ซ่อมรถ', 'ครัวกลาง'],
  13.5990, 100.6180, 'https://maps.app.goo.gl/tv4h47oqsSBAPjVp9'
)
on conflict (code) do nothing;
