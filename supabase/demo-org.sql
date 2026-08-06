-- ============================================================
-- องค์กรเดโม "Demo Estate" + ทรัพย์ตัวอย่าง 14 รายการ (DM-001…DM-014)
-- 10 รายการเชิงพาณิชย์/อุตสาหกรรม + บ้าน/ทาวน์เฮาส์/คอนโด/ที่ดินเปล่า อย่างละ 1
-- ใช้ทดสอบมุมมอง super (ป้าย/ตัวกรององค์กร) และเดโมขายแพลตฟอร์ม
-- รันใน Supabase SQL Editor — รันซ้ำได้ (ล้างทรัพย์ DM-% เดิมก่อนใส่ใหม่)
-- ⚠️ ต้องรัน residential-fields.sql ก่อน (DM-011…014 ใช้คอลัมน์ชุดใหม่)
--
-- เจ้าของทรัพย์เดโม = admin@demo.com (แอดมินของ Demo Estate)
--   · สร้างบัญชี admin@demo.com ก่อน (หน้า "ทีม" ในแอปตอนสวมสิทธิ์ Demo Estate หรือ Supabase Dashboard)
--     แล้วรันไฟล์นี้ → จะตั้งให้เป็นแอดมิน Demo Estate + ยกทรัพย์เดโมให้เป็นเจ้าของอัตโนมัติ
--   · ถ้ายังไม่มี admin@demo.com → ยกให้ super ไปก่อน (สร้างแล้วรันไฟล์นี้ซ้ำเพื่อยกให้ถูกคน)
--   → ทรัพย์เดโมจึง "ไม่กำพร้า" ลูกทีมที่ตั้งเป็น "เห็นเฉพาะของตัวเอง" จะไม่เห็นทรัพย์เดโม
--
-- ลบทิ้งทั้งชุด: delete from properties where code like 'DM-%';
--               delete from organizations where name = 'Demo Estate';
-- ============================================================
do $$
declare
  v_org   uuid;
  v_owner uuid;
begin
  -- กันเคสรันไฟล์นี้ก่อน property-visibility.sql — ให้มีคอลัมน์เจ้าของแน่นอน
  alter table public.properties
    add column if not exists created_by uuid references auth.users(id) on delete set null;

  select id into v_org from public.organizations where name = 'Demo Estate';
  if v_org is null then
    insert into public.organizations (name, plan, sub_status, sub_expires_at)
    values ('Demo Estate', 'pro', 'active', (current_date + interval '1 year')::date)
    returning id into v_org;
  end if;
  -- องค์กรเดโมต้องไม่ถูกนับในหน้ายอดสมัครสาธารณะ /stats (ดู supabase/public-stats.sql)
  -- ตั้งตรงนี้ด้วย เผื่อรันไฟล์นี้ก่อน public-stats.sql (คอลัมน์ยังไม่มี → ข้ามไป ไม่ error)
  begin
    update public.organizations set internal = true where id = v_org;
  exception when undefined_column then null;
  end;

  -- เจ้าของทรัพย์เดโม: admin@demo.com ถ้ามี (ตั้งให้เป็นแอดมินของ Demo Estate ด้วย)
  -- ไม่มีก็ยกให้ super คนแรกไปก่อน กันทรัพย์กำพร้า
  select id into v_owner from public.profiles where email = 'admin@demo.com';
  if v_owner is not null then
    -- บทบาท 'owner' (ยุคใหม่ 8 บทบาท — เดิมชื่อ 'admin' ซึ่งตอนนี้ผิด constraint)
    -- และต้องมีแถวใน memberships ด้วย ไม่ใช่แค่ profiles.org_id — current_org() อ่านจาก
    -- memberships คู่กับ active_org_id ถ้าไม่มีแถว จะล็อกอินเข้าไปแล้วไม่เห็นข้อมูลอะไรเลย
    insert into public.memberships (user_id, org_id, role, active, see_all_properties)
    values (v_owner, v_org, 'owner', true, true)
    on conflict (user_id, org_id) do update
      set role = 'owner', active = true, see_all_properties = true;
    update public.profiles
    set org_id = v_org, active_org_id = v_org, role = 'owner', active = true
    where id = v_owner;
  else
    select id into v_owner from public.profiles
    where is_super = true order by created_at asc limit 1;
  end if;

  delete from public.properties where code like 'DM-%';

  insert into public.properties
    (org_id, code, record_date, pic, lessor_status, lessor_name, phone,
     property_type, listing_type, subdistrict, district, province,
     color_zone, zones, nearby,
     building_area, building_height, rent_per_month, price_per_sqm, sale_price,
     floor_load, power_system, contract_period, deposit, advance_rent,
     features, usages, lat, lng, notes)
  values
    (v_org, 'DM-001', current_date - 5, 'Demo', 'บุคคล', 'คุณสมศักดิ์', '0812340001',
     'โกดัง', 'เช่า', 'บางพลีใหญ่', 'บางพลี', 'สมุทรปราการ',
     'เหลือง', array['บางนา-ตราด'], 'บางนา-ตราด กม.10, วงแหวนกาญจนาภิเษก',
     1200, 8, 96000, 80, null,
     '3 ตัน', '3 Phase 30/100 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['ใกล้ถนนหลัก', 'รถหัวลากเข้าได้', 'มี รปภ.'], array['โลจิสติกส์', 'ห้องเก็บของ', 'E-Commerce'],
     13.6051, 100.7063, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-002', current_date - 20, 'Demo', 'บริษัท', 'คุณวรรณา', '0812340002',
     'โรงงาน', 'เช่า', 'แพรกษา', 'เมืองสมุทรปราการ', 'สมุทรปราการ',
     'ม่วง', array['นิคมอุตสาหกรรมบางปู'], 'ถนนแพรกษา, สุขุมวิทสายเก่า',
     2400, 10, 180000, 75, null,
     '5 ตัน', '3 Phase 30/100 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['พื้นที่สีม่วง', 'เครนยกเหนือศรีษะ', 'อาคารเดี่ยว'], array['โรงงาน', 'โลจิสติกส์'],
     13.5702, 100.6421, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-003', current_date - 45, 'Demo', 'บุคคล', 'คุณประเสริฐ', '0812340003',
     'โชว์รูม', 'เช่า', 'บางนา', 'บางนา', 'กรุงเทพมหานคร',
     'แดง', null, 'ถนนบางนา-ตราด กม.3, BTS อุดมสุข',
     800, 6, 152000, 190, null,
     '3 ตัน', '3 Phase 15/45 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['ติดถนนใหญ่', 'หน้ากว้าง', 'พื้นที่สำนักงาน'], array['โชว์รูม', 'ศูนย์บริการ'],
     13.6680, 100.6343, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-004', current_date - 70, 'Demo', 'บริษัท', 'คุณอรทัย', '0812340004',
     'ออฟฟิศ', 'เช่า', 'บางแก้ว', 'บางพลี', 'สมุทรปราการ',
     null, null, 'เมกาบางนา, วงแหวนกาญจนาภิเษก',
     350, null, 45500, 130, null,
     null, '3 Phase 15/45 amp (Upgradeable)', '1 ปี', '2 เดือน', '1 เดือน',
     array['พื้นที่สำนักงาน', 'ที่จอดรถ'], array['สำนักงาน'],
     13.6329, 100.6636, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-005', current_date - 95, 'Demo', 'บุคคล', 'คุณนภาพร', '0812340005',
     'ครัวกลาง', 'เช่า', 'ลาดกระบัง', 'ลาดกระบัง', 'กรุงเทพมหานคร',
     null, null, 'สนามบินสุวรรณภูมิ, มอเตอร์เวย์',
     260, 4, 52000, 200, null,
     null, '3 Phase 15/45 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['บ่อดักไขมัน', 'ระบบระบายอากาศ'], array['ครัวกลาง'],
     13.7223, 100.7801, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-006', current_date - 120, 'Demo', 'บริษัท', 'คุณธีรพงษ์', '0812340006',
     'โกดัง', 'ขาย', 'ศีรษะจรเข้ใหญ่', 'บางเสาธง', 'สมุทรปราการ',
     'เหลือง', null, 'ถนนบางนา-ตราด กม.23, ABAC บางนา',
     3000, 9, null, null, 42000000,
     '5 ตัน', '3 Phase 30/100 amp (Upgradeable)', null, null, null,
     array['อาคารเดี่ยว', 'รถหัวลากเข้าได้', 'ใกล้ถนนหลัก'], array['โลจิสติกส์', 'โรงงาน'],
     13.5895, 100.7952, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-007', current_date - 150, 'Demo', 'บุคคล', 'คุณจินตนา', '0812340007',
     'โกดัง', 'เช่า', 'เทพารักษ์', 'เมืองสมุทรปราการ', 'สมุทรปราการ',
     'เขียว', null, 'ถนนเทพารักษ์ กม.5, ศรีนครินทร์',
     550, 6, 38500, 70, null,
     '3 ตัน', '3 Phase 15/45 amp (Upgradeable)', '1 ปี', '2 เดือน', '1 เดือน',
     array['ใกล้ถนนหลัก'], array['ห้องเก็บของ', 'E-Commerce'],
     13.6018, 100.6250, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-008', current_date - 10, 'Demo', 'บริษัท', 'คุณกิตติ', '0812340008',
     'โรงงาน', 'เช่า/ขาย', 'บางปูใหม่', 'เมืองสมุทรปราการ', 'สมุทรปราการ',
     'ม่วง', array['นิคมอุตสาหกรรมบางปู'], 'สุขุมวิทสายเก่า, นิคมบางปู',
     5200, 12, 390000, 75, 65000000,
     '5 ตัน', '3 Phase 30/100 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['พื้นที่สีม่วง', 'เครนยกเหนือศรีษะ', 'พื้นยกระดับ', 'มี รปภ.'], array['โรงงาน', 'โลจิสติกส์'],
     13.5389, 100.6598, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-009', current_date - 35, 'Demo', 'บุคคล', 'คุณมานพ', '0812340009',
     'โชว์รูม', 'เช่า', 'หนองบอน', 'ประเวศ', 'กรุงเทพมหานคร',
     null, null, 'ถนนศรีนครินทร์, ซีคอนสแควร์',
     1100, 7, 220000, 200, null,
     '3 ตัน', '3 Phase 15/45 amp (Upgradeable)', '3 ปี', '3 เดือน', '1 เดือน',
     array['ติดถนนใหญ่', 'หน้ากว้าง', 'ที่จอดรถ'], array['โชว์รูม', 'ศูนย์บริการ', 'สตูดิโอ'],
     13.6851, 100.6485, 'ข้อมูลเดโมสำหรับทดสอบระบบ'),

    (v_org, 'DM-010', current_date - 60, 'Demo', 'บริษัท', 'คุณสุภาพร', '0812340010',
     'ออฟฟิศ', 'ขาย', 'ปากเกร็ด', 'ปากเกร็ด', 'นนทบุรี',
     null, null, 'เมืองทองธานี, ทางด่วนแจ้งวัฒนะ',
     480, null, null, null, 18900000,
     null, '3 Phase 15/45 amp (Upgradeable)', null, null, null,
     array['พื้นที่สำนักงาน', 'ที่จอดรถ', 'ใกล้ทางด่วน'], array['สำนักงาน'],
     13.9126, 100.5504, 'ข้อมูลเดโมสำหรับทดสอบระบบ');

  -- ── ที่อยู่อาศัย + ที่ดินเปล่า (ฟิลด์ชุดใหม่จาก residential-fields.sql) ──

  -- DM-011 บ้านเดี่ยว (ขาย)
  insert into public.properties
    (org_id, code, record_date, pic, lessor_status, lessor_name, phone,
     property_type, sub_type, listing_type, project_name, subdistrict, district, province, nearby,
     land_area, usable_area, floors, bedrooms, bathrooms, kitchens, maid_room, parking_spaces,
     appliances, furniture, common_fee, transfer_fee, sale_price,
     features, lat, lng, notes)
  values
    (v_org, 'DM-011', current_date - 8, 'Demo', 'บุคคล', 'คุณพิมพ์ใจ', '0812340011',
     'บ้าน', 'บ้านเดี่ยว', 'ขาย', 'เดอะการ์เดน บางนา', 'บางแก้ว', 'บางพลี', 'สมุทรปราการ', 'เมกาบางนา, ทางด่วนวงแหวน',
     '54 ตร.วา', 180, '2 ชั้น', 3, 3, 1, 'ไม่มี', 2,
     array['แอร์ 4 เครื่อง', 'เครื่องทำน้ำอุ่น 2 เครื่อง'], 'มีบางส่วน', '40 บาท/ตร.วา', 'คนละครึ่ง (50/50)', 6590000,
     array['สวน', 'สระว่ายน้ำ', 'รปภ. 24 ชม.', 'กล้องวงจรปิด'],
     13.6412, 100.6689, 'ข้อมูลเดโมสำหรับทดสอบระบบ');

  -- DM-012 ทาวน์เฮาส์ (เช่า)
  insert into public.properties
    (org_id, code, record_date, pic, lessor_status, lessor_name, phone,
     property_type, sub_type, listing_type, project_name, subdistrict, district, province, nearby,
     land_area, usable_area, floors, bedrooms, bathrooms, kitchens, maid_room, parking_spaces,
     appliances, furniture, rent_per_month, contract_period, deposit, advance_rent,
     features, lat, lng, notes)
  values
    (v_org, 'DM-012', current_date - 25, 'Demo', 'บุคคล', 'คุณอนันต์', '0812340012',
     'บ้าน', 'ทาวน์เฮาส์/ทาวน์โฮม', 'เช่า', 'พฤกษาวิลล์ เทพารักษ์', 'บางพลีใหญ่', 'บางพลี', 'สมุทรปราการ', 'ถนนเทพารักษ์, โรงพยาบาลจุฬารัตน์ 3',
     '18 ตร.วา', 105, '2 ชั้น', 3, 2, 1, 'ไม่มี', 1,
     array['แอร์ 2 เครื่อง', 'เครื่องทำน้ำอุ่น 1 เครื่อง'], 'บ้านเปล่า/ห้องเปล่า', 14500, '1 ปี', '2 เดือน', '1 เดือน',
     array['รปภ. 24 ชม.', 'ใกล้ถนนหลัก'],
     13.5983, 100.6721, 'ข้อมูลเดโมสำหรับทดสอบระบบ');

  -- DM-013 คอนโด 1 ห้องนอน (เช่า/ขาย)
  insert into public.properties
    (org_id, code, record_date, pic, lessor_status, lessor_name, phone,
     property_type, sub_type, listing_type, project_name, subdistrict, district, province, nearby,
     usable_area, bathrooms, kitchens, balcony_direction, unit_building, unit_floor, tower_floors, tower_count,
     appliances, furniture, common_fee, transfer_fee, rent_per_month, sale_price,
     contract_period, deposit, advance_rent, features, lat, lng, notes)
  values
    (v_org, 'DM-013', current_date - 15, 'Demo', 'บุคคล', 'คุณศิริพร', '0812340013',
     'คอนโด', '1 ห้องนอน', 'เช่า/ขาย', 'เดอะ ริเวอร์ แบริ่ง', 'สำโรงเหนือ', 'เมืองสมุทรปราการ', 'สมุทรปราการ', 'BTS แบริ่ง 300 ม., สุขุมวิท 107',
     35, 1, 1, 'ตะวันออก', 'อาคาร A', '15', 30, 3,
     array['แอร์ 2 เครื่อง', 'เครื่องทำน้ำอุ่น', 'ตู้เย็น', 'เครื่องซักผ้า', 'ไมโครเวฟ'], 'มีครบ', '55 บาท/ตร.ม.', 'ผู้ขายรับผิดชอบ 100%', 15000, 3290000,
     '1 ปี', '2 เดือน', '1 เดือน', array['สระว่ายน้ำ', 'ฟิตเนส', 'สวน', 'รปภ. 24 ชม.'],
     13.6612, 100.6017, 'ข้อมูลเดโมสำหรับทดสอบระบบ');

  -- DM-014 ที่ดินเปล่า (ขาย)
  insert into public.properties
    (org_id, code, record_date, pic, lessor_status, lessor_name, phone,
     property_type, listing_type, subdistrict, district, province, nearby,
     land_wxd, land_area, color_zone, far_ratio, osr_ratio, road_frontage, road_width, utilities,
     transfer_fee, sale_price, usages, lat, lng, notes)
  values
    (v_org, 'DM-014', current_date - 40, 'Demo', 'บริษัท', 'คุณวิโรจน์', '0812340014',
     'ที่ดินเปล่า', 'ขาย', 'บางเพรียง', 'บางบ่อ', 'สมุทรปราการ', 'โรงเรียนวัดบางเพรียง 1.2 กม., ตลาดบางบ่อ 3 กม., ถนนบางนา-ตราด กม.30 2 กม.',
     '40 x 100 ม.', '2 ไร่ 1 งาน 50 ตร.วา', 'เขียว', '1:1.5', '10%', 'ติด 1 ด้าน', 8, 'มีไฟฟ้า + น้ำประปา',
     'คนละครึ่ง (50/50)', 13500000, array['บ้านจัดสรร', 'โกดัง', 'เกษตร'],
     13.5528, 100.7893, 'ข้อมูลเดโมสำหรับทดสอบระบบ');

  -- ประทับเจ้าของให้ทรัพย์เดโมทุกชิ้น (ไม่ให้กำพร้า)
  update public.properties set created_by = v_owner
  where org_id = v_org and code like 'DM-%';

  raise notice 'สร้างองค์กร Demo Estate (%) + ทรัพย์ 14 รายการ (รวมบ้าน/ทาวน์เฮาส์/คอนโด/ที่ดินเปล่า) · เจ้าของ = %',
    v_org, coalesce((select email from public.profiles where id = v_owner), '(ยังไม่มี — กำพร้า)');
end $$;
