-- ============================================================
-- Find Prop — ระบบล็อกอิน + ลูกทีม (รันใน SQL Editor หลัง schema.sql)
-- ============================================================

-- โปรไฟล์ผู้ใช้ (ผูกกับ auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default false,   -- คนสมัครใหม่ = รออนุมัติ
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- helper (security definer เพื่อไม่ให้ RLS เรียกตัวเองวนลูป)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "admin update" on public.profiles;
create policy "admin update" on public.profiles
  for update using (public.is_admin());

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีผู้ใช้ใหม่
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── เปลี่ยนสิทธิ์ข้อมูลทรัพย์: จากเปิดทุกคน → เฉพาะสมาชิกทีมที่ล็อกอิน ──
drop policy if exists "anon read" on public.properties;
drop policy if exists "anon insert" on public.properties;
drop policy if exists "anon update" on public.properties;
drop policy if exists "anon delete" on public.properties;

drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties for select using (public.is_member());
drop policy if exists "team insert" on public.properties;
create policy "team insert" on public.properties for insert with check (public.is_member());
drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties for update using (public.is_member());
drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties for delete using (public.is_member());

-- รูปทรัพย์: อัปโหลดได้เฉพาะสมาชิก (อ่านสาธารณะเหมือนเดิมเพื่อให้ <img> แสดงได้)
drop policy if exists "photos anon upload" on storage.objects;
drop policy if exists "photos member upload" on storage.objects;
create policy "photos member upload" on storage.objects
  for insert with check (bucket_id = 'property-photos' and public.is_member());

-- ============================================================
-- ขั้นตอนหลังรันไฟล์นี้ (ทำครั้งเดียว):
-- 1) Authentication → Sign In / Up → Email → ปิด "Confirm email"
--    (เพื่อให้แอดมินเพิ่มลูกทีมแล้วใช้ได้ทันที ไม่ต้องยืนยันอีเมล)
-- 2) Authentication → Users → Add user → Create new user
--    ใส่อีเมล + รหัสผ่านของคุณ (ติ๊ก Auto Confirm User)
-- 3) รันบรรทัดนี้ (แก้อีเมลเป็นของคุณ) เพื่อตั้งเป็นแอดมินคนแรก:
--    update public.profiles set role = 'admin', active = true where email = 'you@example.com';
-- ============================================================
