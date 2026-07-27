-- ฟิลด์ทรัพย์ที่อยู่อาศัย (บ้าน/คอนโด) + ที่ดินเปล่า ตาม requirement.md
-- รันซ้ำได้ (idempotent) — ทุกคอลัมน์ nullable ไม่กระทบข้อมูล/ทรัพย์เดิม
-- ต้องรันก่อน deploy โค้ดชุดนี้ ไม่งั้นการบันทึกทรัพย์ (ทุกประเภท) จะ error เพราะ insert คอลัมน์ที่ยังไม่มี

alter table public.properties
  -- บ้าน/คอนโด
  add column if not exists sub_type text,            -- ประเภทย่อย: บ้านเดี่ยว/แฝด/ทาวน์เฮาส์ · สตูดิโอ/ดูเพล็กซ์/1-2 ห้องนอน
  add column if not exists project_name text,        -- ชื่อหมู่บ้าน/โครงการ
  add column if not exists usable_area numeric,      -- พื้นที่ใช้สอย (ตร.ม.)
  add column if not exists floors text,              -- จำนวนชั้น (บ้าน)
  add column if not exists bedrooms numeric,
  add column if not exists bathrooms numeric,
  add column if not exists kitchens numeric,
  add column if not exists maid_room text,           -- มี/ไม่มี
  add column if not exists parking_spaces numeric,   -- ที่จอดรถ (คัน)
  add column if not exists appliances text[],        -- เครื่องใช้ไฟฟ้าที่ให้
  add column if not exists furniture text,           -- มีครบ/มีบางส่วน/บ้านเปล่า
  add column if not exists transfer_fee text,        -- ค่าโอน: ผู้ขาย 100% / 50-50 / ผู้ซื้อ 100%
  -- คอนโด
  add column if not exists balcony_direction text,
  add column if not exists unit_building text,       -- อยู่อาคาร/ตึกไหน
  add column if not exists unit_floor text,          -- ห้องอยู่ชั้นที่
  add column if not exists tower_floors numeric,     -- ตึกสูงกี่ชั้น
  add column if not exists tower_count numeric,      -- โครงการมีกี่ตึก
  -- ที่ดินเปล่า
  add column if not exists far_ratio text,
  add column if not exists osr_ratio text,
  add column if not exists road_frontage text,       -- ไม่ติด/ติด 1 ด้าน/ติด 2 ด้าน
  add column if not exists road_width numeric,       -- ถนนกว้าง (เมตร)
  add column if not exists utilities text,           -- ไฟฟ้า/ประปาผ่านแปลง
  -- ทุกประเภท
  add column if not exists video_url text;

-- ทดสอบตัวเอง: คอลัมน์ครบ 23 ตัว
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'properties'
    and column_name in (
      'sub_type','project_name','usable_area','floors','bedrooms','bathrooms','kitchens',
      'maid_room','parking_spaces','appliances','furniture','transfer_fee',
      'balcony_direction','unit_building','unit_floor','tower_floors','tower_count',
      'far_ratio','osr_ratio','road_frontage','road_width','utilities','video_url');
  if n <> 23 then
    raise exception 'คอลัมน์ไม่ครบ: ได้ % จาก 23', n;
  end if;
  raise notice '✅ residential-fields: เพิ่มคอลัมน์ครบ 23 ตัวแล้ว';
end $$;
