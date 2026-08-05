-- ที่นั่งทีม (seats) — โมเดลลูกผสม: แถมที่นั่งตามแพ็กเกจ+ระดับ · เกินแล้วซื้อเพิ่มรายที่นั่ง
-- ============================================================
-- 1 ที่นั่ง = 1 บัญชีในองค์กร (นับแอดมิน/เจ้าของด้วย) — มาตรฐานเดียวกับ SaaS ทั่วไป
--
--   ระดับ (โควตาทรัพย์) │ Basic │ Pro
--   100                 │   3   │  5
--   250                 │   5   │ 10
--   500                 │  10   │ 20
--   Free = 1 (เจ้าของคนเดียว) · Enterprise = ไม่จำกัด · ช่วงทดลอง = ตามแพ็กเกจที่ทดลอง
--
-- ที่นั่งที่ซื้อเพิ่ม (extra_seats) บวกทับโควตาข้างบน มีวันหมดอายุของตัวเอง
-- ⚠️ แพ็กเกจลดชั้น/ที่นั่งเสริมหมดอายุ = "เชิญเพิ่มไม่ได้" เท่านั้น — ไม่เตะใครออกจากองค์กร
--
-- ไฟล์นี้รวมการแก้บั๊กเดิมไว้ด้วย: create_team_invite/accept_invite เคยใช้ org_is_pro
-- (= pro/enterprise เท่านั้น) ทำให้ org ที่จ่าย Basic เชิญคนที่ 3 ไม่ได้ + ข้อความ error ผิด
--
-- ต้องรันหลัง supabase/trial.sql + plan-tiers.sql (ใช้ org_effective_plan / plan_tier) · รันซ้ำได้
-- ============================================================

begin;

-- ── 1) ที่นั่งที่ซื้อเพิ่ม ──────────────────────────────────
alter table public.organizations
  add column if not exists extra_seats int not null default 0,
  add column if not exists extra_seats_expires_at date;

alter table public.organizations drop constraint if exists organizations_extra_seats_check;
alter table public.organizations
  add constraint organizations_extra_seats_check check (extra_seats >= 0 and extra_seats <= 500);

-- ── 2) โควตาที่นั่งที่แถมมากับแพ็กเกจ (ต้องตรงกับ SEATS_BY_PLAN ใน src/lib/plan.ts) ──
-- null = ไม่จำกัด (enterprise)
create or replace function public.plan_base_seats(p_plan text, p_tier int)
returns int language sql immutable set search_path = public as $$
  select case p_plan
    when 'enterprise' then null
    -- else = ระดับแปลกปลอม/ยังไม่เคยเลือก → ถอยไประดับ 500 (เหมือน baseSeats() ในแอป)
    when 'pro' then case coalesce(p_tier, 500) when 100 then 5 when 250 then 10 when 500 then 20 else 20 end
    when 'starter' then case coalesce(p_tier, 500) when 100 then 3 when 250 then 5 when 500 then 10 else 10 end
    else 1                                   -- free = เจ้าของคนเดียว
  end;
$$;

-- ที่นั่งทั้งหมดที่องค์กรมีสิทธิ์ใช้ (null = ไม่จำกัด)
create or replace function public.org_seat_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when base is null then null
    else base + case when o.extra_seats_expires_at is not null
                      and o.extra_seats_expires_at >= current_date
                     then o.extra_seats else 0 end
  end
  from public.organizations o
  cross join lateral (
    select public.plan_base_seats(public.org_effective_plan(o.id), o.plan_tier) as base
  ) b
  where o.id = p_org;
$$;

-- ที่นั่งที่ใช้ไปแล้ว = สมาชิกที่ยังใช้งาน + คำเชิญที่ยังไม่ตอบ (กันหว่านลิงก์เชิญเกินโควตา)
-- คำเชิญที่ค้าง กด "ยกเลิก" ในหน้าจัดการทีมเพื่อคืนที่นั่งได้
create or replace function public.org_seats_used(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from public.memberships where org_id = p_org and active)
       + (select count(*) from public.team_invites where org_id = p_org and status = 'pending');
$$;

grant execute on function public.plan_base_seats(text, int) to authenticated;
grant execute on function public.org_seat_limit(uuid) to authenticated;
grant execute on function public.org_seats_used(uuid) to authenticated;

-- ── 3) สร้างลิงก์เชิญ — กันเกินโควตาที่นั่ง ──────────────────
create or replace function public.create_team_invite(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_token text; v_name text; v_limit int; v_used int;
begin
  if not public.is_admin() and not public.is_super() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if v_org is null then raise exception 'ยังไม่ได้อยู่ในองค์กร'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'ต้องระบุอีเมล'; end if;

  v_limit := public.org_seat_limit(v_org);
  if v_limit is not null then
    v_used := public.org_seats_used(v_org);
    -- +1 = ที่นั่งของคำเชิญใบนี้
    if v_used + 1 > v_limit then
      if v_limit <= 1 then
        raise exception 'แพ็กเกจ Free ไม่รองรับลูกทีม — อัปเกรดเป็น Basic/Pro เพื่อเพิ่มทีม';
      else
        raise exception 'ที่นั่งเต็ม (ใช้ % จาก % ที่นั่ง) — ซื้อที่นั่งเพิ่ม หรืออัปเกรดระดับแพ็กเกจ', v_used, v_limit;
      end if;
    end if;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.team_invites (org_id, email, token, invited_by, invited_by_name)
  values (v_org, lower(trim(p_email)), v_token, auth.uid(), v_name);
  return v_token;
end $$;
grant execute on function public.create_team_invite(text) to authenticated;

-- ── 4) รับคำเชิญ — เช็คโควตาซ้ำ (แพ็กเกจอาจลดชั้นหลังส่งลิงก์ไปแล้ว) ──
create or replace function public.accept_invite(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites; my_email text; v_limit int; v_used int;
begin
  select * into inv from public.team_invites where token = p_token and status = 'pending';
  if not found then return 'invalid'; end if;
  select email into my_email from auth.users where id = auth.uid();
  if lower(my_email) <> lower(inv.email) then return 'email_mismatch'; end if;

  -- เป็นสมาชิกอยู่แล้ว → แค่สลับ active มาที่ org นี้ (ไม่กินที่นั่งใหม่)
  if exists (select 1 from public.memberships where user_id = auth.uid() and org_id = inv.org_id) then
    update public.memberships set active = true where user_id = auth.uid() and org_id = inv.org_id;
  else
    v_limit := public.org_seat_limit(inv.org_id);
    if v_limit is not null then
      -- คำเชิญใบนี้ยังเป็น pending จึงถูกนับใน org_seats_used อยู่แล้ว (ไม่ต้อง +1 อีก)
      v_used := public.org_seats_used(inv.org_id);
      if v_used > v_limit then return 'org_full'; end if;
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

-- ── 5) สรุปที่นั่งให้หน้าจัดการทีมอ่าน (RPC เดียว ได้ทั้งใช้แล้ว/ทั้งหมด) ──
create or replace function public.my_seat_usage()
returns table(used int, seat_limit int, base int, extra int, extra_expires date)
language sql stable security definer set search_path = public as $$
  select public.org_seats_used(o.id),
         public.org_seat_limit(o.id),
         public.plan_base_seats(public.org_effective_plan(o.id), o.plan_tier),
         case when o.extra_seats_expires_at is not null and o.extra_seats_expires_at >= current_date
              then o.extra_seats else 0 end,
         o.extra_seats_expires_at
  from public.organizations o
  where o.id = public.current_org();
$$;
grant execute on function public.my_seat_usage() to authenticated;

-- ── 6) ลงบัญชีการซื้อที่นั่งเพิ่ม (เรียกจาก api/verify-charge.js ด้วย service-role) ──
-- กันซ้ำด้วย charge_id เหมือน apply_payment · ไม่แตะ plan/sub_expires_at ขององค์กร
create or replace function public.apply_seat_payment(
  p_charge_id text,
  p_org       uuid,
  p_qty       int,
  p_months    int,
  p_amount    numeric
) returns table(applied boolean, seats int, expires date)
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then raise exception 'จำนวนที่นั่งไม่ถูกต้อง'; end if;
  if p_months not in (1, 12) then raise exception 'รอบชำระไม่ถูกต้อง'; end if;

  insert into public.payments (charge_id, org_id, plan, months, amount)
  values (p_charge_id, p_org, 'seats', p_months, p_amount)
  on conflict (charge_id) do nothing;
  get diagnostics v_inserted = row_count;   -- 1 = ใหม่, 0 = ซ้ำ

  if v_inserted = 0 then
    return query
      select false, o.extra_seats, o.extra_seats_expires_at from public.organizations o where o.id = p_org;
    return;
  end if;

  -- ที่นั่งสะสมเพิ่มขึ้น · อายุต่อจากวันหมดอายุเดิม (หมดแล้ว/ยังไม่เคยมี = นับจากวันนี้)
  update public.organizations
     set extra_seats = extra_seats + p_qty,
         extra_seats_expires_at = (greatest(coalesce(extra_seats_expires_at, current_date), current_date)
                                   + (p_months || ' months')::interval)::date
   where id = p_org
   returning extra_seats, extra_seats_expires_at into seats, expires;

  applied := true;
  return next;
end $$;
revoke all on function public.apply_seat_payment(text, uuid, int, int, numeric) from public, anon, authenticated;
grant execute on function public.apply_seat_payment(text, uuid, int, int, numeric) to service_role;

-- ── 7) ราคาที่นั่งเพิ่ม (super admin แก้ได้จาก app_settings เหมือน trial/referral) ──
-- literal ไม่ระบุชนิด เพื่อให้ลงได้ทั้งกรณี value เป็น jsonb และ text (ตารางมี 2 รุ่นในระบบเดิม)
insert into public.app_settings (key, value)
values ('seats', '{"monthly": 290, "yearly": 2958}')
on conflict (key) do nothing;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare n int;
begin
  -- โควตาต้องตรงตาราง (ตัวเลขชุดเดียวกับ src/lib/plan.ts)
  if public.plan_base_seats('starter', 100) <> 3  then raise exception 'Basic 100 ต้องได้ 3 ที่นั่ง'; end if;
  if public.plan_base_seats('starter', 250) <> 5  then raise exception 'Basic 250 ต้องได้ 5 ที่นั่ง'; end if;
  if public.plan_base_seats('starter', 500) <> 10 then raise exception 'Basic 500 ต้องได้ 10 ที่นั่ง'; end if;
  if public.plan_base_seats('pro', 100) <> 5      then raise exception 'Pro 100 ต้องได้ 5 ที่นั่ง'; end if;
  if public.plan_base_seats('pro', 250) <> 10     then raise exception 'Pro 250 ต้องได้ 10 ที่นั่ง'; end if;
  if public.plan_base_seats('pro', 500) <> 20     then raise exception 'Pro 500 ต้องได้ 20 ที่นั่ง'; end if;
  if public.plan_base_seats('pro', null) <> 20    then raise exception 'ไม่มีระดับ = ระดับ 500'; end if;
  if public.plan_base_seats('free', 100) <> 1     then raise exception 'Free ต้องได้ 1 ที่นั่ง'; end if;
  if public.plan_base_seats('enterprise', 100) is not null then raise exception 'Enterprise ต้องไม่จำกัด'; end if;

  -- ฟังก์ชันที่หน้าเว็บ/เซิร์ฟเวอร์เรียกต้องมีครบ
  if to_regprocedure('public.org_seat_limit(uuid)') is null
     or to_regprocedure('public.org_seats_used(uuid)') is null
     or to_regprocedure('public.my_seat_usage()') is null
     or to_regprocedure('public.apply_seat_payment(text,uuid,int,int,numeric)') is null then
    raise exception 'ฟังก์ชันที่นั่งไม่ครบ';
  end if;

  -- ต้องเลิกใช้กติกาเดิม (org_is_pro / เพดาน 2 คน) ในเส้นทางเชิญทีม
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname in ('create_team_invite', 'accept_invite')
    and (p.prosrc like '%org_is_pro%' or p.prosrc like '%cnt >= 2%');
  if n > 0 then raise exception 'create_team_invite/accept_invite ยังใช้กติกาเดิมอยู่'; end if;

  -- ผู้ใช้ทั่วไปต้องเรียก apply_seat_payment ไม่ได้ (ไม่งั้นแจกที่นั่งฟรีเอง)
  if has_function_privilege('authenticated', 'public.apply_seat_payment(text,uuid,int,int,numeric)', 'execute') then
    raise exception 'apply_seat_payment ต้องเรียกได้เฉพาะ service_role';
  end if;

  raise notice '✅ seats: Basic 3/5/10 · Pro 5/10/20 · Free 1 · Enterprise ไม่จำกัด · ซื้อที่นั่งเพิ่มได้';
end $$;
