-- HOP · เกณฑ์ชวนเพื่อน (referral) ปรับได้จากหน้า Super Admin
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง) — ต้องเคยรัน referral.sql มาก่อน
-- ------------------------------------------------------------------
-- เดิม: ครบทุก 2 คน = Pro +30 วัน (hardcode ใน apply_referral)
-- ใหม่: อ่านจาก app_settings key 'referral' → {"need": จำนวนคน, "days": วันรางวัล}
-- หมายเหตุ: ถ้า "ลด" จำนวนคนที่ต้องชวน องค์กรที่ชวนไว้เยอะอาจได้รางวัลย้อนหลังในครั้งถัดไป
--          ที่มีคนใช้โค้ดของเขา (นับรอบใหม่จากเกณฑ์ใหม่) — ไม่มีการยึดรางวัลคืน

-- ตารางตั้งค่ากลาง (ซ้ำกับ trial.sql — idempotent เผื่อรันไฟล์นี้ก่อน)
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

-- ค่าตั้งต้น = เกณฑ์เดิม — ไม่ทับค่าที่ super เคยแก้
insert into public.app_settings (key, value) values ('referral', '{"need": 2, "days": 30}')
on conflict (key) do nothing;

-- apply_referral เวอร์ชันอ่านเกณฑ์จากตั้งค่า (ทับเวอร์ชัน referral.sql)
create or replace function public.apply_referral(ref_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  my_org uuid := public.current_org();
  ref_org uuid;
  cnt int; should int;
  v_need int; v_days int;
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

  -- เกณฑ์จากตั้งค่า — ไม่มีแถว/ค่าเพี้ยน → ใช้ 2 คน / 30 วัน เหมือนเดิม
  select greatest(1, coalesce((value->>'need')::int, 2)),
         greatest(1, coalesce((value->>'days')::int, 30))
    into v_need, v_days
    from public.app_settings where key = 'referral';
  v_need := coalesce(v_need, 2);
  v_days := coalesce(v_days, 30);

  -- ทุก v_need คนที่ชวนสำเร็จ = 1 รอบรางวัล · ให้เฉพาะรอบที่ยังไม่เคยให้
  select count(*)::int into cnt from public.organizations where referred_by = ref_org;
  should := cnt / v_need;
  if should > (select referral_rewards_granted from public.organizations where id = ref_org) then
    update public.organizations set
      plan = case when plan = 'enterprise' then plan else 'pro' end,
      sub_status = 'active',
      sub_expires_at = (greatest(coalesce(sub_expires_at, current_date), current_date)
                        + make_interval(days => (should - referral_rewards_granted) * v_days))::date,
      referral_rewards_granted = should
    where id = ref_org;
  end if;
  return 'ok';
end $$;
grant execute on function public.apply_referral(text) to authenticated;

-- ตรวจผล: เห็นตั้งค่า referral + ฟังก์ชันอ่าน app_settings แล้ว
select key, value from public.app_settings where key = 'referral';
select proname from pg_proc where proname = 'apply_referral' and prosrc like '%app_settings%';
