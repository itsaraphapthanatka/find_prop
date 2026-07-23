-- HOP · Multi-org ขั้น 1: สร้าง memberships + active_org_id + ย้ายข้อมูลเดิม
-- ⚠️ ขั้นนี้ "ไม่แตะ" RLS/current_org()/is_admin() เดิม → ระบบเก่ายังทำงานปกติทั้งหมด
--    (profiles.org_id ยังเป็น source of truth อยู่ · ขั้น 2 ค่อยสลับมาใช้ memberships)
-- idempotent · ทรานแซกชันเดียว · ไม่ลบข้อมูลเดิม (rollback ได้)
begin;

-- 1) องค์กรที่ผู้ใช้กำลังเลือกอยู่ (ตัวสลับองค์กรจะตั้งค่านี้ในขั้น 3)
alter table public.profiles
  add column if not exists active_org_id uuid references public.organizations(id) on delete set null;

-- 2) ตารางสมาชิกภาพ: 1 คนอยู่ได้หลาย org (แทน profiles.org_id เดี่ยว — เริ่มใช้จริงขั้น 2)
create table if not exists public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  see_all_properties boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists idx_memberships_org on public.memberships(org_id);

-- 3) ย้ายข้อมูลเดิม: ทุกโปรไฟล์ที่มี org_id → membership 1 แถว (คงบทบาท/สถานะ/สิทธิ์เห็นทรัพย์)
insert into public.memberships (user_id, org_id, role, active, see_all_properties)
select id, org_id, coalesce(role, 'member'), coalesce(active, true), coalesce(see_all_properties, true)
from public.profiles
where org_id is not null
on conflict (user_id, org_id) do nothing;

-- ตั้งองค์กรที่เลือกอยู่ = org เดิม
update public.profiles set active_org_id = org_id where org_id is not null and active_org_id is null;

-- 4) RLS ของ memberships (insert ทำผ่าน RPC security definer เท่านั้น — ไม่เปิดให้ client insert ตรง)
alter table public.memberships enable row level security;
drop policy if exists "membership read" on public.memberships;
create policy "membership read" on public.memberships for select
  using (user_id = auth.uid() or public.is_super() or (public.is_admin() and org_id = public.current_org()));
drop policy if exists "membership update" on public.memberships;
create policy "membership update" on public.memberships for update
  using (public.is_super() or (public.is_admin() and org_id = public.current_org()))
  with check (public.is_super() or (public.is_admin() and org_id = public.current_org()));
drop policy if exists "membership delete" on public.memberships;
create policy "membership delete" on public.memberships for delete
  using (public.is_super() or (public.is_admin() and org_id = public.current_org()));

commit;

-- ===== ตรวจผลการย้ายข้อมูล =====
-- ควรได้ 1 membership ต่อ 1 โปรไฟล์ที่มี org (super ไม่มี = ปกติ)
select o.name as org, count(*) as members
from public.memberships m join public.organizations o on o.id = m.org_id
group by o.name order by o.name;

-- โปรไฟล์ที่มี org แต่ยังไม่มี membership (ควรว่าง)
select p.email, p.org_id
from public.profiles p
where p.org_id is not null
  and not exists (select 1 from public.memberships m where m.user_id = p.id and m.org_id = p.org_id);
