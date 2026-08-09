-- ═══════════════════════════════════════════════════════════════════════════
-- โลโก้ระบบ (เปลี่ยนผ่านหน้า Super Admin) — รันซ้ำได้ (idempotent)
-- หลักการ: super อัปโหลดรูปเข้า storage bucket 'branding' แล้วจดลิงก์ลง
-- app_settings key 'branding' (jsonb {logoUrl}) — landing อ่านแบบ anon ได้ตาม policy เดิม
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) bucket เก็บไฟล์โลโก้ — public เพราะโลโก้ต้องโชว์ก่อนล็อกอิน (หน้า landing/login)
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

-- 2) สิทธิ์บนไฟล์ในบัคเก็ตนี้: ใครก็อ่านได้ · อัปโหลด/แก้/ลบได้เฉพาะ super
drop policy if exists "branding read" on storage.objects;
create policy "branding read" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "branding insert" on storage.objects;
create policy "branding insert" on storage.objects
  for insert with check (bucket_id = 'branding' and public.is_super());

drop policy if exists "branding update" on storage.objects;
create policy "branding update" on storage.objects
  for update using (bucket_id = 'branding' and public.is_super());

drop policy if exists "branding delete" on storage.objects;
create policy "branding delete" on storage.objects
  for delete using (bucket_id = 'branding' and public.is_super());

-- ── ตรวจผล: ควรเห็น bucket 1 แถว (public = true) และ policy 4 แถว ──
select id, public from storage.buckets where id = 'branding';
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'branding %'
 order by policyname;
