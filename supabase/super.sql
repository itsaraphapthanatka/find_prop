-- ============================================================
-- Find Prop — Super Admin + Subscription (รันหลัง org.sql)
-- super admin เห็นทุกองค์กร กำหนดแพ็กเกจ/วันหมดอายุ/ระงับองค์กร
-- ============================================================

alter table public.profiles
  add column if not exists is_super boolean not null default false;

alter table public.organizations
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro', 'enterprise')),
  add column if not exists sub_status text not null default 'active'
    check (sub_status in ('active', 'suspended')),
  add column if not exists sub_expires_at date;   -- null = ไม่มีวันหมดอายุ

create or replace function public.is_super() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_super);
$$;

-- องค์กรใช้งานได้ = ไม่ถูกระงับ + ยังไม่หมดอายุ
create or replace function public.org_ok(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org
      and sub_status = 'active'
      and (sub_expires_at is null or sub_expires_at >= current_date)
  );
$$;

-- ── organizations: super เห็น/แก้ทุกองค์กร ──
drop policy if exists "org read" on public.organizations;
create policy "org read" on public.organizations
  for select using (id = public.current_org() or public.is_super());
drop policy if exists "org update" on public.organizations;
create policy "org update" on public.organizations
  for update using ((id = public.current_org() and public.is_admin()) or public.is_super());

-- กันแอดมินองค์กรแก้ฟิลด์ subscription เอง (แก้ได้เฉพาะ super)
create or replace function public.guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then
    if new.plan is distinct from old.plan
       or new.sub_status is distinct from old.sub_status
       or new.sub_expires_at is distinct from old.sub_expires_at then
      raise exception 'เฉพาะ super admin เท่านั้นที่แก้ข้อมูล subscription ได้';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists org_update_guard on public.organizations;
create trigger org_update_guard before update on public.organizations
  for each row execute function public.guard_org_update();

-- ── profiles: super อ่าน/แก้ได้ทุกคน ──
drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles
  for select using (
    auth.uid() = id
    or (public.is_admin() and org_id = public.current_org())
    or public.is_super()
  );
drop policy if exists "admin update" on public.profiles;
create policy "admin update" on public.profiles
  for update using (
    (public.is_admin() and org_id = public.current_org())
    or public.is_super()
  );

-- ── properties: องค์กรที่ถูกระงับ/หมดอายุใช้ไม่ได้ + super อ่านได้ทุกองค์กร ──
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );
drop policy if exists "team insert" on public.properties;
create policy "team insert" on public.properties
  for insert with check (org_id = public.current_org() and public.org_ok(org_id));
drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (org_id = public.current_org() and public.org_ok(org_id));
drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (org_id = public.current_org() and public.org_ok(org_id));

-- ── ภาพรวมทุกองค์กรสำหรับหน้า super (คืนค่าว่างถ้าไม่ใช่ super) ──
create or replace function public.super_org_overview()
returns table (
  id uuid, name text, plan text, sub_status text, sub_expires_at date,
  created_at timestamptz, member_count bigint, property_count bigint
)
language sql security definer set search_path = public as $$
  select o.id, o.name, o.plan, o.sub_status, o.sub_expires_at, o.created_at,
    (select count(*) from public.profiles p where p.org_id = o.id),
    (select count(*) from public.properties pr where pr.org_id = o.id)
  from public.organizations o
  where public.is_super()
  order by o.created_at;
$$;
grant execute on function public.super_org_overview() to authenticated;

-- ============================================================
-- ตั้ง super admin คนแรก (แก้อีเมลเป็นของคุณ แล้วรัน):
-- update public.profiles set is_super = true where email = 'you@example.com';
-- ============================================================
