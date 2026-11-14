-- HOP · ที่นั่งฟรีรายองค์กร (super admin ให้) + ปิดช่องแอดมินองค์กรแก้คอลัมน์ที่นั่ง/ระดับเอง
-- รันใน Supabase SQL Editor ทั้งไฟล์ครั้งเดียว (ทรานแซกชันเดียว · error = rollback หมด · รันซ้ำได้)
-- ต้องรันหลัง seats.sql + seats-config.sql + trial.sql (ฟังก์ชันที่ redefine ที่นี่คัดลอกจากรุ่นล่าสุดของไฟล์เหล่านั้น)
-- ------------------------------------------------------------------
-- 1) organizations.bonus_seats = ที่นั่งที่ super admin ให้ฟรี (ไม่มีวันหมดอายุ · 0 = ไม่มี)
--    บวกทับ "ที่นั่งของแพ็กเกจ + ที่นั่งที่ซื้อเพิ่ม" · ช่วงทดลองใช้/Enterprise ไม่จำกัดอยู่แล้ว
-- 2) super_set_bonus_seats(org, จำนวน) — ทางเดียวที่ตั้งค่านี้ได้ (เฉพาะ super)
-- 3) guard_org_update เดิมกันแค่ plan/sub_*/trial_* — แอดมินองค์กร (policy "org update")
--    จึงยิง PATCH ตั้ง extra_seats / extra_seats_expires_at / plan_tier ให้ตัวเองได้ (ได้ที่นั่ง/โควตาฟรี)
--    รอบนี้กันเพิ่มทั้ง 3 คอลัมน์ + bonus_seats · ผู้ที่แก้ได้ยังเหมือนเดิม:
--    service_role (เซิร์ฟเวอร์: apply_payment / apply_seat_payment / apply_stripe_invoice) · postgres (SQL Editor) · super
begin;

-- ── 1) คอลัมน์ ──
alter table public.organizations
  add column if not exists bonus_seats int not null default 0;
alter table public.organizations drop constraint if exists organizations_bonus_seats_check;
alter table public.organizations
  add constraint organizations_bonus_seats_check check (bonus_seats >= 0 and bonus_seats <= 500);

-- ── 2) โควตาที่นั่ง = แพ็กเกจ + ซื้อเพิ่ม (ยังไม่หมดอายุ) + ฟรีจาก super ──
create or replace function public.org_seat_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when public.org_on_trial(p_org) then null            -- ทดลองใช้ = ไม่จำกัด
    when base is null then null                          -- enterprise = ไม่จำกัด
    else base + case when o.extra_seats_expires_at is not null
                      and o.extra_seats_expires_at >= current_date
                     then o.extra_seats else 0 end
              + coalesce(o.bonus_seats, 0)
  end
  from public.organizations o
  cross join lateral (
    select public.plan_base_seats(public.org_effective_plan(o.id), o.plan_tier) as base
  ) b
  where o.id = p_org;
$$;

-- ── 3) สรุปที่นั่งให้หน้าจัดการทีม — เพิ่มคอลัมน์ bonus (ต่อท้าย · แอปรุ่นเก่าไม่สนคอลัมน์ใหม่) ──
drop function if exists public.my_seat_usage();
create function public.my_seat_usage()
returns table(
  used int, seat_limit int, base int, extra int, extra_expires date,
  on_trial boolean, trial_expires date, bonus int
)
language sql stable security definer set search_path = public as $$
  select public.org_seats_used(o.id),
         public.org_seat_limit(o.id),
         public.plan_base_seats(public.org_effective_plan(o.id), o.plan_tier),
         case when o.extra_seats_expires_at is not null and o.extra_seats_expires_at >= current_date
              then o.extra_seats else 0 end,
         o.extra_seats_expires_at,
         public.org_on_trial(o.id),
         o.trial_expires_at,
         coalesce(o.bonus_seats, 0)
  from public.organizations o
  where o.id = public.current_org();
$$;
grant execute on function public.my_seat_usage() to authenticated;

-- ── 4) super ตั้งที่นั่งฟรีให้องค์กร (ตั้งเป็นยอดใหม่ ไม่ใช่บวกเพิ่ม · 0 = ยกเลิก) ──
create or replace function public.super_set_bonus_seats(p_org uuid, p_qty int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_super() then raise exception 'เฉพาะ super admin เท่านั้น'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 500 then
    raise exception 'จำนวนที่นั่งฟรีต้องอยู่ระหว่าง 0–500';
  end if;
  update public.organizations set bonus_seats = p_qty where id = p_org returning bonus_seats into v;
  if not found then raise exception 'ไม่พบองค์กรนี้'; end if;
  return v;
end $$;
revoke all on function public.super_set_bonus_seats(uuid, int) from public, anon;
grant execute on function public.super_set_bonus_seats(uuid, int) to authenticated;

-- ── 5) กันแอดมินองค์กรแก้คอลัมน์ที่เกี่ยวกับเงิน/โควตาเอง (คัดจาก trial.sql + คอลัมน์ที่นั่ง/ระดับ) ──
--    ห้ามใช้ current_user ใน security definer (= เจ้าของฟังก์ชันเสมอ) — ใช้ session_user ตามเดิม
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
     or new.trial_expires_at is distinct from old.trial_expires_at
     or new.plan_tier is distinct from old.plan_tier
     or new.extra_seats is distinct from old.extra_seats
     or new.extra_seats_expires_at is distinct from old.extra_seats_expires_at
     or new.bonus_seats is distinct from old.bonus_seats then
    raise exception 'เฉพาะ super admin เท่านั้นที่แก้ข้อมูล subscription ได้';
  end if;
  return new;
end $$;

commit;

-- ── ตรวจผล (ต้องได้ ok = true ทุกแถว) ──
select 'คอลัมน์ bonus_seats' as check, exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'organizations' and column_name = 'bonus_seats') as ok
union all
select 'org_seat_limit นับ bonus', (select prosrc like '%bonus_seats%' from pg_proc where proname = 'org_seat_limit')
union all
select 'my_seat_usage มีคอลัมน์ bonus', exists (
  select 1 from pg_proc where proname = 'my_seat_usage' and 'bonus' = any(proargnames))
union all
select 'super_set_bonus_seats', exists (select 1 from pg_proc where proname = 'super_set_bonus_seats')
union all
select 'guard กันที่นั่ง/ระดับ', (select prosrc like '%extra_seats%' and prosrc like '%plan_tier%' and prosrc like '%bonus_seats%'
                                  from pg_proc where proname = 'guard_org_update')
union all
select 'trigger guard ยังผูกอยู่', exists (
  select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where p.proname = 'guard_org_update' and not t.tgisinternal);
