-- HOP · เพิ่ม "วันสิ้นสุดตายตัว" ให้ช่วงทดลองใช้ฟรี (until)
-- อัปเดตฟังก์ชัน create_organization ให้รองรับ app_settings.trial.until
-- รันใน Supabase → SQL Editor → Run (idempotent · รันซ้ำได้ · ไม่กระทบองค์กรที่มีอยู่แล้ว)
-- ------------------------------------------------------------------
-- กติกา: ถ้า trial.until (YYYY-MM-DD) ถูกกำหนด → องค์กรใหม่ทุกรายทดลองถึงวันนั้น (ไม่สน days)
--        ถ้า until ว่าง → นับจากวันสมัคร + days เหมือนเดิม · until เป็นอดีต = สมัครใหม่ไม่ได้ทดลอง

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

-- ตรวจผล: ฟังก์ชันถูกอัปเดต + ค่า trial ปัจจุบัน
select 'create_organization updated' as status;
select value from public.app_settings where key = 'trial';
