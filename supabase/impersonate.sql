-- ============================================================
-- สวมสิทธิ์องค์กร (impersonation) สำหรับ super admin
-- super คลิกชื่อองค์กรในหน้า /super → ทำงานเสมือนสมาชิกองค์กรนั้น
-- (เห็น/เพิ่ม/แก้/ลบ ทรัพย์+แผนเยี่ยมชม+นำเข้า ภายใต้ org นั้นจริงๆ)
-- รันหลัง super.sql — รันซ้ำได้
-- ============================================================

-- 1) จำสถานะสวมสิทธิ์ไว้บนโปรไฟล์ของ super เอง
alter table public.profiles
  add column if not exists impersonate_org_id uuid references public.organizations(id) on delete set null;

-- 2) current_org(): ถ้าเป็น super และกำลังสวมสิทธิ์ → คืนองค์กรที่สวมอยู่
--    (ทุก policy ที่อิง current_org() จะมองว่า super เป็นสมาชิกองค์กรนั้นโดยอัตโนมัติ
--     รวมถึง default org_id ของทรัพย์/แผนที่สร้างใหม่ด้วย)
create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(case when is_super then impersonate_org_id end, org_id)
  from public.profiles where id = auth.uid() and active;
$$;

-- 3) มุมมอง "ภาพรวมทุกองค์กร" = super ที่ *ไม่ได้* สวมสิทธิ์อยู่
--    (ตอนสวมสิทธิ์ การอ่านข้อมูลหลักจะแคบลงเหลือองค์กรเดียว เหมือนสมาชิกจริง)
create or replace function public.super_overview() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_super and impersonate_org_id is null
  );
$$;

-- 4) RPC เข้า/ออกสิทธิ์ (p_org = null คือออก) — เฉพาะ super เท่านั้น
create or replace function public.super_impersonate(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then
    raise exception 'เฉพาะ super admin เท่านั้น';
  end if;
  if p_org is not null and not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'ไม่พบองค์กรนี้';
  end if;
  update public.profiles set impersonate_org_id = p_org where id = auth.uid();
end $$;
grant execute on function public.super_impersonate(uuid) to authenticated;

-- 5) เพิ่มลูกทีม: super ที่สวมสิทธิ์อยู่ทำแทนแอดมินองค์กรได้
--    (org ปลายทางมาจาก current_org() ซึ่งชี้องค์กรที่สวมอยู่แล้ว)
create or replace function public.adopt_member(member_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_super()) then
    raise exception 'เฉพาะแอดมินเท่านั้น';
  end if;
  if public.current_org() is null then
    raise exception 'ยังไม่ได้เลือกองค์กร — super ต้องสวมสิทธิ์องค์กรก่อนเพิ่มลูกทีม';
  end if;
  update public.profiles
  set org_id = public.current_org(), active = true
  where id = member_id and org_id is null;
  if not found then
    raise exception 'ไม่พบบัญชีนี้ หรือบัญชีอยู่ในองค์กรอื่นแล้ว';
  end if;
end $$;

-- 6) การอ่านข้อมูลหลัก: เห็นทุกองค์กรเฉพาะตอน "ไม่ได้สวมสิทธิ์"
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.super_overview()
  );
drop policy if exists "plan read" on public.visit_plans;
create policy "plan read" on public.visit_plans
  for select using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.super_overview()
  );
