-- ============================================================
-- HOP · โลโก้ขององค์กร (แสดงบนหน้าปกข้อเสนอ — ทั้ง PDF และลิงก์ลูกค้า)
-- รันใน Supabase SQL Editor ทั้งไฟล์ครั้งเดียว (ทรานแซกชันเดียว · error = rollback หมด · รันซ้ำได้)
-- ต้องรัน proposal-share.sql ก่อน
-- ------------------------------------------------------------
-- 1) organizations.logo_url — Owner/Manager อัปโหลดจากหน้า "ทีม" (การ์ดองค์กร)
-- 2) storage bucket 'org-logos' (public อ่านได้ — โลโก้ต้องโชว์ในลิงก์ที่ลูกค้าเปิดโดยไม่ล็อกอิน)
--    เขียนได้เฉพาะในโฟลเดอร์ขององค์กรตัวเอง: org-logos/<org_id>/... · Owner/Manager หรือ super
--    รับเฉพาะ PNG/JPG/WebP ≤ 1MB (ไม่รับ SVG — ไฟล์ SVG ฝังสคริปต์ได้ถ้ามีคนเปิดลิงก์ไฟล์ตรงๆ)
-- 3) proposal_public รับคีย์ logo_url เพิ่ม (https เท่านั้น) — โลโก้ติดไปกับข้อเสนอตอนบันทึก
--    ลิงก์ที่ส่งลูกค้าแล้วจึงคงโลโก้ตามวันที่เสนอ (เหมือนราคาที่ตรึงไว้)
--    นิยามเดียวกับใน proposal-share.sql รุ่นล่าสุด — รันไฟล์ไหนซ้ำก็ได้ผลเหมือนกัน
-- ============================================================

begin;

-- ── 1) คอลัมน์ ──
alter table public.organizations add column if not exists logo_url text;
alter table public.organizations drop constraint if exists organizations_logo_url_check;
alter table public.organizations
  add constraint organizations_logo_url_check check (logo_url is null or (logo_url ~ '^https://' and length(logo_url) <= 500));

-- ── 2) ที่เก็บไฟล์โลโก้ ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "org-logos read" on storage.objects;
create policy "org-logos read" on storage.objects
  for select using (bucket_id = 'org-logos');

drop policy if exists "org-logos insert" on storage.objects;
create policy "org-logos insert" on storage.objects
  for insert with check (
    bucket_id = 'org-logos' and (
      public.is_super()
      or ((storage.foldername(name))[1] = public.current_org()::text and public.is_admin())
    )
  );

drop policy if exists "org-logos update" on storage.objects;
create policy "org-logos update" on storage.objects
  for update using (
    bucket_id = 'org-logos' and (
      public.is_super()
      or ((storage.foldername(name))[1] = public.current_org()::text and public.is_admin())
    )
  );

drop policy if exists "org-logos delete" on storage.objects;
create policy "org-logos delete" on storage.objects
  for delete using (
    bucket_id = 'org-logos' and (
      public.is_super()
      or ((storage.foldername(name))[1] = public.current_org()::text and public.is_admin())
    )
  );

-- ── 3) ข้อมูลบนข้อเสนอที่ลูกค้าเห็น (+ logo_url) ──
create or replace function public.proposal_public(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'agent', case when jsonb_typeof(p->'agent') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'name',  left(nullif(btrim(p->'agent'->>'name'), ''), 120),
      'phone', left(nullif(btrim(p->'agent'->>'phone'), ''), 40),
      'line',  left(nullif(btrim(p->'agent'->>'line'), ''), 80),
      'email', left(nullif(btrim(p->'agent'->>'email'), ''), 160)
    )) end,
    'note', left(nullif(btrim(p->>'note'), ''), 2000),
    'valid_until', case when (p->>'valid_until') ~ '^\d{4}-\d{2}-\d{2}$' then p->>'valid_until' end,
    'logo_url', case when (p->>'logo_url') ~ '^https://' and length(p->>'logo_url') <= 500 then p->>'logo_url' end
  )) end
$$;
revoke all on function public.proposal_public(jsonb) from public, anon;

commit;

-- ── ตรวจตัวเอง ──
do $$
declare v_out jsonb;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'organizations' and column_name = 'logo_url') then
    raise exception 'ไม่พบคอลัมน์ organizations.logo_url';
  end if;
  if not exists (select 1 from storage.buckets where id = 'org-logos' and public) then
    raise exception 'ไม่พบ bucket org-logos (public)';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'org-logos %') <> 4 then
    raise exception 'policy ของ org-logos ไม่ครบ 4 ตัว';
  end if;
  v_out := public.proposal_public('{"note":"x","logo_url":"https://a.co/l.png","owner_phone":"9"}'::jsonb);
  if v_out <> '{"note":"x","logo_url":"https://a.co/l.png"}'::jsonb then
    raise exception 'proposal_public ส่ง logo_url ไม่ถูก: %', v_out;
  end if;
  if public.proposal_public('{"logo_url":"javascript:alert(1)"}'::jsonb) <> '{}'::jsonb then
    raise exception 'proposal_public ต้องทิ้งลิงก์โลโก้ที่ไม่ใช่ https';
  end if;
  raise notice 'โลโก้องค์กรพร้อมใช้ ✓';
end $$;

select 'logo_url' as check, exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'organizations' and column_name = 'logo_url') as ok
union all
select 'bucket org-logos', exists (select 1 from storage.buckets where id = 'org-logos' and public)
union all
select 'policy ครบ 4', (select count(*) = 4 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                         and policyname like 'org-logos %')
union all
select 'proposal_public รับโลโก้', (select prosrc like '%logo_url%' from pg_proc where proname = 'proposal_public');
