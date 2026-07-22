-- HOP · Plan gating (บังคับฝั่งเซิร์ฟเวอร์ = กันเลี่ยงจริง)
-- Free: ทรัพย์ ≤ 10 · สร้างแผนเยี่ยมชมไม่ได้ (Pro เท่านั้น)
-- Pro/Enterprise: ไม่จำกัด · super ไม่ติดลิมิตเสมอ
-- (ลูกทีม ≤ 2 เช็กใน api/create-member.js · AI เช็กใน api/ai.js · Dashboard เป็น view เลย gate ฝั่งแอป)
-- idempotent · ทรานแซกชันเดียว
begin;

create or replace function public.org_is_pro(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan in ('pro', 'enterprise') from public.organizations where id = p_org), false);
$$;

-- จำกัดจำนวนทรัพย์ของแพ็กเกจ Free (ครอบทั้งเพิ่มทีละชิ้นและนำเข้า Excel)
create or replace function public.enforce_property_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org();
  cnt int;
begin
  if public.is_super() then return new; end if;
  if not public.org_is_pro(v_org) then
    select count(*) into cnt from public.properties where org_id = v_org;
    if cnt >= 10 then
      raise exception 'แพ็กเกจ Free เพิ่มทรัพย์ได้สูงสุด 10 รายการ — อัปเกรดเป็น Pro เพื่อเพิ่มได้ไม่จำกัด';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_property_limit on public.properties;
create trigger trg_property_limit before insert on public.properties
  for each row execute function public.enforce_property_limit();

-- แผนเยี่ยมชม = ฟีเจอร์ Pro
create or replace function public.enforce_visit_plan_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_super() then return new; end if;
  if not public.org_is_pro(public.current_org()) then
    raise exception 'แผนเยี่ยมชมเป็นฟีเจอร์ Pro — อัปเกรดเพื่อใช้งาน';
  end if;
  return new;
end $$;
drop trigger if exists trg_visit_plan_pro on public.visit_plans;
create trigger trg_visit_plan_pro before insert on public.visit_plans
  for each row execute function public.enforce_visit_plan_pro();

commit;
