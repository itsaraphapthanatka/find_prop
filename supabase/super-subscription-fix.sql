-- HUP · FIX — super แก้ subscription ไม่ติด + คืนสโคปทรัพย์ตอนสวมสิทธิ์
-- รันใน Supabase SQL Editor (idempotent · ทรานแซกชันเดียว · error เมื่อไหร่ rollback หมด)
-- ------------------------------------------------------------------
-- อาการ: หน้า Super Admin เปลี่ยน "แพ็กเกจ" กด "บันทึก" แล้วไม่เปลี่ยน (ไม่ขึ้น error)
-- เหตุ: policy "org update" ที่ deploy อยู่ขาด `or is_super()` (ตรงกับเวอร์ชันเก่าใน org.sql
--       ที่มา override super.sql) → super ไม่มีสังกัด และตอนสวมสิทธิ์ current_org() =
--       องค์กรที่สวม เมื่อแก้ "อีกองค์กร" เงื่อนไข id = current_org() เป็นเท็จเสมอ
--       → UPDATE ไม่ตรงแถวใด ๆ RLS ปัดตกเงียบ 0 แถว (Supabase ไม่ถือเป็น error)
--   * ที่ "เห็น" ทุกองค์กรได้เพราะ super_org_overview() เป็น SECURITY DEFINER (ข้าม RLS)
--     แต่ตอน "แก้" ยิงตรงตาราง organizations จึงผ่าน RLS ปกติ เลยโดนบล็อก
begin;

-- FIX 1: ให้ super อ่าน/แก้ organizations ได้ทุกองค์กร (คืนค่าตาม super.sql)
drop policy if exists "org read" on public.organizations;
create policy "org read" on public.organizations
  for select using (id = public.current_org() or public.is_super());

drop policy if exists "org update" on public.organizations;
create policy "org update" on public.organizations
  for update using ((id = public.current_org() and public.is_admin()) or public.is_super());

-- FIX 2: คืนสโคปการเห็นทรัพย์ของ super ตอนสวมสิทธิ์
--   ตอนแก้ per-user visibility รอบก่อน can_see_prop เผลอใช้ is_super() ทำให้ super
--   ที่ "กำลังสวมสิทธิ์" เห็นทรัพย์ข้ามองค์กร — ที่ถูกคือ super_overview()
--   (super เห็นทุก org เฉพาะตอนไม่ได้สวมสิทธิ์ · ตอนสวมให้แคบเหลือองค์กรนั้น เหมือนดีไซน์เดิม)
create or replace function public.can_see_prop(row_created_by uuid, row_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.super_overview()
    or ( row_org = public.current_org() and public.org_ok(row_org) and (
         public.is_admin()
         or coalesce((select p.see_all_properties from public.profiles p where p.id = auth.uid()), true)
         or row_created_by = auth.uid()
         or row_created_by is null ) );
$$;

commit;

-- ตรวจผล: qual ของ "org update" ต้องมี is_super() แล้ว
select policyname, cmd, qual
from pg_policies
where tablename = 'organizations'
order by policyname;
