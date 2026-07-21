-- HUP · การมองเห็นทรัพย์ "ต่อรายคน" (per-user property visibility)
-- ------------------------------------------------------------------
-- ตั้งค่าได้ต่อสมาชิกที่คอลัมน์ profiles.see_all_properties
--   true  = เห็นทรัพย์ทั้ง org        (ค่าเริ่มต้น = พฤติกรรมเดิม)
--   false = เห็นเฉพาะทรัพย์ที่ตัวเองลง (created_by = ตัวเอง)
-- admin เห็นทั้ง org เสมอ · super เห็นทุก org เสมอ (คงเงื่อนไข org_ok + is_super เดิม)
-- ปลอดภัยต่อการรันซ้ำ (idempotent) · รันเป็นทรานแซกชันเดียว ถ้า error จะ rollback ทั้งก้อน
begin;

-- 1) ใครเป็นคนลงทรัพย์ (ตาราง properties เดิมไม่มีคอลัมน์นี้เลย)
alter table public.properties
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- เติมค่าให้อัตโนมัติตอน insert = ผู้ที่กำลังล็อกอิน → ไม่ต้องแก้โค้ดฝั่งแอป
alter table public.properties
  alter column created_by set default auth.uid();

create index if not exists idx_properties_created_by
  on public.properties(created_by);

-- หมายเหตุ: แถวเก่าที่ created_by = null ถือเป็น "ของกลาง" เห็นได้ทุกคน
-- (จึงไม่มีทรัพย์เดิมหายไปตอนสมาชิกถูกตั้งเป็นโหมดเห็นเฉพาะตัวเอง)

-- 2) สวิตช์ต่อรายคน (ค่าเริ่มต้น true = เห็นทั้งทีมเหมือนเดิม)
alter table public.profiles
  add column if not exists see_all_properties boolean not null default true;

-- 3) ฟังก์ชันตัดสินสิทธิ์การเห็นทรัพย์ 1 แถว (รวมทุกกฎไว้ที่เดียว)
create or replace function public.can_see_prop(row_created_by uuid, row_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_super()                              -- super: เห็นทุก org
    or (
      row_org = public.current_org()               -- ต้องอยู่ org เดียวกัน
      and public.org_ok(row_org)                   -- org ต้องใช้งานได้ (คงเงื่อนไขเดิม)
      and (
        public.is_admin()                          -- admin: เห็นทั้ง org เสมอ
        or coalesce(                               -- สมาชิกที่ตั้งไว้ว่าเห็นทั้งทีม
             (select p.see_all_properties
                from public.profiles p
               where p.id = auth.uid()),
             true)
        or row_created_by = auth.uid()             -- หรือเป็นทรัพย์ที่ตัวเองลง
        or row_created_by is null                  -- หรือเป็นของกลาง (แถวเก่า)
      )
    );
$$;

-- 4) ผูก policy อ่าน/แก้/ลบ เข้ากับสิทธิ์การเห็น — "ถ้าเห็นไม่ได้ = แตะไม่ได้"
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (public.can_see_prop(created_by, org_id));

drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (public.can_see_prop(created_by, org_id))
  with check (public.is_super()
              or (org_id = public.current_org() and public.org_ok(org_id)));

drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (public.can_see_prop(created_by, org_id));

-- policy "team insert" คงเดิม (สร้างทรัพย์ใน org ตัวเองได้เหมือนเดิม)
-- created_by จะถูกเติมให้เองจาก default ในข้อ 1

commit;

-- ============================================================
-- วิธีตั้งค่ารายคน (ระหว่างที่ยังไม่มีปุ่มในแอป ใช้ SQL / Table Editor ได้เลย)
-- ============================================================
-- ดูสถานะทุกคน:
--   select email, role, see_all_properties from public.profiles order by role, email;
--
-- ตั้งให้ "คนนี้เห็นเฉพาะทรัพย์ที่ตัวเองลง":
--   update public.profiles set see_all_properties = false where email = 'user@example.com';
--
-- คืนค่าให้ "เห็นทั้งทีม":
--   update public.profiles set see_all_properties = true  where email = 'user@example.com';
