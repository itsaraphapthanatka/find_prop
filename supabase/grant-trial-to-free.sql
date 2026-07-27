-- ให้ช่วงทดลองใช้ (trial) กับองค์กร "free" ทุกราย — ทั้งที่ไม่เคยได้ trial และที่ trial หมดไปแล้ว (โดนล็อกอยู่)
-- จำนวนวัน/แพ็กเกจอ่านจากตั้งค่า trial ใน Super Admin (ไม่มี = 14 วัน / pro)
-- ⚠️ สคริปต์ "แจกรอบเดียว" — รันซ้ำจะต่ออายุ trial ให้กลุ่ม free ที่หมดเขตอีกรอบ (นับใหม่จากวันนี้)
do $$
declare
  v_days int;
  v_plan text;
  n int;
begin
  select coalesce((value->>'days')::int, 14),
         coalesce(value->>'plan', 'pro')
    into v_days, v_plan
    from public.app_settings where key = 'trial';
  v_days := coalesce(nullif(v_days, 0), 14);
  v_plan := coalesce(v_plan, 'pro');

  update public.organizations
     set trial_plan = v_plan,
         trial_expires_at = current_date + v_days
   where coalesce(plan, 'free') = 'free'
     and (trial_expires_at is null or trial_expires_at < current_date);
  get diagnostics n = row_count;

  raise notice '✅ แจก trial % ให้องค์กร free % ราย · ใช้ได้ถึง %', v_plan, n, current_date + v_days;
end $$;

-- ตรวจผล: ไม่ควรเหลือองค์กร free ที่ไม่มี trial เดินอยู่
select name, plan, trial_plan, trial_expires_at
from public.organizations
where coalesce(plan, 'free') = 'free'
order by trial_expires_at;
