-- HOP · ใส่บัญชีหนึ่งเข้าองค์กรเดโม "Demo Estate" (ไม่หลุดจากองค์กรเดิม)
-- ------------------------------------------------------------------
-- ใช้ตอนอยากให้บัญชีที่มีอยู่แล้วสลับไปดู/เดโมข้อมูลของ Demo Estate ได้
-- ต่างจาก demo-admin-assign.sql ที่ "ย้าย" บัญชีไปอยู่ Demo Estate ถาวร (ยุคก่อน multi-org)
-- ไฟล์นี้เพิ่มเป็น membership อีกใบ → ใช้ตัวสลับองค์กรในแอปเปลี่ยนไปมาได้
--
-- ต้องรัน multiorg-stage1.sql + multiorg-stage2.sql มาก่อน (มีตาราง memberships)
-- ถ้ายังไม่มีองค์กร/ทรัพย์เดโม ให้รัน demo-org.sql ก่อน
-- รันซ้ำได้ (idempotent) · ทรานแซกชันเดียว
--
-- แก้ค่าเหล่านี้ได้ตามต้องการ:
--   v_email        = อีเมลบัญชีที่จะเพิ่มเข้า Demo Estate
--   v_make_active  = true  → สลับให้บัญชีนี้ "เข้าใช้งาน Demo Estate" ทันทีหลังล็อกอินรอบถัดไป
--                    false → คงองค์กรเดิมที่ใช้อยู่ แล้วค่อยกดสลับเองในแอป
--   v_role         = 'admin'  → เห็นทุกอย่างของ Demo Estate + จัดการทีม/ดูประวัติการใช้งานได้
--                    'member' → เห็นทรัพย์/นัด/แผนทั้งองค์กรเหมือนกัน (เพราะ see_all_properties = true)
--                               แต่ไม่เห็นประวัติการใช้งานและจัดการทีมไม่ได้
--
-- ⚠️ RLS ผูกกับ "องค์กรที่กำลังใช้งาน" (current_org) — 1 บัญชีเห็นได้ทีละองค์กร (สลับได้ในแอป)
--
-- ไฟล์นี้ "ไม่แตะ" profiles.is_super เด็ดขาด — บัญชีจะไม่กลายเป็น super admin
--   role = 'admin' ที่นี่ = แอดมินของ Demo Estate เท่านั้น (จัดการทีม/ดูประวัติ ขององค์กรนี้)
--   ไม่เห็นข้อมูลองค์กรอื่น ไม่มีเมนู Super Admin ไม่มีสิทธิ์สวมสิทธิ์องค์กรใคร
begin;

do $$
declare
  v_email       text := 'admin@prop.com';
  v_make_active boolean := true;
  v_role        text := 'admin';   -- 'admin' หรือ 'member' (ดูหมายเหตุหัวไฟล์)
  v_org         uuid;
  v_uid         uuid;
  v_props       int;
begin
  select id into v_org from public.organizations where name = 'Demo Estate';
  if v_org is null then
    raise exception 'ไม่พบองค์กร "Demo Estate" — รัน supabase/demo-org.sql ก่อน';
  end if;

  select id into v_uid from public.profiles where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'ไม่พบบัญชี % ในตาราง profiles — สร้างผู้ใช้ใน Supabase (Authentication → Add user, ติ๊ก Auto Confirm) ก่อน', v_email;
  end if;

  -- เพิ่ม/อัปเดตสมาชิกภาพใน Demo Estate — see_all_properties = true คือกุญแจให้ "เห็นทรัพย์ทั้งองค์กร"
  -- (ไม่ใช่เห็นแค่ทรัพย์ที่ตัวเองลง — ดู can_see_prop() ใน multiorg-stage2.sql)
  insert into public.memberships (user_id, org_id, role, active, see_all_properties)
  values (v_uid, v_org, v_role, true, true)
  on conflict (user_id, org_id) do update
    set role = v_role, active = true, see_all_properties = true;

  -- บัญชีต้องเปิดใช้งาน ไม่งั้นแอปกั้นที่หน้า "รอแอดมินเปิดให้"
  update public.profiles set active = true where id = v_uid;

  if v_make_active then
    -- ตั้งให้เข้าใช้งาน Demo Estate เลย (org_id/role ตามที่ switch_org ทำ เพื่อให้โค้ดยุคเดิมตรงกัน)
    update public.profiles
       set active_org_id = v_org, org_id = v_org, role = v_role
     where id = v_uid;
  end if;

  select count(*) into v_props from public.properties where org_id = v_org;
  raise notice '✅ เพิ่ม % เข้า Demo Estate แล้ว (บทบาท %) · ทรัพย์ในองค์กรนี้ % รายการ · เข้าใช้งานทันที = %',
    v_email, v_role, v_props, v_make_active;
end $$;

commit;

-- ===== ตรวจผล =====
-- องค์กรทั้งหมดที่บัญชีนี้อยู่ (ควรเห็น Demo Estate + องค์กรเดิม)
-- คอลัมน์ super_admin ต้องเป็น false — ยืนยันว่าไม่ได้ยกให้เป็น super admin
select o.name, m.role, m.active, m.see_all_properties,
       (p.active_org_id = m.org_id) as กำลังใช้งานอยู่,
       coalesce(p.is_super, false) as super_admin
from public.memberships m
join public.organizations o on o.id = m.org_id
join public.profiles p on p.id = m.user_id
where lower(p.email) = lower('admin@prop.com')
order by o.name;

-- ทรัพย์เดโมที่จะเห็น (DM-001…DM-014)
-- select code, property_type, listing_type, district from public.properties
--  where org_id = (select id from public.organizations where name = 'Demo Estate') order by code;

-- ถ้าต้องการยกให้บัญชีนี้เป็น "ผู้ลงทรัพย์" ของทรัพย์เดโมทั้งหมดด้วย (เผื่อทดสอบโหมดเห็นเฉพาะของตัวเอง)
-- update public.properties set created_by = (select id from public.profiles where lower(email) = lower('admin@prop.com'))
--  where org_id = (select id from public.organizations where name = 'Demo Estate');
