-- HOP · เชิญลูกทีมด้วยลิงก์ (แบบ Jira — ผู้ถูกเชิญตั้งรหัสเอง/ใช้ Google, แอดมินไม่รู้รหัส)
-- แอดมินสร้างคำเชิญ (ผูกอีเมล) → ได้ลิงก์ ?invite=TOKEN → ส่งให้เอง → ผู้ถูกเชิญเปิด+ล็อกอินด้วยอีเมลนั้น → เข้าองค์กรอัตโนมัติ
-- ต้องรัน "หลัง" plan-gating.sql (ใช้ฟังก์ชัน org_is_pro) · idempotent
begin;

-- เผื่อยังไม่ได้รัน plan-gating.sql — นิยาม org_is_pro ให้แน่ใจ (create or replace ปลอดภัยรันซ้ำ)
create or replace function public.org_is_pro(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan in ('pro', 'enterprise') from public.organizations where id = p_org), false);
$$;

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'member',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_by_name text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists idx_team_invites_org on public.team_invites(org_id, status);

alter table public.team_invites enable row level security;
-- แอดมินเห็น/จัดการคำเชิญของ org ตัวเอง (insert ทำผ่าน RPC security definer)
drop policy if exists "invite read" on public.team_invites;
create policy "invite read" on public.team_invites for select
  using ((public.is_admin() and org_id = public.current_org()) or public.is_super());
drop policy if exists "invite manage" on public.team_invites;
create policy "invite manage" on public.team_invites for update
  using ((public.is_admin() and org_id = public.current_org()) or public.is_super());

-- แอดมินสร้างคำเชิญ → คืน token ให้ client ประกอบลิงก์
create or replace function public.create_team_invite(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org();
  v_token text; cnt int; v_name text;
begin
  if not public.is_admin() and not public.is_super() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if v_org is null then raise exception 'ยังไม่ได้อยู่ในองค์กร'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'ต้องระบุอีเมล'; end if;
  -- ลิมิตลูกทีม Free
  if not public.org_is_pro(v_org) then
    select count(*) into cnt from public.profiles where org_id = v_org;
    if cnt >= 2 then raise exception 'แพ็กเกจ Free มีลูกทีมได้สูงสุด 2 คน — อัปเกรดเป็น Pro'; end if;
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.team_invites (org_id, email, token, invited_by, invited_by_name)
  values (v_org, lower(trim(p_email)), v_token, auth.uid(), v_name);
  return v_token;
end $$;
grant execute on function public.create_team_invite(text) to authenticated;

-- ข้อมูลคำเชิญ (โชว์ชื่อองค์กร + อีเมลที่เชิญ ตอนผู้ถูกเชิญเปิดลิงก์)
create or replace function public.invite_info(p_token text)
returns table(org_name text, email text, status text)
language sql stable security definer set search_path = public as $$
  select o.name, i.email, i.status
  from public.team_invites i join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;
grant execute on function public.invite_info(text) to authenticated;

-- ยอมรับคำเชิญ → เข้าองค์กรเป็นลูกทีม (ต้องล็อกอินด้วยอีเมลที่ถูกเชิญ + ยังไม่มีองค์กร)
create or replace function public.accept_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv public.team_invites;
  my_email text; my_org uuid; cnt int;
begin
  select * into inv from public.team_invites where token = p_token and status = 'pending';
  if not found then return 'invalid'; end if;
  select email into my_email from auth.users where id = auth.uid();
  if lower(my_email) <> lower(inv.email) then return 'email_mismatch'; end if;
  select org_id into my_org from public.profiles where id = auth.uid();
  if my_org is not null then return 'already_in_org'; end if;
  if not public.org_is_pro(inv.org_id) then
    select count(*) into cnt from public.profiles where org_id = inv.org_id;
    if cnt >= 2 then return 'org_full'; end if;
  end if;
  update public.profiles set org_id = inv.org_id, role = inv.role, active = true where id = auth.uid();
  update public.team_invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return 'ok';
end $$;
grant execute on function public.accept_invite(text) to authenticated;

commit;
