-- HOP · ระบบทดลองใช้ฟรี — super admin กำหนดจำนวนวัน + แพ็กเกจที่ให้ทดลอง ได้จากหน้า Super Admin
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- หลักการ: ช่วงทดลองแยกจาก subscription จริง (trial_plan / trial_expires_at)
--   • องค์กรสมัครใหม่ได้สิทธิ์แพ็กเกจทดลองอัตโนมัติ N วัน (ตามค่าใน app_settings)
--   • หมดช่วงทดลอง → "ตกลงมาเป็น Free" เฉยๆ (ไม่โดนล็อกทั้งองค์กรแบบ sub หมดอายุ
--     เพราะ org_ok เช็คเฉพาะ sub_expires_at — ทดลองใช้ไม่แตะฟิลด์นั้น)
--   • จ่ายเงินจริงเมื่อไหร่ plan เปลี่ยนเป็น starter/pro → ช่วงทดลองไม่มีผลอีก

-- 1) คอลัมน์ trial ในองค์กร
alter table public.organizations
  add column if not exists trial_plan text,
  add column if not exists trial_expires_at date;

-- 2) ตารางตั้งค่ากลาง (ใช้กับตั้งค่าอื่นในอนาคตได้) — อ่านได้ทุกคนรวม anon (landing ต้องโชว์
--    "ทดลองฟรี N วัน") · เขียนได้เฉพาะ super
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings for select using (true);
drop policy if exists "settings write" on public.app_settings;
create policy "settings write" on public.app_settings for all
  using (public.is_super()) with check (public.is_super());

-- ค่าตั้งต้น: ทดลอง Pro 14 วัน (ตรงกับที่หน้าเว็บโฆษณา) — ไม่ทับค่าที่ super เคยแก้
insert into public.app_settings (key, value) values ('trial', '{"days": 14, "plan": "pro"}')
on conflict (key) do nothing;

-- 3) แพ็กเกจที่มีผลจริงตอนนี้ (จ่ายจริง > ทดลอง > free)
create or replace function public.org_effective_plan(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when o.plan is distinct from 'free' then o.plan
    when o.trial_expires_at is not null and o.trial_expires_at >= current_date
      then coalesce(o.trial_plan, 'free')
    else 'free'
  end
  from public.organizations o where o.id = p_org;
$$;

-- 4) org_is_pro ใช้แพ็กเกจที่มีผลจริง → ลิมิตทรัพย์/แผนเยี่ยมชม/ลูกทีม ปลดล็อกช่วงทดลองอัตโนมัติ
create or replace function public.org_is_pro(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.org_effective_plan(p_org) in ('pro', 'enterprise'), false);
$$;

-- 5) สร้างองค์กรใหม่ → แถมช่วงทดลองตามตั้งค่า (ทับเวอร์ชัน multiorg-stage2.sql)
--    รองรับ 2 แบบ: นับวันจากวันสมัคร (days) หรือ วันสิ้นสุดตายตัว (until) — until ถ้ากำหนดไว้จะใช้แทน days
create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_days int := 0;
  v_plan text := 'pro';
  v_until date := null;
  v_expires date := null;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if coalesce(trim(org_name), '') = '' then raise exception 'กรุณาระบุชื่อองค์กร'; end if;

  select coalesce((value->>'days')::int, 0),
         coalesce(nullif(value->>'plan', ''), 'pro'),
         nullif(value->>'until', '')::date
    into v_days, v_plan, v_until
    from public.app_settings where key = 'trial';
  if v_plan not in ('starter', 'pro') then v_plan := 'pro'; end if;

  -- วันสิ้นสุดตายตัว (until) ถ้ากำหนดไว้ = ใช้วันนั้น (เป็นอดีต = ไม่ได้ทดลอง) · ไม่กำหนด = นับวันจากวันนี้
  if v_until is not null then
    if v_until >= current_date then v_expires := v_until; end if;
  elsif v_days > 0 then
    v_expires := current_date + v_days;
  end if;

  insert into public.organizations (name, trial_plan, trial_expires_at)
  values (
    trim(org_name),
    case when v_expires is not null then v_plan end,
    v_expires
  ) returning id into v_org;

  insert into public.memberships (user_id, org_id, role, active) values (auth.uid(), v_org, 'admin', true)
    on conflict (user_id, org_id) do update set role = 'admin', active = true;
  update public.profiles set active_org_id = v_org, org_id = v_org, role = 'admin', active = true where id = auth.uid();
  return v_org;
end $$;
grant execute on function public.create_organization(text) to authenticated;

-- 6) กันแอดมินองค์กรแก้ trial ของตัวเอง (ต่ออายุทดลองเองไม่ได้) — รวมข้อยกเว้น service_role
--    จาก payment-guard-fix.sql ไว้ครบ (ห้ามใช้ current_user ใน security definer — ดูคอมเมนต์เดิม)
create or replace function public.guard_org_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or session_user = 'postgres' or public.is_super() then
    return new;
  end if;
  if new.plan is distinct from old.plan
     or new.sub_status is distinct from old.sub_status
     or new.sub_expires_at is distinct from old.sub_expires_at
     or new.trial_plan is distinct from old.trial_plan
     or new.trial_expires_at is distinct from old.trial_expires_at then
    raise exception 'เฉพาะ super admin เท่านั้นที่แก้ข้อมูล subscription ได้';
  end if;
  return new;
end $$;

-- ตรวจผล: (1) ตั้งค่า trial (2) ฟังก์ชันครบ
select key, value from public.app_settings where key = 'trial';
select proname from pg_proc
where proname in ('org_effective_plan', 'org_is_pro', 'create_organization', 'guard_org_update')
order by proname;
