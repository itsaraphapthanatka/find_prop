-- ชวนเพื่อน: ให้รางวัล "เมื่อเพื่อนจ่ายเงินครั้งแรก" + เพดานรวม + ไม่กินวันทดลองที่เหลือ
-- ============================================================
-- 3 เรื่องที่แก้ (จากการไล่เคส "สมัครช่วงทดลอง 14 วัน แล้วไปชวนเพื่อน"):
--
--   1) ⭐ เดิมให้รางวัลตอนเพื่อน "สร้างองค์กร" เสร็จ — ไม่ต้องจ่ายเงินเลย
--      → ใช้อีเมลชั่วคราวสมัคร 6 บัญชี = Pro ฟรี 90 วัน โดยไม่มีเงินเข้าระบบ
--      แก้: นับเฉพาะเพื่อนที่ "จ่ายเงินแล้วจริง" (มีแถวใน public.payments)
--      → apply_referral() เหลือหน้าที่ "ผูกผู้ชวน" อย่างเดียว
--      → รางวัลออกใน apply_payment()/apply_seat_payment() ตอนเงินเข้า
--
--   2) วันทดลองที่เหลือหายไป — org ที่ยังทดลองใช้มี sub_expires_at = null
--      เดิมคิดจาก greatest(sub_expires_at, current_date) = วันนี้
--      → เหลือทดลองอีก 13 วัน + รางวัล 30 วัน ได้แค่ 30 วันจากวันนี้ (ไม่ใช่ 43)
--      แก้: นับต่อจาก "วันหมดทดลอง" ด้วย
--
--   3) ไม่มีเพดาน — ชวนเรื่อยๆ = ใช้ Pro ฟรีตลอดชีพ
--      แก้: จำกัดรางวัลรวมต่อองค์กร (ค่าเริ่มต้น 90 วัน) ตั้งได้ที่
--      app_settings['referral'].maxDays (0 = ปิดรางวัล)
--
-- ⚠️ รางวัลที่ให้ไปแล้วก่อนรันไฟล์นี้ ไม่ถูกยึดคืน แต่ referral_rewards_granted เดิมยังอยู่
--    → เพื่อนที่สมัครไว้แล้วแต่ยังไม่จ่าย จะไม่ทำให้ได้รางวัลรอบใหม่อีก จนกว่าจะมีคนจ่ายจริง
-- ต้องรันหลัง supabase/referral-setting.sql + plan-tiers.sql (apply_payment) · รันซ้ำได้
-- ============================================================

begin;

-- ยอดวันรางวัลที่ให้ไปแล้วรวมทั้งหมด (ใช้เทียบกับเพดาน)
alter table public.organizations
  add column if not exists referral_reward_days int not null default 0;

-- เพดานรวม 90 วัน (เติมให้แถวตั้งค่าเดิม ไม่ทับ need/days ที่ super แก้ไว้)
insert into public.app_settings (key, value) values ('referral', '{"need": 2, "days": 30, "maxDays": 90}')
on conflict (key) do nothing;
update public.app_settings
   set value = value || jsonb_build_object('maxDays', 90), updated_at = now()
 where key = 'referral' and (value -> 'maxDays') is null;

-- ── 1) ผูกผู้ชวน (ไม่ให้รางวัลที่นี่แล้ว) ──────────────────
create or replace function public.apply_referral(ref_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  my_org uuid := public.current_org();
  ref_org uuid;
begin
  if my_org is null then return 'no_org'; end if;
  -- องค์กรของเราต้องยังไม่เคยถูกผูกผู้ชวน (กันผูกซ้ำ/เปลี่ยนผู้ชวน)
  if exists (select 1 from public.organizations where id = my_org and referred_by is not null) then
    return 'already_referred';
  end if;
  select id into ref_org from public.organizations
    where upper(referral_code) = upper(trim(ref_code));
  if ref_org is null then return 'invalid_code'; end if;
  if ref_org = my_org then return 'self'; end if;  -- กันชวนตัวเอง

  update public.organizations set referred_by = ref_org where id = my_org;
  -- ⭐ ไม่ให้รางวัลตรงนี้ — รางวัลออกตอนองค์กรนี้จ่ายเงินครั้งแรก (grant_referral_reward)
  return 'ok';
end $$;
grant execute on function public.apply_referral(text) to authenticated;

-- ── 2) ให้รางวัลผู้ชวน — เรียกตอน "องค์กรที่ถูกชวนจ่ายเงิน" ──
-- นับเฉพาะเพื่อนที่มีแถวใน payments (จ่ายจริงผ่าน PunPay) → ฟาร์มด้วยอีเมลปลอมไม่ได้
create or replace function public.grant_referral_reward(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ref_org uuid;
  paid_cnt int; should int;
  v_need int; v_days int; v_max int;
  v_granted int; v_days_used int; v_add int;
begin
  select referred_by into ref_org from public.organizations where id = p_org;
  if ref_org is null then return; end if;                        -- ไม่ได้มาจากลิงก์ชวน

  -- เกณฑ์จากตั้งค่า — ไม่มีแถว/ค่าเพี้ยน → ใช้ 2 คน / 30 วัน / เพดาน 90 วัน
  select greatest(1, coalesce((value->>'need')::int, 2)),
         greatest(1, coalesce((value->>'days')::int, 30)),
         greatest(0, coalesce((value->>'maxDays')::int, 90))
    into v_need, v_days, v_max
    from public.app_settings where key = 'referral';
  v_need := coalesce(v_need, 2);
  v_days := coalesce(v_days, 30);
  v_max  := coalesce(v_max, 90);

  -- เพื่อนที่ "จ่ายเงินแล้ว" ของผู้ชวนคนนี้มีกี่ราย
  select count(*)::int into paid_cnt
    from public.organizations o
   where o.referred_by = ref_org
     and exists (select 1 from public.payments pay where pay.org_id = o.id);

  should := paid_cnt / v_need;
  select referral_rewards_granted, referral_reward_days
    into v_granted, v_days_used
    from public.organizations where id = ref_org;
  if should <= v_granted then return; end if;                    -- ยังไม่ครบรอบใหม่

  -- วันที่จะให้รอบนี้ ตัดด้วยเพดานรวมที่เหลือ (เพดาน 0 = ปิดรางวัล)
  v_add := least((should - v_granted) * v_days, greatest(0, v_max - v_days_used));
  if v_add > 0 then
    update public.organizations set
      plan = case when plan = 'enterprise' then plan else 'pro' end,
      sub_status = 'active',
      -- ⭐ นับต่อจาก "วันหมดอายุที่ไกลสุด" ระหว่างแพ็กเกจที่จ่ายไว้ กับวันหมดทดลอง
      --    (org ที่ยังทดลองใช้ sub_expires_at เป็น null — เดิมจึงกินวันทดลองที่เหลือทิ้ง)
      sub_expires_at = (greatest(coalesce(sub_expires_at, current_date),
                                 coalesce(trial_expires_at, current_date),
                                 current_date)
                        + make_interval(days => v_add))::date,
      referral_reward_days = referral_reward_days + v_add
    where id = ref_org;
  end if;
  -- นับรอบไว้เสมอ แม้ชนเพดาน (ไม่งั้นรอบเดิมจะวนขอรางวัลใหม่ทุกครั้งที่มีคนจ่ายเงิน)
  -- หมายเหตุ: ถ้า super "ขยายเพดาน" ทีหลัง จะมีผลกับรอบใหม่เท่านั้น
  update public.organizations set referral_rewards_granted = should where id = ref_org;
end $$;
-- ผู้ใช้ทั่วไปต้องเรียกเองไม่ได้ (ไม่งั้นแจกวัน Pro ให้ตัวเองได้) — เรียกจาก apply_payment เท่านั้น
revoke all on function public.grant_referral_reward(uuid) from public, anon, authenticated;

-- ── 3) ผูกเข้ากับการชำระเงิน ────────────────────────────────
-- apply_payment: ต่ออายุ/อัปเกรดแพ็กเกจ (จาก api/verify-charge.js ด้วย service-role)
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

  -- ⭐ เงินเข้าแล้ว → ถ้า org นี้มาจากลิงก์ชวน ให้เครดิตผู้ชวน
  --    ห่อ exception ไว้: รางวัลพลาดต้องไม่ทำให้ "การจ่ายเงิน" ล้ม (เงินเข้าแล้วต้องได้แพ็กเกจ)
  begin
    perform public.grant_referral_reward(p_org);
  exception when others then null;
  end;

  applied := true;
  return next;
end $$;
revoke all on function public.apply_payment(text, uuid, text, int, numeric, int) from public, anon, authenticated;
grant execute on function public.apply_payment(text, uuid, text, int, numeric, int) to service_role;

-- apply_seat_payment: ซื้อที่นั่งเพิ่ม — เงินเข้าจริงเหมือนกัน จึงนับเป็น "จ่ายแล้ว" ด้วย
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
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query
      select false, o.extra_seats, o.extra_seats_expires_at from public.organizations o where o.id = p_org;
    return;
  end if;

  update public.organizations
     set extra_seats = extra_seats + p_qty,
         extra_seats_expires_at = (greatest(coalesce(extra_seats_expires_at, current_date), current_date)
                                   + (p_months || ' months')::interval)::date
   where id = p_org
   returning extra_seats, extra_seats_expires_at into seats, expires;

  begin
    perform public.grant_referral_reward(p_org);
  exception when others then null;
  end;

  applied := true;
  return next;
end $$;
revoke all on function public.apply_seat_payment(text, uuid, int, int, numeric) from public, anon, authenticated;
grant execute on function public.apply_seat_payment(text, uuid, int, int, numeric) to service_role;

-- ── 4) สถานะชวนเพื่อน: แยก "สมัครแล้ว" กับ "จ่ายแล้ว" + ยอดวัน/เพดาน ──
drop function if exists public.referral_status();
create function public.referral_status()
returns table(
  code text, referred_count int, paid_count int, rewards_granted int, plan text, expires_at date,
  reward_days int, max_reward_days int
)
language sql stable security definer set search_path = public as $$
  select o.referral_code,
         (select count(*)::int from public.organizations r where r.referred_by = o.id),
         (select count(*)::int from public.organizations r
           where r.referred_by = o.id
             and exists (select 1 from public.payments pay where pay.org_id = r.id)),
         o.referral_rewards_granted,
         o.plan,
         o.sub_expires_at,
         o.referral_reward_days,
         greatest(0, coalesce((select (value->>'maxDays')::int from public.app_settings where key = 'referral'), 90))
  from public.organizations o
  where o.id = public.current_org();
$$;
grant execute on function public.referral_status() to authenticated;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare v jsonb; src text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'referral_reward_days'
  ) then raise exception 'ไม่มีคอลัมน์ referral_reward_days'; end if;

  select value into v from public.app_settings where key = 'referral';
  if (v -> 'maxDays') is null then raise exception 'ยังไม่มีเพดาน maxDays ในตั้งค่า referral'; end if;

  -- apply_referral ต้องไม่แจกรางวัลเองแล้ว
  select prosrc into src from pg_proc where proname = 'apply_referral';
  if src like '%sub_expires_at%' then
    raise exception 'apply_referral ยังแจกรางวัลอยู่ — ต้องเหลือแค่ผูกผู้ชวน';
  end if;

  -- ตัวแจกรางวัลต้องนับเฉพาะเพื่อนที่จ่ายแล้ว + มีเพดาน + ต่อจากวันหมดทดลอง
  select prosrc into src from pg_proc where proname = 'grant_referral_reward';
  if src is null then raise exception 'ไม่มีฟังก์ชัน grant_referral_reward'; end if;
  if src not like '%from public.payments%' then
    raise exception 'grant_referral_reward ไม่ได้เช็คว่าเพื่อนจ่ายเงินแล้ว';
  end if;
  if src not like '%trial_expires_at%' then
    raise exception 'grant_referral_reward ยังไม่นับต่อจากวันหมดทดลอง';
  end if;
  if src not like '%v_max%' then raise exception 'grant_referral_reward ยังไม่มีเพดาน'; end if;

  -- เงินเข้าต้องเรียกตัวแจกรางวัล (ทั้งซื้อแพ็กเกจและซื้อที่นั่ง)
  select prosrc into src from pg_proc where proname = 'apply_payment';
  if src not like '%grant_referral_reward%' then
    raise exception 'apply_payment ยังไม่เครดิตผู้ชวนตอนเงินเข้า';
  end if;
  select prosrc into src from pg_proc where proname = 'apply_seat_payment';
  if src not like '%grant_referral_reward%' then
    raise exception 'apply_seat_payment ยังไม่เครดิตผู้ชวนตอนเงินเข้า';
  end if;

  -- ผู้ใช้ทั่วไปต้องเรียกตัวแจกรางวัลเองไม่ได้
  if has_function_privilege('authenticated', 'public.grant_referral_reward(uuid)', 'execute') then
    raise exception 'grant_referral_reward ต้องเรียกได้เฉพาะฝั่งเซิร์ฟเวอร์';
  end if;

  if pg_get_function_result(to_regprocedure('public.referral_status()')) not like '%paid_count%' then
    raise exception 'referral_status ยังไม่แยกยอด "จ่ายแล้ว"';
  end if;

  raise notice '✅ referral: ได้รางวัลเมื่อเพื่อนจ่ายเงินครั้งแรก · เพดานรวม % วัน · ต่อจากวันหมดทดลอง', v->>'maxDays';
end $$;
