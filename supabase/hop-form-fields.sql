-- ฟิลด์ตาม spec ฟอร์ม "HOP Form" 5 STEP — ดู docs/hop-form-spec.md
-- รันซ้ำได้ (idempotent) — ทุกคอลัมน์ nullable ไม่กระทบข้อมูลเดิม
-- ต้องรันก่อน deploy โค้ดชุดนี้ ไม่งั้นการบันทึกทรัพย์ (ทุกประเภท) จะ error เพราะ insert คอลัมน์ที่ยังไม่มี

alter table public.properties
  -- STEP 1 ประเภททรัพย์
  add column if not exists agreement_type text,        -- ประเภทสัญญานายหน้า: ปิด (exclusive) / เปิด (open)
  add column if not exists contact_form text,          -- รูปแบบผู้ติดต่อ: บุคคล / นิติบุคคล
                                                       -- (lessor_status เปลี่ยนความหมายเป็น เจ้าของ / เอเจนต์ — ดู backfill ล่าง)
  -- STEP 3 รายละเอียด · ที่อยู่อาศัย
  add column if not exists house_direction text,       -- บ้านหันหน้าทิศ
  add column if not exists appliance_counts jsonb,     -- จำนวนเครื่องใช้ไฟฟ้าต่อชนิด {"แอร์":3,"เครื่องทำน้ำอุ่น":2}
  -- STEP 3 · ขนาดที่ดินแบบไทย (แทน land_area ที่เป็นข้อความ — ข้อความเดิมยังเก็บไว้ไม่ลบ)
  add column if not exists land_rai numeric,
  add column if not exists land_ngan numeric,
  add column if not exists land_wa numeric,
  -- STEP 3 · เชิงพาณิชย์
  add column if not exists rooms numeric,              -- จำนวนห้อง (ออฟฟิศ/โฮมออฟฟิศ)
  add column if not exists ceiling_height numeric,     -- ความสูงของเพดาน (ม.)
  -- STEP 3 · เชิงอุตสาหกรรม
  add column if not exists floor_height numeric,       -- ความสูงอาคารต่อชั้น (ม.)
  add column if not exists floor_raise_cm numeric,     -- พื้นอาคารยกสูง (ซม.)
  add column if not exists has_crane boolean,          -- มีเครน
  add column if not exists near_main_road boolean,     -- ใกล้ถนนหลัก
  add column if not exists standalone_building boolean,-- อาคารเดี่ยว
  add column if not exists container_access boolean,   -- รถตู้คอนเทนเนอร์เข้าได้
  add column if not exists wastewater_pond text,       -- บ่อบำบัดน้ำเสีย: มี / ไม่มี (โรงงาน)
  -- STEP 3 · ค่าสาธารณูปโภค — "ชำระกับใคร" ต่อรายการ (ราคาต่อหน่วยใช้คอลัมน์เดิม)
  add column if not exists water_payee text,           -- ค่าน้ำ ชำระกับ: การประปา / นิติบุคคล / เจ้าของ
  add column if not exists power_payee text,           -- ค่าไฟ ชำระกับ: การไฟฟ้า / นิติบุคคล / เจ้าของ
  add column if not exists common_fee_payee text,      -- ค่าส่วนกลาง+ขยะ ชำระกับ
  -- STEP 2/3 · สถานที่สำคัญใกล้เคียง + ระยะทาง [{"name":"โรงพยาบาล","km":2.5}]
  add column if not exists nearby_places jsonb,
  -- STEP 4 ราคา
  add column if not exists vat text;                   -- VAT: รวมแล้ว / ไม่รวม

-- ── backfill 1: แยก "สถานะผู้ติดต่อ" ออกจาก "รูปแบบผู้ติดต่อ" ──
-- เดิม lessor_status เก็บ บุคคล/บริษัท · ตาม spec ใหม่ = เจ้าของ/เอเจนต์
-- ย้ายค่าเดิมไป contact_form ก่อน แล้วเคลียร์ lessor_status ให้ผู้ใช้เลือกใหม่ (ไม่เดาแทน)
update public.properties
   set contact_form = case lessor_status when 'บริษัท' then 'นิติบุคคล' else 'บุคคล' end,
       lessor_status = null
 where contact_form is null
   and lessor_status in ('บุคคล', 'บริษัท');

-- ── backfill 2: คุณสมบัติโกดัง/โรงงาน จาก features[] → คอลัมน์ ใช่/ไม่ ──
-- ตั้งเป็น true เฉพาะที่ติ๊กไว้จริง · ที่ไม่ได้ติ๊กปล่อย null (ไม่รู้ ≠ ไม่มี)
update public.properties
   set has_crane           = coalesce(has_crane,           case when features @> array['เครนยกเหนือศรีษะ'] then true end),
       near_main_road      = coalesce(near_main_road,      case when features @> array['ใกล้ถนนหลัก'] then true end),
       standalone_building = coalesce(standalone_building,  case when features @> array['อาคารเดี่ยว'] then true end),
       container_access    = coalesce(container_access,    case when features @> array['รถหัวลากเข้าได้'] then true end)
 where features is not null;

-- ── backfill 3: เลิกใช้ประเภท "ครัวกลาง" (ตัดออกตามที่ตกลง) ──
-- ย้ายเป็นโกดัง + เก็บ "ครัวกลาง" ไว้ในการใช้งาน (usages) เพื่อไม่ให้ข้อมูลหาย
update public.properties
   set property_type = 'โกดัง',
       usages = (select array_agg(distinct u) from unnest(coalesce(usages, '{}') || array['ครัวกลาง']) u)
 where property_type = 'ครัวกลาง';

-- ทดสอบตัวเอง: คอลัมน์ครบ 21 ตัว และไม่มีทรัพย์ประเภทครัวกลางเหลือ
do $$
declare n int; leftover int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'properties'
    and column_name in (
      'agreement_type','contact_form','house_direction','appliance_counts',
      'land_rai','land_ngan','land_wa','rooms','ceiling_height',
      'floor_height','floor_raise_cm','has_crane','near_main_road','standalone_building',
      'container_access','wastewater_pond','water_payee','power_payee','common_fee_payee',
      'nearby_places','vat');
  if n <> 21 then
    raise exception 'คอลัมน์ไม่ครบ: ได้ % จาก 21', n;
  end if;
  select count(*) into leftover from public.properties where property_type = 'ครัวกลาง';
  if leftover > 0 then
    raise exception 'ยังมีทรัพย์ประเภทครัวกลางเหลือ % รายการ', leftover;
  end if;
  raise notice '✅ hop-form-fields: เพิ่มคอลัมน์ครบ 21 ตัว + ย้ายข้อมูลเดิมเรียบร้อย';
end $$;
