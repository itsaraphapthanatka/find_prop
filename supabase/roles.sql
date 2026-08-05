-- บทบาทและสิทธิ์ 8 ระดับ (Owner … Trainee) — ดู docs/roles-spec.md
-- ============================================================
-- เดิมมี 2 บทบาท (admin/member) + สวิตช์ "เห็นทรัพย์ทั้งทีม" → เปลี่ยนเป็น 8 บทบาท
-- แปลงของเดิม: admin → owner · member → manager (ไม่มีใครเสียสิทธิ์ที่เคยมี)
--
--   บทบาท   │ เห็นทรัพย์      │ ข้อมูลติดต่อเจ้าของ │ พิกัด/GGMap   │ แก้ของคนอื่น │ ลบของคนอื่น      │ นำออก
--   owner    │ ทั้งองค์กร      │ เห็น               │ เห็น          │ ได้         │ ได้ทั้งหมด        │ ได้
--   manager  │ ทั้งองค์กร      │ เห็น               │ เห็น          │ ได้         │ ได้ (เว้นของ owner)│ ไม่ได้
--   associate│ ทั้งองค์กร      │ ปิด                │ เห็น          │ ไม่ได้       │ ไม่ได้            │ ไม่ได้
--   analyst  │ ทั้งองค์กร      │ ปิด                │ ปิด           │ ไม่ได้       │ ไม่ได้            │ ไม่ได้
--   survey   │ ทั้งองค์กร      │ ปิด                │ เห็นเฉพาะเขต   │ ไม่ได้       │ ไม่ได้            │ ไม่ได้
--   temporary│ เฉพาะเขตที่ให้   │ ปิด                │ เห็นเฉพาะเขต   │ ไม่ได้       │ ไม่ได้            │ ไม่ได้
--   social   │ ทั้งองค์กร      │ ปิด                │ ปิด           │ ไม่ได้       │ ไม่ได้ (ดูล้วน)    │ ไม่ได้
--   trainee  │ เฉพาะของตัวเอง  │ (ของตัวเอง=เห็น)    │ เห็น          │ ไม่ได้       │ ไม่ได้            │ ไม่ได้
--
-- ทุกบทบาทเห็น/แก้/ลบ "ทรัพย์ที่ตัวเองลง" ได้เสมอ ยกเว้น social (ดูได้อย่างเดียวทั้งระบบ)
--
-- ⚠️ การปิดข้อมูลระดับฟิลด์ทำด้วย view public.properties_view (ปิดค่าเป็น null)
--    และ "ถอนสิทธิ์ select บนตาราง properties" ออกจาก authenticated
--    → ฝั่งแอปต้องอ่านทรัพย์จาก properties_view เท่านั้น (เขียนยังเขียนที่ตารางตามเดิม)
--    ถ้าไม่ถอน select ผู้ใช้เรียก REST ตรงๆ ก็เห็นคอลัมน์ที่ปิดไว้ = ปิดไม่จริง
--
-- ต้องรันหลัง multiorg-stage2.sql · visibility-null-owner-fix.sql · seats.sql · รันซ้ำได้
-- ============================================================

begin;

-- ── 1) รายชื่อบทบาท + แปลงของเดิม ─────────────────────────
-- ปลดข้อจำกัดเดิมก่อน (ถ้ามี) เพื่อให้ update แปลงค่าได้
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.profiles    drop constraint if exists profiles_role_check;

update public.memberships set role = 'owner'   where role = 'admin';
update public.memberships set role = 'manager' where role = 'member';
update public.profiles    set role = 'owner'   where role = 'admin';
update public.profiles    set role = 'manager' where role = 'member';
update public.team_invites set role = 'manager' where role = 'member' and status = 'pending';

alter table public.memberships
  add constraint memberships_role_check check (role in
    ('owner','manager','associate','analyst','survey','temporary','social','trainee'));
-- profiles.role เป็นสำเนาของ membership ของ org ที่ active (client อ่านจากตรงนี้)
alter table public.profiles
  add constraint profiles_role_check check (role is null or role in
    ('owner','manager','associate','analyst','survey','temporary','social','trainee'));

alter table public.team_invites alter column role set default 'manager';

-- ── 2) เบอร์โทรของพนักงาน (ให้บทบาทที่ถูกปิดข้อมูลเจ้าของติดต่อ "คนลงข้อมูล" ได้) ──
alter table public.profiles add column if not exists phone text;

-- ── 3) เขตที่กำหนดให้ (survey/temporary) ───────────────────
-- 1 แถว = 1 ขอบเขต · district = null หมายถึงทั้งจังหวัด
create table if not exists public.member_areas (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references public.organizations(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  province text not null,
  district text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_member_areas_uniq
  on public.member_areas (org_id, user_id, province, coalesce(district, ''));
alter table public.member_areas enable row level security;

-- ── 4) ฟังก์ชันสิทธิ์ ──────────────────────────────────────
-- บทบาทของฉันใน org ปัจจุบัน (super = owner เสมอ ทั้งโหมดภาพรวมและสวมสิทธิ์)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_super() then 'owner'
    else (select m.role from public.memberships m
          where m.user_id = auth.uid() and m.org_id = public.current_org() and m.active limit 1)
  end;
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner';
$$;

-- is_admin() = สิทธิ์ระดับจัดการข้อมูล (owner + manager) — policy เดิมหลายที่เรียกใช้ชื่อนี้
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('owner', 'manager');
$$;

-- อยู่ในเขตที่ถูกกำหนดให้ไหม (ไม่ได้กำหนดเขตไว้เลย = ไม่อยู่ในเขตใด — ปิดไว้ก่อนปลอดภัยกว่า)
create or replace function public.in_my_area(p_province text, p_district text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_areas a
    where a.user_id = auth.uid() and a.org_id = public.current_org()
      and a.province = p_province
      and (a.district is null or a.district = p_district)
  );
$$;

-- เห็นทรัพย์แถวนี้ไหม (ใช้ทั้ง policy อ่านของตาราง และ where ของ view)
create or replace function public.can_see_property(
  row_created_by uuid, row_org uuid, row_province text, row_district text
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.super_overview()
    or ( row_org = public.current_org() and public.org_ok(row_org) and (
         row_created_by = auth.uid()                      -- ของตัวเองเห็นเสมอ
         or (
           -- สวิตช์เดิม "เห็นเฉพาะของตัวเอง" ยังมีผล (ไม่ให้ใครเห็นกว้างขึ้นกว่าที่เคยตั้งไว้)
           coalesce((select m.see_all_properties from public.memberships m
                     where m.user_id = auth.uid() and m.org_id = row_org), true)
           and case public.my_role()
                 when 'trainee'   then false
                 when 'temporary' then public.in_my_area(row_province, row_district)
                 else true
               end
         )
       ) );
$$;

-- ของเดิม (2 พารามิเตอร์) — ยังมี policy/ฟังก์ชันอื่นเรียกใช้ ให้ส่งต่อไปตัวใหม่
create or replace function public.can_see_prop(row_created_by uuid, row_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_property(row_created_by, row_org, null, null);
$$;

-- แก้ทรัพย์แถวนี้ได้ไหม — ของตัวเองได้ (ยกเว้น social) · ของคนอื่นเฉพาะ owner/manager
create or replace function public.can_edit_property(row_created_by uuid, row_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super()
    or ( row_org = public.current_org() and public.org_ok(row_org)
         and public.my_role() is distinct from 'social'
         and (row_created_by = auth.uid() or public.is_admin()) );
$$;

-- ลบทรัพย์แถวนี้ได้ไหม — owner ลบได้ทุกแถว · manager ลบของคนอื่นได้ "ยกเว้นแถวที่ owner ลงไว้"
-- · บทบาทอื่นลบได้แค่ของตัวเอง · social ลบไม่ได้เลย
create or replace function public.can_delete_property(row_created_by uuid, row_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super()
    or ( row_org = public.current_org() and public.org_ok(row_org) and (
         case public.my_role()
           when 'owner'  then true
           when 'social' then false
           when 'manager' then
             row_created_by = auth.uid()
             or not exists (select 1 from public.memberships m
                            where m.user_id = row_created_by and m.org_id = row_org and m.role = 'owner')
           else row_created_by = auth.uid()
         end ) );
$$;

-- ปิดข้อมูลติดต่อเจ้าของทรัพย์ของ "คนอื่น" (ชื่อ/บริษัท/เบอร์)
create or replace function public.hide_owner_contact(row_created_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select row_created_by is distinct from auth.uid()
     and public.my_role() in ('associate','analyst','survey','temporary','social');
$$;

-- ปิดพิกัด/ลิงก์แผนที่ของ "คนอื่น" — analyst/social ปิดหมด · survey/temporary เห็นเฉพาะในเขตที่กำหนด
create or replace function public.hide_location(row_created_by uuid, row_province text, row_district text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when row_created_by = auth.uid() then false
    when public.my_role() in ('analyst','social') then true
    when public.my_role() in ('survey','temporary') then not public.in_my_area(row_province, row_district)
    else false
  end;
$$;

-- นำข้อมูลออก (Excel/CSV) ได้เฉพาะ owner
create or replace function public.can_export() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner';
$$;

grant execute on function public.my_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.in_my_area(text, text) to authenticated;
grant execute on function public.can_see_property(uuid, uuid, text, text) to authenticated;
grant execute on function public.can_edit_property(uuid, uuid) to authenticated;
grant execute on function public.can_delete_property(uuid, uuid) to authenticated;
grant execute on function public.hide_owner_contact(uuid) to authenticated;
grant execute on function public.hide_location(uuid, text, text) to authenticated;
grant execute on function public.can_export() to authenticated;

-- ── 5) policy ของตาราง properties ─────────────────────────
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (public.can_see_property(created_by, org_id, province, district));

drop policy if exists "team insert" on public.properties;
create policy "team insert" on public.properties
  for insert with check (
    (org_id = public.current_org() and public.org_ok(org_id)
     and public.my_role() is distinct from 'social')          -- ดูได้อย่างเดียว = เพิ่มไม่ได้
    or (public.is_super() and org_id is not null)
  );

drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (public.can_edit_property(created_by, org_id))
  with check (public.is_super() or (org_id = public.current_org() and public.org_ok(org_id)));

drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (public.can_delete_property(created_by, org_id));

-- ── 6) view สำหรับ "อ่าน" ทรัพย์ — ปิดค่าเป็น null ตามบทบาท ──
-- ตั้งใจไม่ใช้ security_invoker: view นี้เป็นด่านเดียวที่ผู้ใช้อ่านทรัพย์ได้
-- (สิทธิ์ select บนตารางถูกถอนด้านล่าง) การกรองแถวจึงอยู่ใน where ของ view เอง
drop view if exists public.properties_view;
create view public.properties_view as
select
  p.id, p.created_at, p.org_id, p.created_by, p.code, p.record_date,
  p.property_type, p.sub_type, p.listing_type, p.agreement_type, p.deal_status,
  -- ── ข้อมูลติดต่อเจ้าของทรัพย์ (ปิดตามบทบาท) ──
  case when public.hide_owner_contact(p.created_by) then null else p.lessor_name end     as lessor_name,
  case when public.hide_owner_contact(p.created_by) then null else p.lessor_company end  as lessor_company,
  case when public.hide_owner_contact(p.created_by) then null else p.phone end           as phone,
  p.lessor_status, p.contact_form,
  -- ── พิกัด/ลิงก์แผนที่ (ปิดตามบทบาท/เขต) ──
  case when public.hide_location(p.created_by, p.province, p.district) then null else p.lat end     as lat,
  case when public.hide_location(p.created_by, p.province, p.district) then null else p.lng end     as lng,
  case when public.hide_location(p.created_by, p.province, p.district) then null else p.map_url end as map_url,
  -- ── ที่ตั้งระดับพื้นที่ (ไม่ปิด — ไม่งั้นรายการใช้งานไม่ได้เลย) ──
  p.house_no, p.project_name, p.province, p.district, p.subdistrict, p.color_zone, p.zones,
  p.nearby, p.nearby_places, p.house_direction,
  -- ── ที่เหลือเปิดทั้งหมด (รวมคอลัมน์ยุค AppSheet ที่ยังมีข้อมูลค้าง) ──
  p.pic, p.land_wxd, p.building_wxd, p.office_floors, p.land_building_tax,
  p.land_area, p.land_rai, p.land_ngan, p.land_wa, p.building_area, p.building_area_total,
  p.office_area_fl1, p.office_area_total, p.usable_area, p.floors, p.rooms, p.bedrooms,
  p.bathrooms, p.kitchens, p.maid_room, p.parking_spaces, p.appliances, p.appliance_counts,
  p.furniture, p.balcony_direction, p.unit_building, p.unit_floor, p.tower_floors, p.tower_count,
  p.ceiling_height, p.floor_height, p.floor_raise_cm, p.building_height, p.door_count, p.door_wxh,
  p.floor_load, p.power_system, p.water_per_day, p.has_crane, p.near_main_road,
  p.standalone_building, p.container_access, p.wastewater_pond,
  p.far_ratio, p.osr_ratio, p.road_frontage, p.road_width, p.utilities,
  p.features, p.usages,
  p.rent_per_month, p.sale_price, p.price_per_sqm, p.vat, p.withholding_tax, p.transfer_fee,
  p.common_fee, p.common_fee_payee, p.electricity_rate, p.power_payee, p.water_rate, p.water_payee,
  p.deposit, p.advance_rent, p.contract_period, p.contract_end,
  p.deed_no, p.documents, p.photo_url, p.photos, p.video_url, p.notes,
  -- ── ผู้ลงข้อมูล: บทบาทที่ถูกปิดข้อมูลเจ้าของ ให้ติดต่อคนลงข้อมูลได้ ──
  -- ชื่อ/เบอร์ไม่ได้เก็บในตาราง properties (created_by_name เดิมฝั่งแอปเติมเองผ่าน RPC org_member_names)
  -- view ดึงจาก profiles ให้เลย — อ่านข้ามคนได้เพราะ view ทำงานด้วยสิทธิ์เจ้าของ view ไม่ติด RLS ของ profiles
  (select pr.full_name from public.profiles pr where pr.id = p.created_by) as created_by_name,
  (select pr.phone     from public.profiles pr where pr.id = p.created_by) as created_by_phone,
  -- ── ธงบอก UI ว่าค่าที่หายไปเพราะ "ถูกปิด" ไม่ใช่ "ไม่มีข้อมูล" ──
  public.hide_owner_contact(p.created_by) as contact_masked,
  public.hide_location(p.created_by, p.province, p.district) as location_masked
from public.properties p
where public.can_see_property(p.created_by, p.org_id, p.province, p.district);

-- อ่านทรัพย์ได้ทาง view เท่านั้น (เขียนยังเขียนที่ตาราง)
revoke select on public.properties from authenticated, anon;
-- แต่ต้องคง select ของคอลัมน์ไม่อ่อนไหวไว้ 3 ตัว เพราะ SQL บังคับว่า
-- "update/delete ... where id = ?" ต้องมีสิทธิ์ select บนคอลัมน์ที่อยู่ใน where
-- (ไม่มี = แก้/ลบทรัพย์ไม่ได้เลยทั้งระบบ) · ข้อมูลอ่อนไหวยังปิดครบเพราะไม่ได้ให้ทีละคอลัมน์
grant select (id, org_id, created_by) on public.properties to authenticated;
grant select on public.properties_view to authenticated;

-- ── 7) member_areas: เจ้าตัวอ่านของตัวเองได้ · owner จัดการของทีมได้ ──
drop policy if exists "areas read" on public.member_areas;
create policy "areas read" on public.member_areas for select using (
  public.is_super()
  or (org_id = public.current_org() and (user_id = auth.uid() or public.is_admin()))
);
drop policy if exists "areas write" on public.member_areas;
create policy "areas write" on public.member_areas for all using (
  public.is_super() or (org_id = public.current_org() and public.is_owner())
) with check (
  public.is_super() or (org_id = public.current_org() and public.is_owner())
);

-- ── 8) เปลี่ยนบทบาท/นำสมาชิกออกได้เฉพาะ owner (กัน manager ตั้งตัวเองเป็น owner) ──
-- ⚠️ ต้องลบ policy ชุดเดิมที่อิง is_admin() ให้หมด — policy แบบ permissive หลายตัวจะ "OR" กัน
--    ถ้าเหลือตัวเดิมไว้ manager จะยังแก้บทบาทได้อยู่
drop policy if exists "membership update" on public.memberships;
drop policy if exists "membership delete" on public.memberships;
drop policy if exists "membership admin write" on public.memberships;
drop policy if exists "membership owner write" on public.memberships;
create policy "membership owner update" on public.memberships for update using (
  public.is_super() or (org_id = public.current_org() and public.is_owner())
) with check (
  public.is_super() or (org_id = public.current_org() and public.is_owner())
);
create policy "membership owner delete" on public.memberships for delete using (
  public.is_super() or (org_id = public.current_org() and public.is_owner())
);

-- ── 9) สร้างองค์กรใหม่ = เป็น owner (แทน 'admin' เดิม) ──
create or replace function public.create_organization(org_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_days int := 0;
  v_plan text := 'pro';
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if coalesce(trim(org_name), '') = '' then raise exception 'กรุณาระบุชื่อองค์กร'; end if;

  select coalesce((value->>'days')::int, 0), coalesce(nullif(value->>'plan', ''), 'pro')
    into v_days, v_plan
    from public.app_settings where key = 'trial';
  if v_plan not in ('starter', 'pro') then v_plan := 'pro'; end if;

  insert into public.organizations (name, trial_plan, trial_expires_at)
  values (
    trim(org_name),
    case when v_days > 0 then v_plan end,
    case when v_days > 0 then current_date + v_days end
  ) returning id into v_org;

  insert into public.memberships (user_id, org_id, role, active) values (auth.uid(), v_org, 'owner', true)
    on conflict (user_id, org_id) do update set role = 'owner', active = true;
  update public.profiles set active_org_id = v_org, org_id = v_org, role = 'owner', active = true where id = auth.uid();
  return v_org;
end $$;
grant execute on function public.create_organization(text) to authenticated;

-- ── 10) เชิญทีมพร้อมระบุบทบาท (owner เท่านั้น) ──
create or replace function public.create_team_invite(p_email text, p_role text default 'manager') returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_token text; v_name text; v_limit int; v_used int; v_role text;
begin
  if not public.is_owner() and not public.is_super() then raise exception 'เฉพาะเจ้าขององค์กร (Owner) เท่านั้นที่เชิญลูกทีมได้'; end if;
  if v_org is null then raise exception 'ยังไม่ได้อยู่ในองค์กร'; end if;
  if coalesce(trim(p_email), '') = '' then raise exception 'ต้องระบุอีเมล'; end if;
  v_role := coalesce(nullif(trim(p_role), ''), 'manager');
  if v_role not in ('owner','manager','associate','analyst','survey','temporary','social','trainee') then
    raise exception 'บทบาทไม่ถูกต้อง: %', v_role;
  end if;

  v_limit := public.org_seat_limit(v_org);
  if v_limit is not null then
    v_used := public.org_seats_used(v_org);
    if v_used + 1 > v_limit then                                   -- +1 = ที่นั่งของคำเชิญใบนี้
      if v_limit <= 1 then
        raise exception 'แพ็กเกจ Free ไม่รองรับลูกทีม — อัปเกรดเป็น Basic/Pro เพื่อเพิ่มทีม';
      else
        raise exception 'ที่นั่งเต็ม (ใช้ % จาก % ที่นั่ง) — ซื้อที่นั่งเพิ่ม หรืออัปเกรดระดับแพ็กเกจ', v_used, v_limit;
      end if;
    end if;
  end if;

  select full_name into v_name from public.profiles where id = auth.uid();
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.team_invites (org_id, email, token, role, invited_by, invited_by_name)
  values (v_org, lower(trim(p_email)), v_token, v_role, auth.uid(), v_name);
  return v_token;
end $$;
-- ลายเซ็นเดิม (1 พารามิเตอร์) ถูกแทนด้วยตัว default แล้ว — ลบทิ้งกัน PostgREST เลือกผิดตัว
drop function if exists public.create_team_invite(text);
grant execute on function public.create_team_invite(text, text) to authenticated;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare n int; opts text;
begin
  -- ไม่มีบทบาทเก่าค้าง
  select count(*) into n from public.memberships where role in ('admin','member');
  if n > 0 then raise exception 'ยังมี membership บทบาทเก่าค้าง % แถว', n; end if;
  select count(*) into n from public.profiles where role in ('admin','member');
  if n > 0 then raise exception 'ยังมี profile บทบาทเก่าค้าง % แถว', n; end if;

  -- ฟังก์ชันสิทธิ์ครบ
  if to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.is_owner()') is null
     or to_regprocedure('public.can_see_property(uuid,uuid,text,text)') is null
     or to_regprocedure('public.can_edit_property(uuid,uuid)') is null
     or to_regprocedure('public.can_delete_property(uuid,uuid)') is null
     or to_regprocedure('public.hide_owner_contact(uuid)') is null
     or to_regprocedure('public.hide_location(uuid,text,text)') is null
     or to_regprocedure('public.can_export()') is null then
    raise exception 'ฟังก์ชันสิทธิ์ไม่ครบ';
  end if;

  -- view ต้องมีอยู่ + ต้องมีคอลัมน์ธงบอกการปิดข้อมูล
  if to_regclass('public.properties_view') is null then raise exception 'ไม่มี view properties_view'; end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'properties_view'
     and column_name in ('contact_masked','location_masked','created_by_phone');
  if n <> 3 then raise exception 'view ขาดคอลัมน์ธง/เบอร์ผู้ลงข้อมูล (ได้ % จาก 3)', n; end if;

  -- ⭐ หัวใจของงานนี้: ผู้ใช้ต้องอ่านตาราง properties ตรงๆ ไม่ได้ (ไม่งั้นปิดฟิลด์ไม่จริง)
  if has_table_privilege('authenticated', 'public.properties', 'select') then
    raise exception 'authenticated ยัง select ตาราง properties ได้ — การปิดฟิลด์จะไม่มีผล';
  end if;
  if not has_table_privilege('authenticated', 'public.properties_view', 'select') then
    raise exception 'authenticated อ่าน properties_view ไม่ได้';
  end if;
  -- คอลัมน์อ่อนไหวต้องอ่านตรงจากตารางไม่ได้ · แต่ id ต้องอ่านได้ (ไม่งั้น update/delete พัง)
  if has_column_privilege('authenticated', 'public.properties', 'lessor_name', 'select')
     or has_column_privilege('authenticated', 'public.properties', 'phone', 'select')
     or has_column_privilege('authenticated', 'public.properties', 'lat', 'select') then
    raise exception 'ยังอ่านคอลัมน์อ่อนไหวจากตาราง properties ได้ตรงๆ';
  end if;
  if not has_column_privilege('authenticated', 'public.properties', 'id', 'select') then
    raise exception 'ต้องคง select (id) ไว้ ไม่งั้น update/delete ทรัพย์ไม่ได้';
  end if;
  -- เขียนต้องยังได้
  if not (has_table_privilege('authenticated', 'public.properties', 'insert')
          and has_table_privilege('authenticated', 'public.properties', 'update')
          and has_table_privilege('authenticated', 'public.properties', 'delete')) then
    raise exception 'authenticated เขียนตาราง properties ไม่ได้แล้ว (insert/update/delete)';
  end if;

  -- policy ครบ 4 ตัวบน properties
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'properties'
     and policyname in ('team read','team insert','team update','team delete');
  if n <> 4 then raise exception 'policy ของ properties ไม่ครบ (ได้ % จาก 4)', n; end if;

  -- แก้บทบาทสมาชิกได้เฉพาะ owner — ต้องไม่เหลือ policy เดิมที่อิง is_admin()
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'memberships' and cmd in ('UPDATE','DELETE')
     and qual like '%is_admin%';
  if n > 0 then raise exception 'ยังมี policy ของ memberships ที่ให้ manager แก้บทบาทได้ (% ตัว)', n; end if;

  -- ตารางเขต + ข้อจำกัดบทบาท
  if to_regclass('public.member_areas') is null then raise exception 'ไม่มีตาราง member_areas'; end if;
  select pg_get_constraintdef(oid) into opts from pg_constraint where conname = 'memberships_role_check';
  if opts is null or opts not like '%trainee%' then raise exception 'ข้อจำกัดบทบาทของ memberships ไม่ถูกตั้ง'; end if;

  raise notice '✅ roles: 8 บทบาท + ปิดข้อมูลระดับฟิลด์ผ่าน properties_view + เขตที่กำหนด (member_areas)';
end $$;
