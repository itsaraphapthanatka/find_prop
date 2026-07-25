-- HOP · ตารางองค์กรหน้า Super Admin โชว์สถานะทดลองใช้ (trial) ด้วย
-- รันใน Supabase SQL Editor (idempotent) — ต้องรัน trial.sql มาก่อน
-- ------------------------------------------------------------------
-- เดิม super_org_overview ไม่คืนฟิลด์ trial → องค์กรที่กำลังทดลอง Pro โชว์เป็น free เฉยๆ
-- (เปลี่ยนชนิดค่าที่คืน ต้อง drop ก่อน create ใหม่ — create or replace เปลี่ยน out columns ไม่ได้)

drop function if exists public.super_org_overview();
create function public.super_org_overview()
returns table (
  id uuid, name text, plan text, sub_status text, sub_expires_at date,
  trial_plan text, trial_expires_at date,
  created_at timestamptz, member_count bigint, property_count bigint
)
language sql security definer set search_path = public as $$
  select o.id, o.name, o.plan, o.sub_status, o.sub_expires_at,
    o.trial_plan, o.trial_expires_at, o.created_at,
    (select count(*) from public.profiles p where p.org_id = o.id),
    (select count(*) from public.properties pr where pr.org_id = o.id)
  from public.organizations o
  where public.is_super()
  order by o.created_at;
$$;
grant execute on function public.super_org_overview() to authenticated;

-- ตรวจผล: ต้องเห็นคอลัมน์ trial_plan/trial_expires_at (รันในฐานะ postgres จะได้ 0 แถว
-- เพราะ is_super() เป็น false ใน SQL Editor — แค่ไม่ error ก็คือฟังก์ชันใช้ได้)
select * from public.super_org_overview() limit 1;
