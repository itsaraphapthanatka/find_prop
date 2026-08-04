-- ============================================================
-- ประวัติการใช้งานแบบ "ปิดช่องว่าง 100%" — เก็บที่ฝั่งฐานข้อมูลด้วย trigger
-- ------------------------------------------------------------
-- ก่อนหน้านี้ log ถูกเขียนจากฝั่งเว็บ (logActivity) → แก้ข้อมูลผ่าน SQL Editor / REST /
-- สคริปต์ ไม่มีร่องรอยเลย · ไฟล์นี้ย้ายการบันทึกลง trigger ทำให้ทุกการเปลี่ยนแปลงข้อมูล
-- ถูกบันทึกไม่ว่าใครทำผ่านช่องทางไหน
--
-- ตารางที่ติด trigger: properties · follow_ups · memberships · profiles · visit_plans · organizations
-- ต้องรัน logs.sql (ตาราง activity_logs) และ multiorg-stage2.sql มาก่อน
-- รันซ้ำได้ (idempotent) · ทรานแซกชันเดียว
--
-- ⚠️ หลังรันไฟล์นี้ ต้อง deploy โค้ดเว็บชุดใหม่ที่เลิกเขียน log ซ้ำจากฝั่ง client
--    (property.* / plan.* ถูกย้ายมาเป็น trigger แล้ว — ไม่งั้นจะเห็น log ซ้ำ 2 แถวต่อ 1 การกระทำ)
-- ============================================================
begin;

-- ── 1) ตัวเขียน log กลาง — ห้ามทำให้งานหลักล้มเด็ดขาด ──
-- security definer เพื่อให้ผู้ใช้ทั่วไปเขียน log ได้แม้ RLS ของ activity_logs จะแคบ
-- exception when others then null = log ล้ม (เช่นตารางหาย) ก็ปล่อยผ่าน งานหลักต้องสำเร็จ
create or replace function public.log_event(p_org uuid, p_action text, p_code text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  insert into public.activity_logs (org_id, user_id, user_name, action, entity_code, detail)
  values (
    coalesce(p_org, public.current_org()),
    v_uid,
    coalesce(
      (select nullif(full_name, '') from public.profiles where id = v_uid),
      (select email from public.profiles where id = v_uid),
      'ระบบ/SQL'   -- ไม่มี auth.uid() = แก้ผ่าน SQL Editor / service key / cron
    ),
    p_action,
    p_code,
    coalesce(p_detail, '{}'::jsonb)
      || jsonb_build_object('via', case when v_uid is null then 'sql' else 'app' end)
  );
exception when others then null;
end $$;

-- ── 2) รายชื่อฟิลด์ที่เปลี่ยน (เก็บแค่ชื่อฟิลด์ ไม่เก็บค่าทั้งแถว — log จะไม่บวมและไม่รั่วข้อมูล) ──
create or replace function public.changed_fields(p_old jsonb, p_new jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}'::text[])
  from (
    select key as k from jsonb_each(p_new) n
    where p_old -> n.key is distinct from n.value
  ) t
$$;

-- ── 3) ทรัพย์ ──
-- เปลี่ยนสถานะงาน (ปิดงาน/เปิดงานอีกครั้ง) แยกเป็น action ของตัวเอง เพราะเป็นเหตุการณ์ทางธุรกิจ
create or replace function public.trg_log_property() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fields text[]; v_detail jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.org_id, 'property.create', new.code,
      jsonb_build_object('type', new.property_type, 'listing', new.listing_type));
  elsif tg_op = 'UPDATE' then
    v_fields := public.changed_fields(to_jsonb(old), to_jsonb(new));
    if coalesce(array_length(v_fields, 1), 0) = 0 then return null; end if;
    if new.deal_status is distinct from old.deal_status then
      perform public.log_event(new.org_id,
        case when coalesce(new.deal_status, 'open') = 'open' then 'deal.reopen' else 'deal.close' end,
        new.code, jsonb_build_object('from', old.deal_status, 'to', new.deal_status));
      -- ฟิลด์อื่นที่เปลี่ยนพร้อมกันยังนับเป็นการแก้ไขทรัพย์ตามปกติ
      v_fields := array_remove(v_fields, 'deal_status');
      if coalesce(array_length(v_fields, 1), 0) = 0 then return null; end if;
    end if;
    v_detail := jsonb_build_object('fields', v_fields, 'n', array_length(v_fields, 1));
    perform public.log_event(new.org_id, 'property.update', new.code, v_detail);
  else
    perform public.log_event(old.org_id, 'property.delete', old.code,
      jsonb_build_object('type', old.property_type));
  end if;
  return null;
end $$;
drop trigger if exists log_property on public.properties;
create trigger log_property after insert or update or delete on public.properties
for each row execute function public.trg_log_property();

-- ── 4) นัดติดตาม ──
create or replace function public.trg_log_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if tg_op = 'DELETE' then
    select code into v_code from public.properties where id = old.property_id;
    perform public.log_event(old.org_id, 'followup.delete', coalesce(v_code, old.title),
      jsonb_build_object('title', old.title));
    return null;
  end if;
  select code into v_code from public.properties where id = new.property_id;
  if tg_op = 'INSERT' then
    perform public.log_event(new.org_id,
      case when new.status = 'done' then 'followup.done' else 'followup.create' end,
      coalesce(v_code, new.title),
      jsonb_build_object('title', new.title, 'due', new.due_date, 'result', new.result));
  elsif new.status = 'done' and old.status <> 'done' then
    perform public.log_event(new.org_id, 'followup.done', coalesce(v_code, new.title),
      jsonb_build_object('title', new.title, 'result', new.result));
  elsif public.changed_fields(to_jsonb(old), to_jsonb(new)) <> '{}'::text[] then
    perform public.log_event(new.org_id, 'followup.update', coalesce(v_code, new.title),
      jsonb_build_object('title', new.title, 'fields', public.changed_fields(to_jsonb(old), to_jsonb(new))));
  end if;
  return null;
end $$;
drop trigger if exists log_followup on public.follow_ups;
create trigger log_followup after insert or update or delete on public.follow_ups
for each row execute function public.trg_log_followup();

-- ── 5) สมาชิกองค์กร (ใครให้สิทธิ์ใคร / ปิดสิทธิ์ใคร) ──
create or replace function public.trg_log_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who text;
begin
  select coalesce(nullif(full_name, ''), email) into v_who
  from public.profiles where id = coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' then
    perform public.log_event(new.org_id, 'member.add', v_who,
      jsonb_build_object('role', new.role, 'see_all', new.see_all_properties));
  elsif tg_op = 'UPDATE' then
    if public.changed_fields(to_jsonb(old), to_jsonb(new)) = '{}'::text[] then return null; end if;
    perform public.log_event(new.org_id, 'member.update', v_who,
      jsonb_build_object(
        'role', new.role, 'role_from', old.role,
        'active', new.active, 'active_from', old.active,
        'see_all', new.see_all_properties, 'see_all_from', old.see_all_properties));
  else
    perform public.log_event(old.org_id, 'member.remove', v_who,
      jsonb_build_object('role', old.role));
  end if;
  return null;
end $$;
drop trigger if exists log_member on public.memberships;
create trigger log_member after insert or update or delete on public.memberships
for each row execute function public.trg_log_member();

-- ── 6) โปรไฟล์: เฉพาะฟิลด์ที่มีผลต่อสิทธิ์/บริบท (สวมสิทธิ์ · สลับองค์กร · บทบาท · เปิด-ปิดบัญชี) ──
-- ไม่เก็บการแก้ชื่อ/ค่าอื่นที่ไม่กระทบสิทธิ์ เพื่อไม่ให้ประวัติรกโดยไม่จำเป็น
create or replace function public.trg_log_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who text := coalesce(nullif(new.full_name, ''), new.email); v_org text;
begin
  if new.impersonate_org_id is distinct from old.impersonate_org_id then
    if new.impersonate_org_id is null then
      select name into v_org from public.organizations where id = old.impersonate_org_id;
      perform public.log_event(old.impersonate_org_id, 'super.exit', v_org, jsonb_build_object('by', v_who));
    else
      select name into v_org from public.organizations where id = new.impersonate_org_id;
      perform public.log_event(new.impersonate_org_id, 'super.impersonate', v_org, jsonb_build_object('by', v_who));
    end if;
  end if;
  if new.active_org_id is distinct from old.active_org_id and new.active_org_id is not null then
    select name into v_org from public.organizations where id = new.active_org_id;
    perform public.log_event(new.active_org_id, 'org.switch', v_org, jsonb_build_object('by', v_who));
  end if;
  if new.role is distinct from old.role or new.active is distinct from old.active
     or new.is_super is distinct from old.is_super then
    perform public.log_event(new.org_id, 'profile.rights', v_who,
      jsonb_build_object('role', new.role, 'role_from', old.role,
                         'active', new.active, 'active_from', old.active,
                         'is_super', new.is_super, 'is_super_from', old.is_super));
  end if;
  return null;
end $$;
drop trigger if exists log_profile on public.profiles;
create trigger log_profile after update on public.profiles
for each row execute function public.trg_log_profile();

-- ── 7) แผนเยี่ยมชม (เก็บการแก้ไขรูทด้วย ไม่ใช่แค่สร้าง/ลบ) ──
create or replace function public.trg_log_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.org_id, 'plan.create', new.title,
      jsonb_build_object('customer', new.customer_name, 'stops', jsonb_array_length(coalesce(new.stops, '[]'::jsonb))));
  elsif tg_op = 'UPDATE' then
    if public.changed_fields(to_jsonb(old), to_jsonb(new)) = '{}'::text[] then return null; end if;
    perform public.log_event(new.org_id, 'plan.update', new.title,
      jsonb_build_object('stops', jsonb_array_length(coalesce(new.stops, '[]'::jsonb)),
                         'stops_from', jsonb_array_length(coalesce(old.stops, '[]'::jsonb))));
  else
    perform public.log_event(old.org_id, 'plan.delete', old.title, '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists log_plan on public.visit_plans;
create trigger log_plan after insert or update or delete on public.visit_plans
for each row execute function public.trg_log_plan();

-- ── 8) องค์กร: แพ็กเกจ/สถานะ/ช่วงทดลอง/ชื่อ (การกระทำระดับ super admin) ──
create or replace function public.trg_log_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fields text[];
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.id, 'org.create', new.name, jsonb_build_object('plan', new.plan));
  elsif tg_op = 'UPDATE' then
    v_fields := public.changed_fields(to_jsonb(old), to_jsonb(new));
    if coalesce(array_length(v_fields, 1), 0) = 0 then return null; end if;
    perform public.log_event(new.id, 'org.update', new.name,
      jsonb_build_object('fields', v_fields, 'plan', new.plan, 'plan_from', old.plan,
                         'sub_status', new.sub_status, 'sub_status_from', old.sub_status));
  else
    perform public.log_event(null, 'org.delete', old.name, jsonb_build_object('plan', old.plan));
  end if;
  return null;
end $$;
drop trigger if exists log_org on public.organizations;
create trigger log_org after insert or update or delete on public.organizations
for each row execute function public.trg_log_org();

commit;

-- ===== ทดสอบตัวเอง: trigger ครบ 6 ตัว =====
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and t.tgname in ('log_property','log_followup','log_member','log_profile','log_plan','log_org')
    and c.relname in ('properties','follow_ups','memberships','profiles','visit_plans','organizations');
  if n <> 6 then
    raise exception 'ติดตั้ง trigger ไม่ครบ: ได้ % จาก 6', n;
  end if;
  raise notice '✅ logs-triggers: ติดตั้ง trigger ครบ 6 ตัว — ทุกการเปลี่ยนแปลงข้อมูลถูกบันทึกไม่ว่าทำผ่านช่องทางไหน';
end $$;

-- ===== ทดสอบว่าทำงานจริง (รันแยกได้ · ไม่กระทบข้อมูล) =====
-- แก้หมายเหตุของทรัพย์สักแปลงแล้วดูว่ามี log โผล่ทันที (via = 'sql' เพราะรันจาก SQL Editor)
--   update public.properties set notes = coalesce(notes, '') where code = 'JKP01';
--   select created_at, user_name, action, entity_code, detail
--     from public.activity_logs order by created_at desc limit 5;
--
-- ===== หมายเหตุ =====
-- · การ "อ่าน/ค้นหา/ส่งออก" ไม่ถูกบันทึก (ตั้งใจ — ไม่งั้น log ท่วมและช้า)
-- · การเข้าสู่ระบบ/ออก/รีเซ็ตรหัส Supabase เก็บให้เองที่ auth.audit_log_entries
--   (ดูใน Dashboard → Authentication → Logs) จึงไม่ทำซ้ำที่นี่
-- · นำเข้า Excel/CSV จะได้ log 1 แถวต่อ 1 ทรัพย์ (property.create) + 1 แถวสรุป (import.run จากฝั่งเว็บ)
