-- HOP · ประเภทบัญชี (ใช้คนเดียว / ทีม-บริษัท) + แก้ชื่อองค์กรได้เอง
-- รันใน Supabase → SQL Editor → Run (idempotent · รันซ้ำได้ · ไม่กระทบข้อมูลองค์กรเดิม)
-- ------------------------------------------------------------------
-- ⚠️ บทบาทผู้สร้างองค์กร = 'owner' (ระบบบทบาท 8 ระดับใน roles.sql) — ห้ามใช้ 'admin'
--    (memberships_role_check ปฏิเสธ → สมัครใหม่พัง · เคยเกิดแล้ว 2026-08)
-- ฟังก์ชัน create_organization ตัวนี้รวมทุกอย่างของเวอร์ชันก่อน (trial-until.sql) ไว้แล้ว:
--    ช่วงทดลองแบบนับวัน/วันสิ้นสุดตายตัว + บทบาท owner — รันไฟล์นี้แทน trial-until.sql ได้เลย

-- ทั้งไฟล์อยู่ใน transaction เดียว: ถ้าบรรทัดไหนพัง จะย้อนกลับทั้งหมด (ไม่ค้างสภาพ "ลบฟังก์ชันสมัครไปแล้วแต่สร้างใหม่ไม่ผ่าน")
begin;

-- 1) คอลัมน์ประเภทบัญชี (null = องค์กรที่สมัครก่อนมีตัวเลือกนี้)
alter table public.organizations add column if not exists account_type text;
alter table public.organizations drop constraint if exists organizations_account_type_check;
alter table public.organizations add constraint organizations_account_type_check
  check (account_type is null or account_type in ('individual', 'company'));

-- 2) create_organization รับประเภทบัญชีเพิ่ม (มีค่าเริ่มต้น → แอปเวอร์ชันเก่าที่ส่งแค่ชื่อยังใช้ได้)
--    ลบตัว 1 พารามิเตอร์ก่อน ไม่งั้นเรียกด้วยชื่ออย่างเดียวจะชน 2 ตัว ("function is not unique")
drop function if exists public.create_organization(text);
create or replace function public.create_organization(org_name text, p_account_type text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_days int := 0;
  v_plan text := 'pro';
  v_until date := null;
  v_expires date := null;
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if coalesce(trim(org_name), '') = '' then raise exception 'กรุณาระบุชื่อ'; end if;

  select coalesce((value->>'days')::int, 0),
         coalesce(nullif(value->>'plan', ''), 'pro'),
         nullif(value->>'until', '')::date
    into v_days, v_plan, v_until
    from public.app_settings where key = 'trial';
  if v_plan not in ('starter', 'pro') then v_plan := 'pro'; end if;

  -- ช่วงทดลอง: วันสิ้นสุดตายตัว (until) มาก่อน (เป็นอดีต = ไม่ได้ทดลอง) · ไม่กำหนด = นับวันจากวันนี้
  if v_until is not null then
    if v_until >= current_date then v_expires := v_until; end if;
  elsif v_days > 0 then
    v_expires := current_date + v_days;
  end if;

  insert into public.organizations (name, trial_plan, trial_expires_at, account_type)
  values (
    trim(org_name),
    case when v_expires is not null then v_plan end,
    v_expires,
    case when p_account_type in ('individual', 'company') then p_account_type end
  ) returning id into v_org;

  insert into public.memberships (user_id, org_id, role, active) values (auth.uid(), v_org, 'owner', true)
    on conflict (user_id, org_id) do update set role = 'owner', active = true;
  update public.profiles set active_org_id = v_org, org_id = v_org, role = 'owner', active = true where id = auth.uid();
  return v_org;
end $$;
grant execute on function public.create_organization(text, text) to authenticated;

-- 3) แก้ชื่อ + ประเภทบัญชีขององค์กรที่ใช้อยู่ — เฉพาะ Owner (super สวมสิทธิ์ก็ได้ เพราะ my_role() = owner)
--    ทำเป็น RPC (security definer) แทนการเปิด RLS update ทั้งแถว → แก้ได้แค่ 2 ช่องนี้เท่านั้น
create or replace function public.update_org_profile(p_name text, p_account_type text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org();
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if v_org is null then raise exception 'ยังไม่ได้เลือกองค์กร'; end if;
  if coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'เฉพาะเจ้าขององค์กร (Owner) เท่านั้นที่แก้ชื่อได้';
  end if;
  if v_name = '' then raise exception 'กรุณาระบุชื่อ'; end if;
  if char_length(v_name) > 120 then raise exception 'ชื่อยาวเกิน 120 ตัวอักษร'; end if;

  update public.organizations
     set name = v_name,
         account_type = case when p_account_type in ('individual', 'company') then p_account_type
                             else account_type end
   where id = v_org;
end $$;
revoke execute on function public.update_org_profile(text, text) from public, anon;
grant execute on function public.update_org_profile(text, text) to authenticated;

-- ให้ API เห็นฟังก์ชัน/คอลัมน์ใหม่ทันที (ส่งตอน commit)
notify pgrst, 'reload schema';

commit;

-- ตรวจผล: ควรเห็น create_organization (org_name text, p_account_type text) และ update_org_profile
--         และบรรทัดสุดท้าย owner_ok = true
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname in ('create_organization', 'update_org_profile') order by proname;
select prosrc like '%''owner''%' as owner_ok from pg_proc where proname = 'create_organization';
