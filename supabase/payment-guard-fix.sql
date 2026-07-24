-- HOP · FIX — จ่ายเงินสำเร็จแต่ trigger กัน subscription บล็อกการอัปเกรด
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- อาการ: จ่ายผ่าน PunPay สำเร็จ แต่ verify-charge ขึ้น
--        "อัปเกรดไม่สำเร็จ — เฉพาะ super admin เท่านั้นที่แก้ข้อมูล subscription ได้"
-- เหตุ:  apply_payment (เรียกจากเซิร์ฟเวอร์ด้วย service_role) ไป UPDATE organizations
--        → ชน trigger org_update_guard (super.sql) ซึ่งเช็ค is_super() จาก auth.uid()
--        แต่ request ของ service_role ไม่มี auth.uid() → is_super() = false → โดน exception
--        = เส้นทางจ่ายเงินอัตโนมัติไม่มีทางอัปเกรดสำเร็จเลย
-- แก้:   ยกเว้นให้ (1) service_role = เซิร์ฟเวอร์เราหลังยืนยันกับ PunPay แล้ว
--               (2) postgres = รันมือใน SQL Editor
--        แอดมินองค์กร/ผู้ใช้ปกติยังแก้ subscription เองไม่ได้เหมือนเดิม
begin;

create or replace function public.guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- service_role = เซิร์ฟเวอร์ (apply_payment หลังจ่ายจริง) · postgres = SQL Editor
  -- หมายเหตุ: ใช้ session_user (role ที่ต่อเข้ามาจริง) ห้ามใช้ current_user
  -- เพราะฟังก์ชันเป็น security definer → current_user = เจ้าของฟังก์ชันเสมอ จะปิด guard ทิ้งทั้งตัว
  if auth.role() = 'service_role' or session_user = 'postgres' or public.is_super() then
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.sub_status is distinct from old.sub_status
     or new.sub_expires_at is distinct from old.sub_expires_at then
    raise exception 'เฉพาะ super admin เท่านั้นที่แก้ข้อมูล subscription ได้';
  end if;
  return new;
end $$;

commit;

-- ตรวจผล: ต้องเห็นคำว่า service_role ในตัวฟังก์ชัน (คืน 1 แถว = แก้สำเร็จ)
select proname
from pg_proc
where proname = 'guard_org_update'
  and prosrc like '%service_role%';
