-- ============================================================
-- โครงสร้างราคาใหม่: Basic/Pro ไล่ระดับตามจำนวนทรัพย์ (100/250/500) + Enterprise คุยเซลล์
--   Basic (คีย์ในระบบยังเป็น 'starter'): 590 / 790 / 990 ฿/เดือน
--   Pro:                                1,190 / 1,390 / 1,590 ฿/เดือน (รายปีลด 15%)
--   Free ใหม่: ทรัพย์ ≤ 5 · ไม่มีลูกทีม (บังคับใน api/create-member.js)
-- รันซ้ำได้ (idempotent) — ต้องรันก่อน deploy โค้ดชุดนี้
-- ============================================================
begin;

-- 1) ระดับ (โควตาทรัพย์) ขององค์กร — 100/250/500 · null = ยังไม่เคยเลือก (ตีความเป็น 500)
alter table public.organizations add column if not exists plan_tier int;
alter table public.payments add column if not exists tier int;

-- ลูกค้าเดิมที่จ่าย starter/pro อยู่ → ระดับสูงสุด 500 (ราคาเท่าเดิม ไม่มีใครเสียประโยชน์)
update public.organizations set plan_tier = 500
 where plan in ('starter', 'pro') and plan_tier is null;

-- 2) plan_prices: เพิ่มคอลัมน์ tier แล้วขยาย primary key เป็น (plan, tier)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plan_prices' and column_name = 'tier'
  ) then
    alter table public.plan_prices add column tier int not null default 500;
    alter table public.plan_prices drop constraint plan_prices_pkey;
    alter table public.plan_prices add primary key (plan, tier);
    alter table public.plan_prices add constraint plan_prices_tier_check check (tier in (100, 250, 500));
  end if;
end $$;

-- แถวเดิม (starter 990 / pro 1290) กลายเป็นระดับ 500 อัตโนมัติ —
-- pro ระดับ 500 ราคาใหม่คือ 1,590: อัปเดตให้เฉพาะกรณียังเป็นค่าเดิม 1,290 (ถ้า super เคยตั้งเองไม่ทับ)
update public.plan_prices set monthly = 1590, yearly = 16218, updated_at = now()
 where plan = 'pro' and tier = 500 and monthly = 1290;

-- เติมระดับที่ยังไม่มี (รายปี = ลด 15%) — on conflict do nothing ไม่ทับราคาที่ตั้งไว้แล้ว
insert into public.plan_prices (plan, tier, monthly, yearly) values
  ('starter', 100, 590,  6018),
  ('starter', 250, 790,  8058),
  ('starter', 500, 990,  10098),
  ('pro',     100, 1190, 12138),
  ('pro',     250, 1390, 14178),
  ('pro',     500, 1590, 16218)
on conflict (plan, tier) do nothing;

-- 3) apply_payment รับระดับด้วย — ลายเซ็นเปลี่ยน ต้อง drop ตัวเดิมก่อน
drop function if exists public.apply_payment(text, uuid, text, int, numeric);
create or replace function public.apply_payment(
  p_charge_id text,
  p_org       uuid,
  p_plan      text,
  p_months    int,
  p_amount    numeric,
  p_tier      int default null
) returns table(applied boolean, expires date)
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  insert into public.payments (charge_id, org_id, plan, months, amount, tier)
  values (p_charge_id, p_org, p_plan, p_months, p_amount, p_tier)
  on conflict (charge_id) do nothing;
  get diagnostics v_inserted = row_count;   -- 1 = ใหม่, 0 = ซ้ำ

  if v_inserted = 0 then
    return query select false, (select sub_expires_at from public.organizations where id = p_org);
    return;
  end if;

  update public.organizations
     set plan = p_plan,
         -- จ่าย tier ไหนได้ tier นั้น · รายการเก่าไม่มี tier = คงระดับเดิม (ไม่มี = 500)
         plan_tier = case when p_plan in ('starter', 'pro')
                          then coalesce(p_tier, plan_tier, 500) else plan_tier end,
         sub_status = 'active',
         sub_expires_at = (greatest(coalesce(sub_expires_at, current_date), current_date)
                           + (p_months || ' months')::interval)::date
   where id = p_org
   returning sub_expires_at into expires;

  applied := true;
  return next;
end $$;
revoke all on function public.apply_payment(text, uuid, text, int, numeric, int) from public, anon, authenticated;
grant execute on function public.apply_payment(text, uuid, text, int, numeric, int) to service_role;

-- 4) โควตาทรัพย์ฝั่งเซิร์ฟเวอร์ (กันเลี่ยง client): Free ≤ 5 · Basic/Pro ≤ ระดับ · Enterprise/super ไม่จำกัด
--    ช่วงทดลองใช้ (plan=free แต่ trial ยังไม่หมด) = ระดับ 500
create or replace function public.enforce_property_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org();
  v_plan text; v_trial text; v_trial_exp date; v_tier int;
  v_eff text; v_limit int; cnt int;
begin
  if public.is_super() then return new; end if;
  select o.plan, o.trial_plan, o.trial_expires_at, o.plan_tier
    into v_plan, v_trial, v_trial_exp, v_tier
    from public.organizations o where o.id = v_org;

  -- แพ็กเกจที่มีผลจริง: จ่ายจริง > ช่วงทดลอง > free (ตรรกะเดียวกับ org_effective_plan)
  v_eff := case
    when coalesce(v_plan, 'free') <> 'free' then v_plan
    when v_trial_exp is not null and v_trial_exp >= current_date then coalesce(v_trial, 'free')
    else 'free' end;

  if v_eff = 'enterprise' then return new; end if;
  v_limit := case when v_eff = 'free' then 5 else coalesce(v_tier, 500) end;

  select count(*) into cnt from public.properties where org_id = v_org;
  if cnt >= v_limit then
    if v_eff = 'free' then
      raise exception 'แพ็กเกจ Free เพิ่มทรัพย์ได้สูงสุด 5 รายการ — เลือกแพ็กเกจเพื่อเพิ่มโควตา';
    else
      raise exception 'ทรัพย์เต็มโควตาระดับปัจจุบัน (% รายการ) — อัปเกรดระดับแพ็กเกจเพื่อเพิ่มทรัพย์ได้อีก', v_limit;
    end if;
  end if;
  return new;
end $$;
-- trigger trg_property_limit มีอยู่แล้ว (plan-gating.sql) ชี้ฟังก์ชันนี้ — replace ก็มีผลทันที
drop trigger if exists trg_property_limit on public.properties;
create trigger trg_property_limit before insert on public.properties
  for each row execute function public.enforce_property_limit();

commit;

-- ทดสอบตัวเอง
do $$
declare n int;
begin
  select count(*) into n from public.plan_prices;
  if n < 6 then raise exception 'plan_prices มี % แถว (ต้อง ≥ 6)', n; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='organizations' and column_name='plan_tier') then
    raise exception 'organizations.plan_tier ยังไม่ถูกสร้าง';
  end if;
  raise notice '✅ plan-tiers: ราคา 6 ช่อง + plan_tier + apply_payment(tier) + โควตา Free 5 พร้อมแล้ว';
end $$;
