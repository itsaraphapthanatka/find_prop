-- ที่นั่งทีม รอบปรับ: super admin ตั้งจำนวนที่นั่งขั้นต่ำต่อแพ็กเกจได้ + ช่วงทดลองใช้ไม่จำกัดที่นั่ง
-- ============================================================
-- เปลี่ยนจากเดิม 2 เรื่อง:
--   1) จำนวนที่นั่งของแต่ละแพ็กเกจ/ระดับ ย้ายจาก "ฝังในโค้ด" → app_settings key 'seats'
--      (super admin แก้ได้จากหน้า Super Admin · ค่าที่ยังไม่ตั้งจะถอยไปใช้ค่ามาตรฐานเดิม)
--   2) ช่วงทดลองใช้ (14 วันตามตั้งค่า) = ไม่จำกัดที่นั่ง — เชิญทีมได้เต็มที่
--      พอหมดช่วงทดลอง โควตากลับมาเป็นของแพ็กเกจที่จ่ายจริง ส่วนที่เกินต้องซื้อที่นั่งเพิ่ม
--      ⚠️ คนที่เกินโควตา "ไม่ถูกเตะออก" — แค่เชิญคนใหม่ไม่ได้จนกว่าจะจ่าย (หน้าจัดการทีมบอกยอดที่ต้องจ่าย)
--
-- โครงสร้าง app_settings['seats']:
--   { "monthly": 290, "yearly": 2958,
--     "base": { "free": 1,
--               "starter": {"100": 3, "250": 5, "500": 10},
--               "pro":     {"100": 5, "250": 10, "500": 20} } }
--
-- ต้องรันหลัง supabase/seats.sql + roles.sql · รันซ้ำได้
-- ============================================================

begin;

-- ── 1) เติมค่ามาตรฐานของ "ที่นั่งต่อแพ็กเกจ" ลงในตั้งค่า (ไม่ทับค่าที่ super แก้ไว้) ──
insert into public.app_settings (key, value)
values ('seats', '{"monthly": 290, "yearly": 2958}')
on conflict (key) do nothing;

update public.app_settings
   set value = value || jsonb_build_object('base', jsonb_build_object(
         'free', 1,
         'starter', jsonb_build_object('100', 3, '250', 5, '500', 10),
         'pro',     jsonb_build_object('100', 5, '250', 10, '500', 20)
       )),
       updated_at = now()
 where key = 'seats' and (value -> 'base') is null;

-- ── 2) ที่นั่งของแพ็กเกจ — อ่านจากตั้งค่า ถ้าไม่มี/ค่าเพี้ยนถอยไปใช้ค่ามาตรฐาน ──
-- เดิมเป็น immutable (ตัวเลขฝังในฟังก์ชัน) ตอนนี้อ่านตาราง → stable
create or replace function public.plan_base_seats(p_plan text, p_tier int)
returns int language sql stable security definer set search_path = public as $$
  with cfg as (select value -> 'base' as base from public.app_settings where key = 'seats'),
  raw as (
    select case p_plan
      when 'enterprise' then null                       -- ไม่จำกัด
      when 'pro' then (select (base -> 'pro'     ->> coalesce(p_tier, 500)::text)::int from cfg)
      when 'starter' then (select (base -> 'starter' ->> coalesce(p_tier, 500)::text)::int from cfg)
      else (select (base ->> 'free')::int from cfg)      -- free/ไม่รู้จัก = เจ้าของคนเดียว
    end as n
  )
  select case
    when p_plan = 'enterprise' then null
    -- ค่าที่ตั้งไว้ต้องเป็นเลข >= 1 · ไม่งั้นใช้ค่ามาตรฐานเดิม (กันตั้งค่าพลาดแล้วทีมล็อกตัวเอง)
    when (select n from raw) >= 1 then (select n from raw)
    when p_plan = 'pro' then case coalesce(p_tier, 500) when 100 then 5 when 250 then 10 else 20 end
    when p_plan = 'starter' then case coalesce(p_tier, 500) when 100 then 3 when 250 then 5 else 10 end
    else 1
  end;
$$;

-- ── 3) ช่วงทดลองใช้ = ไม่จำกัดที่นั่ง ──
-- "ยังทดลองใช้" = ยังไม่ได้จ่ายจริง (plan ว่าง/free) + วันหมดทดลองยังไม่ถึง
create or replace function public.org_on_trial(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(o.plan, 'free') = 'free'
       and o.trial_expires_at is not null
       and o.trial_expires_at >= current_date
    from public.organizations o where o.id = p_org
  ), false);
$$;

create or replace function public.org_seat_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when public.org_on_trial(p_org) then null            -- ทดลองใช้ = ไม่จำกัด
    when base is null then null                          -- enterprise = ไม่จำกัด
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

-- ── 4) สรุปที่นั่งให้หน้าจัดการทีม — เพิ่มธง "ยังทดลองใช้" + วันหมดทดลอง ──
-- เปลี่ยนคอลัมน์ที่คืน จึงต้อง drop ก่อน (create or replace เปลี่ยน OUT params ไม่ได้)
drop function if exists public.my_seat_usage();
create function public.my_seat_usage()
returns table(
  used int, seat_limit int, base int, extra int, extra_expires date,
  on_trial boolean, trial_expires date
)
language sql stable security definer set search_path = public as $$
  select public.org_seats_used(o.id),
         public.org_seat_limit(o.id),
         public.plan_base_seats(public.org_effective_plan(o.id), o.plan_tier),
         case when o.extra_seats_expires_at is not null and o.extra_seats_expires_at >= current_date
              then o.extra_seats else 0 end,
         o.extra_seats_expires_at,
         public.org_on_trial(o.id),
         o.trial_expires_at
  from public.organizations o
  where o.id = public.current_org();
$$;
grant execute on function public.my_seat_usage() to authenticated;
grant execute on function public.org_on_trial(uuid) to authenticated;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare v jsonb; n int;
begin
  select value into v from public.app_settings where key = 'seats';
  if v -> 'base' is null then raise exception 'ยังไม่มีค่าที่นั่งต่อแพ็กเกจใน app_settings'; end if;

  -- อ่านจากตั้งค่าได้ตรงกับที่ใส่ไว้
  if public.plan_base_seats('starter', 100) <> (v -> 'base' -> 'starter' ->> '100')::int then
    raise exception 'Basic 100 ไม่ตรงกับค่าที่ตั้งไว้';
  end if;
  if public.plan_base_seats('pro', 500) <> (v -> 'base' -> 'pro' ->> '500')::int then
    raise exception 'Pro 500 ไม่ตรงกับค่าที่ตั้งไว้';
  end if;
  if public.plan_base_seats('free', null) <> (v -> 'base' ->> 'free')::int then
    raise exception 'Free ไม่ตรงกับค่าที่ตั้งไว้';
  end if;
  if public.plan_base_seats('enterprise', 100) is not null then
    raise exception 'Enterprise ต้องไม่จำกัด';
  end if;

  -- ระดับที่ไม่มีในตั้งค่า (เช่นข้อมูลเก่า tier แปลกๆ) ต้องถอยไปใช้ค่ามาตรฐาน
  -- ไม่ใช่คืน null/0 แล้วล็อกทีมเหลือศูนย์ที่นั่ง
  if public.plan_base_seats('starter', 999) <> 10 then
    raise exception 'ระดับที่ไม่รู้จักต้องถอยไปใช้ค่ามาตรฐานของระดับ 500 (10)';
  end if;
  if public.plan_base_seats('pro', 999) <> 20 then
    raise exception 'ระดับที่ไม่รู้จัก (pro) ต้องได้ 20';
  end if;

  -- ฟังก์ชันช่วงทดลอง + คอลัมน์ใหม่ของ my_seat_usage
  if to_regprocedure('public.org_on_trial(uuid)') is null then raise exception 'ไม่มี org_on_trial'; end if;
  if pg_get_function_result(to_regprocedure('public.my_seat_usage()')) not like '%on_trial%'
     or pg_get_function_result(to_regprocedure('public.my_seat_usage()')) not like '%trial_expires%' then
    raise exception 'my_seat_usage ยังไม่คืนธงช่วงทดลอง';
  end if;

  -- org ที่ยังทดลองใช้ต้องได้ที่นั่งไม่จำกัด (ถ้ามีให้ทดสอบ)
  select count(*) into n from public.organizations o
   where public.org_on_trial(o.id) and public.org_seat_limit(o.id) is not null;
  if n > 0 then raise exception 'มีองค์กรที่ยังทดลองใช้แต่ที่นั่งไม่ไม่จำกัด % แถว', n; end if;

  raise notice '✅ seats-config: super ตั้งที่นั่งต่อแพ็กเกจได้ + ช่วงทดลองใช้ไม่จำกัดที่นั่ง';
end $$;
