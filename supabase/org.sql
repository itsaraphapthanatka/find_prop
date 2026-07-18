-- ============================================================
-- Find Prop — ระบบ Organization (รันหลัง schema.sql และ auth.sql)
-- ข้อมูลทรัพย์/สมาชิกแยกตามองค์กร สมาชิกเห็นเฉพาะขององค์กรตัวเอง
-- ============================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

alter table public.profiles
  add column if not exists org_id uuid references public.organizations(id) on delete set null;
alter table public.properties
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- backfill: ถ้ามีผู้ใช้/ข้อมูลเดิมที่ยังไม่มีองค์กร สร้างองค์กรเริ่มต้นแล้วผูกให้ทั้งหมด
-- ยกเว้นบัญชี super (ต้องไม่มีสังกัดองค์กร) — กันการรันซ้ำแล้วดูด super เข้าองค์กรโดยไม่ตั้งใจ
do $$
declare v_org uuid;
declare has_super_col boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_super'
  ) into has_super_col;

  if has_super_col then
    if exists (select 1 from public.profiles where org_id is null and not is_super)
       or exists (select 1 from public.properties where org_id is null) then
      insert into public.organizations (name) values ('องค์กรของฉัน') returning id into v_org;
      update public.profiles set org_id = v_org where org_id is null and not is_super;
      update public.properties set org_id = v_org where org_id is null;
    end if;
  else
    if exists (select 1 from public.profiles where org_id is null)
       or exists (select 1 from public.properties where org_id is null) then
      insert into public.organizations (name) values ('องค์กรของฉัน') returning id into v_org;
      update public.profiles set org_id = v_org where org_id is null;
      update public.properties set org_id = v_org where org_id is null;
    end if;
  end if;
end $$;

-- องค์กรปัจจุบันของผู้ใช้ที่ล็อกอิน (null ถ้ายังไม่มี/ถูกปิดใช้งาน)
create or replace function public.current_org() returns uuid
language sql security definer stable set search_path = public as $$
  select org_id from public.profiles where id = auth.uid() and active;
$$;

-- ให้ org_id ของทรัพย์ใหม่เติมเองอัตโนมัติ
alter table public.properties alter column org_id set default public.current_org();

-- ── organizations: อ่านเฉพาะองค์กรตัวเอง / แก้ชื่อได้เฉพาะแอดมิน ──
drop policy if exists "org read" on public.organizations;
create policy "org read" on public.organizations
  for select using (id = public.current_org());
drop policy if exists "org update" on public.organizations;
create policy "org update" on public.organizations
  for update using (id = public.current_org() and public.is_admin());

-- ── profiles: จำกัดการเห็น/แก้ ภายในองค์กรเดียวกัน ──
drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles
  for select using (
    auth.uid() = id
    or (public.is_admin() and org_id = public.current_org())
  );
drop policy if exists "admin update" on public.profiles;
create policy "admin update" on public.profiles
  for update using (public.is_admin() and org_id = public.current_org());

-- ── properties: ทุก policy เช็คองค์กร ──
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (org_id = public.current_org());
drop policy if exists "team insert" on public.properties;
create policy "team insert" on public.properties
  for insert with check (org_id = public.current_org());
drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (org_id = public.current_org());
drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (org_id = public.current_org());

-- ── ฟังก์ชันสร้างองค์กร: ผู้ใช้ที่ยังไม่มีองค์กรสร้างได้ แล้วกลายเป็นแอดมินขององค์กรนั้น ──
create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'บัญชีนี้อยู่ในองค์กรอยู่แล้ว';
  end if;
  if coalesce(trim(org_name), '') = '' then
    raise exception 'กรุณาระบุชื่อองค์กร';
  end if;
  insert into public.organizations (name) values (trim(org_name)) returning id into v_org;
  update public.profiles set org_id = v_org, role = 'admin', active = true
  where id = auth.uid();
  return v_org;
end $$;
grant execute on function public.create_organization(text) to authenticated;

-- ── ฟังก์ชันรับลูกทีมเข้าองค์กร (แอดมินเรียกหลังสมัครบัญชีให้ลูกทีม) ──
create or replace function public.adopt_member(member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะแอดมินเท่านั้น';
  end if;
  update public.profiles
  set org_id = public.current_org(), active = true
  where id = member_id and org_id is null;
  if not found then
    raise exception 'ไม่พบบัญชีนี้ หรือบัญชีอยู่ในองค์กรอื่นแล้ว';
  end if;
end $$;
grant execute on function public.adopt_member(uuid) to authenticated;
