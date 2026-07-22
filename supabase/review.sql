-- HOP · ระบบรีวิว/ทดสอบในแอป (Phase 2) — super เปิด-ปิดโหมดได้
-- รันใน Supabase SQL Editor (idempotent)
begin;

-- 1) ค่าตั้งระบบ (key/value) — เก็บสวิตช์ review_mode (on/off)
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values ('review_mode', 'off')
  on conflict (key) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "app_settings read" on public.app_settings;
create policy "app_settings read" on public.app_settings for select using (true);
drop policy if exists "app_settings super write" on public.app_settings;
create policy "app_settings super write" on public.app_settings
  for all using (public.is_super()) with check (public.is_super());

-- 2) ผลรีวิวรายจุด (checkpoint)
create table if not exists public.flow_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null default public.current_org(),
  checkpoint text not null,           -- id จุด เช่น 'add.aifill'
  flow text,                          -- กลุ่ม flow
  label text,                         -- ชื่อจุด
  status text check (status in ('pass', 'fail', 'note')),
  comment text,
  created_by uuid default auth.uid(),
  created_by_name text,               -- เก็บชื่อไว้เลย เพื่อ export ง่าย
  created_at timestamptz not null default now()
);
create index if not exists idx_flow_reviews_created_at on public.flow_reviews(created_at desc);

alter table public.flow_reviews enable row level security;
-- กรอกได้: สมาชิกในองค์กรตัวเอง / super
drop policy if exists "review insert" on public.flow_reviews;
create policy "review insert" on public.flow_reviews
  for insert with check (org_id = public.current_org() or public.is_super());
-- อ่านได้: super (ทุก org) หรือ แอดมินของ org ตัวเอง
drop policy if exists "review read" on public.flow_reviews;
create policy "review read" on public.flow_reviews
  for select using (
    public.is_super() or (public.is_admin() and org_id = public.current_org())
  );
-- ลบได้: super เท่านั้น (เคลียร์ผลเก่า)
drop policy if exists "review delete" on public.flow_reviews;
create policy "review delete" on public.flow_reviews
  for delete using (public.is_super());

commit;
