-- HOP · Multi-org ขั้น 2: สลับ current_org/is_admin/can_see_prop + RLS + RPC มาใช้ memberships
-- ⚠️ ต้องรัน "หลัง" multiorg-stage1.sql · รันคู่กับ deploy client รุ่นใหม่ (useAuth/switcher/TeamPage)
-- คง profiles.org_id ให้ = active org เสมอ (backward-compat + rollback) · idempotent · ทรานแซกชันเดียว
begin;

-- current_org(): super สวมสิทธิ์ → org ที่สวม · ไม่งั้น → active_org_id (ต้องมี membership active)
create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when p.is_super and p.impersonate_org_id is not null then p.impersonate_org_id
    else (select m.org_id from public.memberships m
          where m.user_id = p.id and m.org_id = p.active_org_id and m.active limit 1)
  end
  from public.profiles p where p.id = auth.uid();
$$;

-- is_admin(): บทบาทใน membership ของ org ที่กำลังใช้อยู่
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.org_id = public.current_org() and m.active and m.role = 'admin'
  );
$$;

-- can_see_prop(): see_all อ่านจาก membership ของ org ปัจจุบัน
create or replace function public.can_see_prop(row_created_by uuid, row_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.super_overview()
    or ( row_org = public.current_org() and public.org_ok(row_org) and (
         public.is_admin()
         or coalesce((select m.see_all_properties from public.memberships m
                      where m.user_id = auth.uid() and m.org_id = public.current_org()), true)
         or row_created_by = auth.uid() ) );
$$;

-- profiles: อ่านได้ = ตัวเอง / super / แอดมินอ่านโปรไฟล์ "สมาชิกของ org ปัจจุบัน" · แก้ได้ = ตัวเอง/super
drop policy if exists "own or admin read" on public.profiles;
create policy "own or admin read" on public.profiles for select using (
  id = auth.uid() or public.is_super()
  or (public.is_admin() and exists (
    select 1 from public.memberships m where m.user_id = profiles.id and m.org_id = public.current_org()))
);
drop policy if exists "admin update" on public.profiles;
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update
  using (id = auth.uid() or public.is_super()) with check (id = auth.uid() or public.is_super());

-- สร้างองค์กร: อยู่ได้หลาย org แล้ว (ไม่บล็อกถ้ามี org อยู่) → +membership admin + สลับ active มาที่ใหม่
create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if coalesce(trim(org_name), '') = '' then raise exception 'กรุณาระบุชื่อองค์กร'; end if;
  insert into public.organizations (name) values (trim(org_name)) returning id into v_org;
  insert into public.memberships (user_id, org_id, role, active) values (auth.uid(), v_org, 'admin', true)
    on conflict (user_id, org_id) do update set role = 'admin', active = true;
  update public.profiles set active_org_id = v_org, org_id = v_org, role = 'admin', active = true where id = auth.uid();
  return v_org;
end $$;
grant execute on function public.create_organization(text) to authenticated;

-- ยอมรับคำเชิญ: มี org อยู่แล้วก็เข้าอีก org ได้ (แก้โจทย์เดิม) → +membership + สลับ active
create or replace function public.accept_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites; my_email text; cnt int;
begin
  select * into inv from public.team_invites where token = p_token and status = 'pending';
  if not found then return 'invalid'; end if;
  select email into my_email from auth.users where id = auth.uid();
  if lower(my_email) <> lower(inv.email) then return 'email_mismatch'; end if;
  -- เป็นสมาชิกอยู่แล้ว → แค่สลับ active มาที่ org นี้
  if exists (select 1 from public.memberships where user_id = auth.uid() and org_id = inv.org_id) then
    update public.memberships set active = true where user_id = auth.uid() and org_id = inv.org_id;
  else
    if not public.org_is_pro(inv.org_id) then
      select count(*) into cnt from public.memberships where org_id = inv.org_id and active;
      if cnt >= 2 then return 'org_full'; end if;
    end if;
    insert into public.memberships (user_id, org_id, role, active) values (auth.uid(), inv.org_id, inv.role, true);
  end if;
  -- sync profiles ให้ตรง org ที่เพิ่งเข้า (client อ่าน org/role จาก profiles ที่ sync กับ active org)
  update public.profiles set active_org_id = inv.org_id, org_id = inv.org_id, role = inv.role, active = true
  where id = auth.uid();
  update public.team_invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return 'ok';
end $$;
grant execute on function public.accept_invite(text) to authenticated;

-- สลับองค์กร (ตัวสลับบน topbar เรียก) — ต้องเป็นสมาชิก active เท่านั้น
create or replace function public.switch_org(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.memberships where user_id = auth.uid() and org_id = p_org and active;
  if v_role is null then raise exception 'ไม่ได้เป็นสมาชิกองค์กรนี้'; end if;
  update public.profiles set active_org_id = p_org, org_id = p_org, role = v_role where id = auth.uid();
end $$;
grant execute on function public.switch_org(uuid) to authenticated;

-- รายการองค์กรที่ผู้ใช้อยู่ (สำหรับตัวสลับ — org อื่นอ่านชื่อผ่าน RLS ไม่ได้ ต้องใช้ definer)
create or replace function public.my_orgs()
returns table(org_id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select m.org_id, o.name, m.role
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and m.active
  order by o.name;
$$;
grant execute on function public.my_orgs() to authenticated;

-- ลิมิตลูกทีม Free: นับจาก memberships (active) ของ org
create or replace function public.create_team_invite(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_token text; cnt int; v_name text;
begin
  if not public.is_admin() and not public.is_super() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if v_org is null then raise exception 'ยังไม่ได้อยู่ในองค์กร'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'ต้องระบุอีเมล'; end if;
  if not public.org_is_pro(v_org) then
    select count(*) into cnt from public.memberships where org_id = v_org and active;
    if cnt >= 2 then raise exception 'แพ็กเกจ Free มีลูกทีมได้สูงสุด 2 คน — อัปเกรดเป็น Pro'; end if;
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.team_invites (org_id, email, token, invited_by, invited_by_name)
  values (v_org, lower(trim(p_email)), v_token, auth.uid(), v_name);
  return v_token;
end $$;
grant execute on function public.create_team_invite(text) to authenticated;

commit;
