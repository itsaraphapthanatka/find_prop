-- ============================================================
-- super เขียนข้อมูลทรัพย์แทนลูกค้าได้จาก "โหมดภาพรวม"
-- (ฟอร์มบังคับเลือกองค์กรเจ้าของทรัพย์ → insert ต้องมี org_id เสมอ
--  จึงไม่มีทางเกิดทรัพย์ไร้สังกัดจากบัญชี super อีก)
-- รันหลัง impersonate.sql — รันซ้ำได้
-- ============================================================
drop policy if exists "team insert" on public.properties;
create policy "team insert" on public.properties
  for insert with check (
    (org_id = public.current_org() and public.org_ok(org_id))
    or (public.is_super() and org_id is not null)
  );

drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

select 'super เขียน/แก้/ลบทรัพย์แทนลูกค้าได้แล้ว (ต้องระบุองค์กรตอนสร้าง)' as ผล;
