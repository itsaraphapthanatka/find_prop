-- HOP · เปลี่ยนระบบเก็บเงินเป็น Stripe (subscription ตัดบัตรอัตโนมัติทุกรอบ)
-- รันใน Supabase → SQL Editor → Run (idempotent · รันซ้ำได้ · ทรานแซกชันเดียว ไม่แตะข้อมูลเดิม)
-- รุ่น 2 (2026-10-16): + billing_past_due (แถบเตือนตัดบัตรไม่ผ่าน) — ระบบที่รันรุ่นแรกไปแล้ว รันไฟล์นี้ซ้ำได้เลย
-- รุ่น 3 (2026-10-18): apply_stripe_invoice ตรวจค่าว่าง (NULL) ด้วย — เดิม `null not in (...)` ได้ null ไม่เข้า if
--   ใบที่ Price ไม่มี metadata จะตั้ง plan/plan_tier เป็นค่าว่างให้องค์กรที่เพิ่งจ่ายเงิน · รันไฟล์นี้ซ้ำได้เลย
-- ------------------------------------------------------------------
-- หลักการ:
--   • 1 องค์กร = 1 Stripe customer · แพ็กเกจ = 1 subscription · ที่นั่งเพิ่ม = อีก 1 subscription (quantity = จำนวนที่นั่ง)
--   • ทุกใบแจ้งหนี้ที่จ่ายแล้ว (invoice.paid) → apply_stripe_invoice: ตั้งแพ็กเกจ/ระดับ/ที่นั่ง
--     + ต่อวันหมดอายุ = วันสิ้นรอบของ Stripe + 3 วัน (เผื่อ Stripe ตัดบัตรรอบใหม่ช้า/ลองตัดซ้ำ)
--   • ยกเลิก subscription → ใช้ได้ถึงวันหมดอายุที่จ่ายไว้ แล้วล็อกตามกติกาเดิม (ไม่ตัดสิทธิ์ทันที)
--   • กันซ้ำด้วยเลขใบแจ้งหนี้ (ใช้ตาราง payments เดิม — charge_id = invoice id ของ Stripe)
-- องค์กรที่จ่ายผ่าน PunPay ไว้ก่อนหน้า: วันหมดอายุเดิมยังอยู่ครบ (apply ใช้ค่าที่มากกว่าเสมอ)

begin;

-- 1) คอลัมน์ Stripe บนองค์กร
alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_seat_subscription_id text,
  add column if not exists sub_cancel_at_period_end boolean not null default false,
  add column if not exists sub_cycle text,   -- รอบชำระของแพ็กเกจปัจจุบัน 'monthly' | 'yearly' (ไว้แสดงผลในหน้าอัปเกรด)
  -- ตัดบัตรรอบใหม่ไม่ผ่าน (subscription past_due/unpaid) → แถบเตือน Owner · 'plan' | 'seats' · null = ปกติ
  -- webhook ตั้ง/ล้างตามสถานะจริงใน Stripe · จ่ายสำเร็จ (apply_stripe_invoice) ล้างให้ทันที
  add column if not exists billing_past_due text check (billing_past_due in ('plan', 'seats'));
create unique index if not exists organizations_stripe_customer_uidx
  on public.organizations (stripe_customer_id) where stripe_customer_id is not null;

-- 2) กันผู้ใช้แก้คอลัมน์ Stripe เอง (ไม่งั้น Owner ใส่ customer id ของคนอื่นแล้วเปิดพอร์ทัลบิลของเขาได้)
--    แยก trigger ใหม่ ไม่แก้ guard_org_update เดิม · ยกเว้น service_role (เซิร์ฟเวอร์เรา) / postgres / super
create or replace function public.guard_org_stripe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or session_user = 'postgres' or public.is_super() then
    return new;
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.stripe_seat_subscription_id is distinct from old.stripe_seat_subscription_id
     or new.sub_cancel_at_period_end is distinct from old.sub_cancel_at_period_end
     or new.billing_past_due is distinct from old.billing_past_due then
    raise exception 'ข้อมูลการชำระเงิน Stripe แก้ได้เฉพาะระบบชำระเงินเท่านั้น';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_org_stripe on public.organizations;
create trigger trg_guard_org_stripe before update on public.organizations
  for each row execute function public.guard_org_stripe();

-- 3) ใบแจ้งหนี้จ่ายแล้ว → ตั้งสิทธิ์ (เรียกจาก api/stripe-webhook.js / api/stripe-confirm.js ด้วย service role เท่านั้น)
create or replace function public.apply_stripe_invoice(
  p_invoice_id   text,
  p_org          uuid,
  p_kind         text,     -- 'plan' | 'seats'
  p_plan         text,     -- 'starter' | 'pro' (เฉพาะ plan)
  p_tier         int,      -- 100 | 250 | 500 (เฉพาะ plan)
  p_qty          int,      -- จำนวนที่นั่ง (เฉพาะ seats)
  p_months       int,      -- 1 | 12 (เก็บเป็นประวัติ)
  p_period_end   date,     -- วันสิ้นรอบของ subscription
  p_amount       numeric,  -- ยอดที่จ่ายจริง (บาท)
  p_customer     text,
  p_subscription text
) returns table(applied boolean, expires date)
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int;
  v_until date := p_period_end + 3;
begin
  -- ทุกเงื่อนไขต้องกันค่าว่างเอง: `x not in (...)` เมื่อ x เป็น null ได้ null → if ไม่ทำงาน → ค่าว่างหลุดไปเขียนทับ
  if p_invoice_id is null or p_invoice_id = '' then raise exception 'ไม่มีเลขใบแจ้งหนี้'; end if;  -- null = กันซ้ำไม่ได้
  if p_org is null then raise exception 'ไม่มีองค์กร'; end if;
  if p_kind is null or p_kind not in ('plan', 'seats') then raise exception 'ชนิดรายการไม่ถูกต้อง'; end if;
  if p_kind = 'plan' and (p_plan is null or p_plan not in ('starter', 'pro')) then raise exception 'แพ็กเกจไม่ถูกต้อง'; end if;
  if p_kind = 'plan' and (p_tier is null or p_tier not in (100, 250, 500)) then raise exception 'ระดับแพ็กเกจไม่ถูกต้อง'; end if;
  if p_kind = 'seats' and (p_qty is null or p_qty < 1 or p_qty > 500) then raise exception 'จำนวนที่นั่งไม่ถูกต้อง'; end if;
  if p_period_end is null then raise exception 'ไม่มีวันสิ้นรอบ'; end if;

  insert into public.payments (charge_id, org_id, plan, months, amount, tier)
  values (p_invoice_id, p_org, case when p_kind = 'seats' then 'seats' else p_plan end,
          coalesce(p_months, 1), coalesce(p_amount, 0), case when p_kind = 'plan' then p_tier end)
  on conflict (charge_id) do nothing;
  get diagnostics v_inserted = row_count;   -- 0 = ใบนี้เคยบันทึกแล้ว (webhook ส่งซ้ำ/กดตรวจซ้ำ)

  if v_inserted = 0 then
    return query
      select false, case when p_kind = 'seats' then o.extra_seats_expires_at else o.sub_expires_at end
      from public.organizations o where o.id = p_org;
    return;
  end if;

  if p_kind = 'plan' then
    update public.organizations
       set plan = p_plan,
           plan_tier = p_tier,
           sub_status = 'active',
           sub_cycle = case when p_months = 12 then 'yearly' else 'monthly' end,
           sub_expires_at = greatest(coalesce(sub_expires_at, current_date), v_until),
           stripe_customer_id = coalesce(p_customer, stripe_customer_id),
           stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
           billing_past_due = nullif(billing_past_due, 'plan')   -- จ่ายแพ็กเกจสำเร็จ → เลิกเตือน
     where id = p_org
     returning sub_expires_at into expires;
  else
    update public.organizations
       set extra_seats = p_qty,
           extra_seats_expires_at = greatest(coalesce(extra_seats_expires_at, current_date), v_until),
           stripe_customer_id = coalesce(p_customer, stripe_customer_id),
           stripe_seat_subscription_id = coalesce(p_subscription, stripe_seat_subscription_id),
           billing_past_due = nullif(billing_past_due, 'seats')
     where id = p_org
     returning extra_seats_expires_at into expires;
  end if;
  if not found then raise exception 'ไม่พบองค์กร'; end if;

  -- เงินเข้าแล้ว → เครดิตผู้ชวน (ถ้ามี) · ห่อ exception: รางวัลพลาดต้องไม่ทำให้การจ่ายเงินล้ม
  begin
    perform public.grant_referral_reward(p_org);
  exception when others then null;
  end;

  applied := true;
  return next;
end $$;
revoke all on function public.apply_stripe_invoice(text, uuid, text, text, int, int, int, date, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_invoice(text, uuid, text, text, int, int, int, date, numeric, text, text)
  to service_role;

-- 4) ทดสอบตัวเองก่อน commit — ค่าว่าง/ค่าผิดต้องถูกปฏิเสธด้วยข้อความที่ถูกต้อง (ไม่ผ่าน = ยกเลิกทั้งก้อน ไม่มีอะไรเปลี่ยน)
--    เรียกในบล็อกที่มี exception → แม้ฟังก์ชันหลุดไปเขียนข้อมูล ก็ถูกย้อนกลับทั้งหมด
do $$
declare
  t record;
  v_org uuid := gen_random_uuid();
begin
  for t in
    select * from (values
      ('ไม่มีเลขใบแจ้งหนี้',  null::text,    v_org,      'plan'::text,  'pro'::text,  100,       null::int, 'ไม่มีเลขใบแจ้งหนี้'),
      ('ไม่มีองค์กร',         'in_selftest', null::uuid, 'plan',        'pro',        100,       null,      'ไม่มีองค์กร'),
      ('ชนิดว่าง',           'in_selftest', v_org,      null,          'pro',        100,       null,      'ชนิดรายการไม่ถูกต้อง'),
      ('แพ็กเกจว่าง',         'in_selftest', v_org,      'plan',        null,         100,       null,      'แพ็กเกจไม่ถูกต้อง'),
      ('แพ็กเกจแปลก',         'in_selftest', v_org,      'plan',        'free',       100,       null,      'แพ็กเกจไม่ถูกต้อง'),
      ('ระดับว่าง',           'in_selftest', v_org,      'plan',        'pro',        null::int, null,      'ระดับแพ็กเกจไม่ถูกต้อง'),
      ('ที่นั่งว่าง',          'in_selftest', v_org,      'seats',       null,         null,      null,      'จำนวนที่นั่งไม่ถูกต้อง')
    ) as x(name, inv, org, kind, plan, tier, qty, want)
  loop
    begin
      perform public.apply_stripe_invoice(t.inv, t.org, t.kind, t.plan, t.tier, t.qty, 1, current_date, 0, null, null);
      raise exception 'SELFTEST_NO_ERROR';
    exception when others then
      if sqlerrm is distinct from t.want then
        raise exception 'ทดสอบไม่ผ่าน [%] — ได้ "%" ควรได้ "%"', t.name, sqlerrm, t.want;
      end if;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- ตรวจผล: ok = true
select (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'organizations'
           and column_name in ('stripe_customer_id', 'stripe_subscription_id', 'stripe_seat_subscription_id', 'sub_cancel_at_period_end', 'sub_cycle', 'billing_past_due')) = 6
   and exists (select 1 from pg_proc where proname = 'apply_stripe_invoice')
   and exists (select 1 from pg_trigger where tgname = 'trg_guard_org_stripe') as ok;
