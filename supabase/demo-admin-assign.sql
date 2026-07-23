-- HOP · ตั้ง admin@demo.com เป็นแอดมิน "Demo Estate" + ยกทรัพย์เดโมให้เป็นเจ้าของ
-- ------------------------------------------------------------------
-- ใช้แทนขั้น "fallback → super" ของ assign-ownerless-to-admin.sql
-- (คุณสร้างบัญชี admin@demo.com มาเป็นแอดมินองค์กรเดโมแล้ว)
-- ปลอดภัยต่อการรันซ้ำ (idempotent) · ทรานแซกชันเดียว
--   - บังคับให้ admin@demo.com อยู่ Demo Estate + role=admin + เปิดใช้งาน
--   - ยกทรัพย์ "ทุกชิ้น" ของ Demo Estate ให้ admin@demo.com เป็นเจ้าของ
--     (ครอบทั้งเคสที่ยังว่าง และเคสที่รอบก่อนยกให้ super ไปแล้ว)
begin;

do $$
declare
  v_org uuid;
  v_uid uuid;
begin
  select id into v_org from public.organizations where name = 'Demo Estate';
  select id into v_uid from public.profiles      where email = 'admin@demo.com';

  if v_org is null then
    raise exception 'ไม่พบองค์กร "Demo Estate" — รัน demo-org.sql ก่อน';
  end if;
  if v_uid is null then
    raise exception 'ไม่พบผู้ใช้ admin@demo.com ในตาราง profiles (สร้างบัญชี auth ให้เสร็จก่อน)';
  end if;

  -- ตั้งให้เป็นแอดมินของ Demo Estate (ไม่ว่าก่อนหน้าจะเป็น member/องค์กรอื่น)
  update public.profiles
  set org_id = v_org, role = 'admin', active = true
  where id = v_uid;

  -- ยกทรัพย์ทั้งหมดของ Demo Estate ให้ admin@demo.com เป็นเจ้าของ
  update public.properties
  set created_by = v_uid
  where org_id = v_org;
end $$;

commit;

-- ===== ตรวจผล (รันหลัง commit) =====
-- 1) ยืนยันบทบาท admin@demo.com
select email, role, active, org_id
from public.profiles where email = 'admin@demo.com';

-- 2) ทรัพย์ Demo Estate ตอนนี้ "ลงโดย" admin@demo.com ทุกชิ้น
select o.name as org, pr.code, coalesce(pf.email, '(no owner)') as owner
from public.properties pr
join public.organizations o on o.id = pr.org_id
left join public.profiles pf on pf.id = pr.created_by
where o.name = 'Demo Estate'
order by pr.code;

-- 3) ภาพรวมทุกองค์กร — ownerless ต้องเป็น 0 ทุกแถว
select coalesce(o.name, '(no org)') as org,
       count(*) as total,
       count(*) filter (where pr.created_by is null) as ownerless
from public.properties pr
left join public.organizations o on o.id = pr.org_id
group by o.name order by o.name nulls last;
