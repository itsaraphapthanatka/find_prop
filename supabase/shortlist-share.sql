-- ============================================================
-- HOP · ลิงก์แชร์ชอร์ตลิสต์ให้ลูกค้า (Share Link)
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง) — ต้องรัน shortlists.sql ก่อน
-- ------------------------------------------------------------
-- ลูกค้าเปิดลิงก์ดูชอร์ตลิสต์ได้โดย "ไม่ต้องล็อกอิน" — เห็นเท่าที่อยู่ในเอกสาร PDF
-- ที่พิมพ์ส่งให้เท่านั้น · ลิงก์มีวันหมดอายุ และ super admin กำหนดเพดานอายุลิงก์ได้
--
-- ⚠️ กติกาสำคัญ: ลิงก์สาธารณะต้อง "ไม่หลุด" ข้อมูลที่เป็นทรัพย์สินของนายหน้า
--    ห้ามส่งออก: ชื่อ/บริษัท/เบอร์เจ้าของทรัพย์ · บ้านเลขที่/เลขที่ห้อง · พิกัด/ลิงก์แผนที่
--    · โน้ตภายใน · ผู้ดูแล (pic) · id/org_id
--    ไม่งั้นลูกค้าตัดนายหน้าออกแล้วไปติดต่อเจ้าของเองได้
--    (ฟังก์ชัน public_shortlist ระบุคอลัมน์ที่ส่งออกแบบ whitelist และมีเทสคุมไว้)
--
-- ตั้งค่าโดย super admin: app_settings key 'share'
--    {"days": อายุลิงก์เริ่มต้น, "maxDays": เพดานที่นายหน้าตั้งได้ (0 = ปิดการแชร์ทั้งระบบ)}
--
-- 💰 ราคาถูก "ตรึง" ไว้ตามวันที่เสนอ: ตอนสร้างลิงก์ ระบบถ่ายสำเนาข้อมูลทรัพย์เก็บไว้
--    ในคอลัมน์ snapshot ลูกค้าจึงเห็นราคาเดิมตามที่เสนอ แม้เจ้าของทรัพย์จะขึ้นราคาทีหลัง
--    · ต่ออายุลิงก์ = ไม่แตะสำเนา (ข้อเสนอเดิมไม่เปลี่ยน)
--    · จะอัปเดตราคาในลิงก์ต้องสั่งชัดเจน (p_refresh = true)
-- ============================================================

alter table public.shortlists
  add column if not exists share_token      text,
  add column if not exists share_expires_at timestamptz,
  add column if not exists shared_at        timestamptz,
  add column if not exists share_views      integer not null default 0,
  add column if not exists snapshot         jsonb,
  add column if not exists snapshot_at      timestamptz;

-- token ต้องไม่ซ้ำ (unique index บางส่วน — แถวที่ไม่ได้แชร์เป็น null ได้หลายแถว)
create unique index if not exists idx_shortlists_share_token
  on public.shortlists(share_token) where share_token is not null;

insert into public.app_settings (key, value)
values ('share', '{"days": 14, "maxDays": 90}')
on conflict (key) do nothing;

-- ค่าตั้งอายุลิงก์ (เผื่อยังไม่มีแถว → ใช้ค่าเริ่มต้น)
create or replace function public.share_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from public.app_settings where key = 'share'),
    '{"days": 14, "maxDays": 90}'::jsonb
  );
$$;

-- ── ชุดฟิลด์ที่ลูกค้าเห็นได้ (whitelist ที่เดียวในระบบ) ────
-- ใช้ 2 ที่: ถ่ายสำเนาตอนสร้างลิงก์ (share_shortlist) และเป็นทางสำรองของลิงก์เก่า
-- ที่ยังไม่มีสำเนา (public_shortlist) — อยู่ฟังก์ชันเดียวกันเพื่อไม่ให้ 2 ที่หลุดจากกัน
-- ห้ามเติมคอลัมน์ติดต่อเจ้าของ/เลขที่บ้าน/พิกัด/โน้ตภายในเข้าไปเด็ดขาด — มีเทสคุมไว้
-- (คำอธิบายอยู่นอกตัวฟังก์ชัน เพราะเทสสแกน "เนื้อในฟังก์ชัน" หาชื่อคอลัมน์ที่ห้ามส่งออก)
create or replace function public.shortlist_items(p_org uuid, p_codes text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code',             p.code,
      'photo_url',        p.photo_url,
      'property_type',    p.property_type,
      'sub_type',         p.sub_type,
      'listing_type',     p.listing_type,
      'project_name',     p.project_name,
      'subdistrict',      p.subdistrict,
      'district',         p.district,
      'province',         p.province,
      'nearby',           p.nearby,
      'land_area',        p.land_area,
      'land_rai',         p.land_rai,
      'land_ngan',        p.land_ngan,
      'land_wa',          p.land_wa,
      'usable_area',      p.usable_area,
      'building_area',    p.building_area,
      'building_height',  p.building_height,
      'ceiling_height',   p.ceiling_height,
      'floors',           p.floors,
      'bedrooms',         p.bedrooms,
      'bathrooms',        p.bathrooms,
      'parking_spaces',   p.parking_spaces,
      'floor_load',       p.floor_load,
      'power_system',     p.power_system,
      'color_zone',       p.color_zone,
      'zones',            p.zones,
      'features',         p.features,
      'usages',           p.usages,
      'contract_period',  p.contract_period,
      'deposit',          p.deposit,
      'rent_per_month',   p.rent_per_month,
      'sale_price',       p.sale_price,
      'price_per_sqm',    p.price_per_sqm
    ) order by c.ord), '[]'::jsonb)
  from unnest(p_codes) with ordinality as c(code, ord)
  join public.properties p on p.org_id = p_org and p.code = c.code;
$$;

-- ── สร้าง/ต่ออายุลิงก์แชร์ ─────────────────────────────────
-- สิทธิ์เดียวกับการแก้ชอร์ตลิสต์ (เจ้าของชุด หรือ owner/manager · social ทำไม่ได้)
-- p_days = null → ใช้ค่าเริ่มต้นของระบบ · เกินเพดานของ super admin จะถูกตัดลงมาที่เพดาน
-- ลิงก์เดิมที่ส่งลูกค้าไปแล้วยังใช้ได้ (token ไม่เปลี่ยน) — เรียกซ้ำ = ต่ออายุ
--
-- p_refresh: false (ปกติ) = ต่ออายุอย่างเดียว ราคาที่เสนอไว้ไม่เปลี่ยน
--            true         = สั่งอัปเดตสำเนาให้ตรงราคาปัจจุบัน (นายหน้าต้องกดเอง)
-- เพิ่มพารามิเตอร์ที่ 3 จึงต้อง drop ลายเซ็นเดิมก่อน ไม่งั้นได้ overload 2 ตัว
-- แล้ว PostgREST เลือกไม่ถูก (PGRST203)
drop function if exists public.share_shortlist(uuid, integer);
create or replace function public.share_shortlist(
  p_id uuid, p_days integer default null, p_refresh boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_org      uuid;
  v_by       uuid;
  v_token    text;
  v_codes    text[];
  v_snap     jsonb;
  v_snap_at  timestamptz;
  v_set      jsonb := public.share_settings();
  v_max      integer := coalesce((v_set->>'maxDays')::int, 90);
  v_days     integer := coalesce(p_days, (v_set->>'days')::int, 14);
  v_expires  timestamptz;
begin
  if not exists (select 1 from public.shortlists where id = p_id) then
    raise exception 'ไม่พบชอร์ตลิสต์นี้';
  end if;
  select org_id, created_by, share_token, codes, snapshot
    into v_org, v_by, v_token, v_codes, v_snap
  from public.shortlists where id = p_id;

  if not ( public.is_super()
           or ( v_org = public.current_org() and public.org_ok(v_org)
                and public.my_role() is distinct from 'social'
                and (v_by = auth.uid() or public.is_admin()) ) ) then
    raise exception 'ไม่มีสิทธิ์แชร์ชอร์ตลิสต์นี้';
  end if;

  if v_max <= 0 then
    raise exception 'ผู้ดูแลระบบปิดการแชร์ลิงก์ไว้';
  end if;
  v_days := least(greatest(v_days, 1), v_max);
  v_expires := now() + make_interval(days => v_days);

  -- token 32 ตัวอักษร (128 บิต) — เดาไม่ได้ในทางปฏิบัติ
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
  end if;

  -- ตรึงราคา: ถ่ายสำเนาเฉพาะครั้งแรก หรือเมื่อสั่งอัปเดตชัดเจน
  -- (ต่ออายุลิงก์เฉยๆ ต้องไม่เปลี่ยนราคาที่เสนอลูกค้าไปแล้ว)
  if v_snap is null or p_refresh then
    v_snap := public.shortlist_items(v_org, v_codes);
    v_snap_at := now();
  end if;

  update public.shortlists
  set share_token = v_token,
      share_expires_at = v_expires,
      shared_at = coalesce(shared_at, now()),
      snapshot = coalesce(v_snap, snapshot),
      snapshot_at = coalesce(v_snap_at, snapshot_at)
  where id = p_id;

  return jsonb_build_object(
    'token', v_token, 'expires_at', v_expires, 'days', v_days,
    'snapshot_at', coalesce(v_snap_at, (select snapshot_at from public.shortlists where id = p_id))
  );
end $$;

-- ยกเลิกลิงก์ทันที (ลูกค้าเปิดลิงก์เดิมไม่ได้อีก)
create or replace function public.unshare_shortlist(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid;
  v_by  uuid;
begin
  select org_id, created_by into v_org, v_by from public.shortlists where id = p_id;
  if not ( public.is_super()
           or ( v_org = public.current_org()
                and public.my_role() is distinct from 'social'
                and (v_by = auth.uid() or public.is_admin()) ) ) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกลิงก์ของชอร์ตลิสต์นี้';
  end if;
  update public.shortlists
  set share_token = null, share_expires_at = null
  where id = p_id;
end $$;

-- ── หน้าสาธารณะ: ลูกค้าเปิดด้วย token (ไม่ต้องล็อกอิน) ─────
-- ส่ง "สำเนาที่ตรึงไว้ตอนสร้างลิงก์" เป็นหลัก — ราคาที่ลูกค้าเห็นคือราคาที่เสนอ
-- ลิงก์เก่าที่สร้างก่อนมีระบบสำเนา ยังอ่านได้จากข้อมูลปัจจุบันผ่าน shortlist_items()
create or replace function public.public_shortlist(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_row   public.shortlists;
  v_items jsonb;
  v_orgnm text;
begin
  if p_token is null or length(p_token) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'notfound');
  end if;

  select * into v_row from public.shortlists where share_token = p_token;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'notfound');
  end if;
  if v_row.share_expires_at is null or v_row.share_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  -- องค์กรที่ถูก "ระงับ" (จัดการโดยผู้ดูแลระบบ) ปิดลิงก์ทันที
  -- ส่วนแพ็กเกจหมดอายุไม่ปิด — ลิงก์ที่ส่งลูกค้าไปแล้วไม่ควรพังกลางทาง
  if exists (select 1 from public.organizations
             where id = v_row.org_id and sub_status = 'suspended') then
    return jsonb_build_object('ok', false, 'reason', 'notfound');
  end if;

  select name into v_orgnm from public.organizations where id = v_row.org_id;

  -- สำเนาที่ตรึงไว้มาก่อน — ราคาที่ลูกค้าเห็น = ราคาวันที่เสนอ
  v_items := coalesce(v_row.snapshot, public.shortlist_items(v_row.org_id, v_row.codes));

  update public.shortlists set share_views = share_views + 1 where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'title', v_row.title,
    'customer_name', v_row.customer_name,
    'requirement', v_row.requirement,
    'ai', v_row.ai,
    'org_name', v_orgnm,
    'expires_at', v_row.share_expires_at,
    -- วันที่ของข้อมูลในเอกสาร (ใช้เป็นวันที่จัดทำบนหัวกระดาษ)
    'offered_at', coalesce(v_row.snapshot_at, v_row.shared_at),
    'items', v_items
  );
end $$;

-- ── สิทธิ์เรียกใช้ ─────────────────────────────────────────
-- ⚠️ Postgres แจก execute ให้ role "public" อัตโนมัติกับฟังก์ชันที่สร้างใหม่ทุกตัว
--    (public = ทุก role รวม anon) ฉะนั้น "revoke ... from anon" เพียงตัวเดียวไม่พอ —
--    anon ยังได้สิทธิ์ผ่าน public อยู่ ต้อง revoke จาก public ก่อน แล้วค่อย grant
--    ให้ authenticated เท่านั้น
revoke all on function public.share_shortlist(uuid, integer, boolean) from public, anon;
revoke all on function public.unshare_shortlist(uuid) from public, anon;
grant execute on function public.share_shortlist(uuid, integer, boolean) to authenticated;
grant execute on function public.unshare_shortlist(uuid) to authenticated;

-- shortlist_items เป็นตัวอ่านข้อมูลทรัพย์ข้ามสิทธิ์ (security definer) — ห้ามเปิดให้ anon
-- เรียกตรง ไม่งั้นเดา org_id + รหัสทรัพย์แล้วดึงข้อมูลได้โดยไม่มี token
revoke all on function public.shortlist_items(uuid, text[]) from public, anon, authenticated;

-- หน้าสาธารณะเปิดให้ anon โดยตั้งใจ (ลูกค้าไม่มีบัญชี)
grant execute on function public.public_shortlist(text) to anon, authenticated;
grant execute on function public.share_settings() to anon, authenticated;

-- ── ตรวจตัวเอง ─────────────────────────────────────────────
do $$
declare
  v_src  text;
  v_bad  text;
  v_col  text;
begin
  foreach v_col in array array['share_token','share_expires_at','shared_at','share_views',
                               'snapshot','snapshot_at']
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'shortlists' and column_name = v_col) then
      raise exception 'ไม่พบคอลัมน์ % ในตาราง shortlists', v_col;
    end if;
  end loop;

  if not exists (select 1 from pg_indexes
                 where tablename = 'shortlists' and indexname = 'idx_shortlists_share_token') then
    raise exception 'ไม่พบ unique index ของ share_token — token อาจซ้ำกันได้';
  end if;

  -- ลิงก์สาธารณะต้องไม่ส่งข้อมูลติดต่อเจ้าของ/เลขที่บ้าน/พิกัด/โน้ตภายในออกไป
  -- (ตรวจทั้ง 2 ตัว: ตัว whitelist และตัวที่ตอบลูกค้า)
  select prosrc into v_src from pg_proc where proname = 'shortlist_items';
  if v_src is null then
    raise exception 'ไม่พบฟังก์ชัน shortlist_items';
  end if;
  select v_src || coalesce((select prosrc from pg_proc where proname = 'public_shortlist'), '')
    into v_src;
  if not exists (select 1 from pg_proc where proname = 'public_shortlist') then
    raise exception 'ไม่พบฟังก์ชัน public_shortlist';
  end if;
  foreach v_bad in array array['lessor', 'phone', 'house_no', 'p.lat', 'p.lng', 'map_url', 'p.notes', 'p.pic']
  loop
    if v_src like '%' || v_bad || '%' then
      raise exception 'ลิงก์สาธารณะส่ง "%" ออกไป — ลูกค้าจะติดต่อเจ้าของข้ามนายหน้าได้', v_bad;
    end if;
  end loop;

  -- ต้องเช็ควันหมดอายุ ไม่ใช่แค่ token ถูก
  if v_src not like '%share_expires_at%' then
    raise exception 'public_shortlist ไม่ได้เช็ควันหมดอายุลิงก์';
  end if;

  -- ราคาต้องมาจากสำเนาที่ตรึงไว้ ไม่ใช่ราคาปัจจุบัน
  if v_src not like '%coalesce(v_row.snapshot%' then
    raise exception 'public_shortlist ไม่ได้ใช้สำเนาที่ตรึงไว้ — ลูกค้าจะเห็นราคาใหม่ ไม่ใช่ราคาที่เสนอ';
  end if;

  -- anon ต้องดึงข้อมูลทรัพย์ผ่าน shortlist_items ตรงๆ ไม่ได้ (ต้องมี token เท่านั้น)
  if has_function_privilege('anon', 'public.shortlist_items(uuid, text[])', 'execute') then
    raise exception 'anon ยังเรียก shortlist_items ได้ — เดา org_id + รหัสทรัพย์แล้วดูข้อมูลได้โดยไม่มีลิงก์';
  end if;

  -- anon ต้องสร้างลิงก์เองไม่ได้
  if has_function_privilege('anon', 'public.share_shortlist(uuid, integer, boolean)', 'execute') then
    raise exception 'anon ยังเรียก share_shortlist ได้ — คนนอกจะสร้างลิงก์แชร์ของชอร์ตลิสต์ใครก็ได้';
  end if;
  if not has_function_privilege('anon', 'public.public_shortlist(text)', 'execute') then
    raise exception 'anon เรียก public_shortlist ไม่ได้ — ลูกค้าจะเปิดลิงก์ไม่ได้';
  end if;
  -- revoke จาก public แล้วต้องไม่ลืม grant คืนให้ authenticated
  if not has_function_privilege('authenticated', 'public.share_shortlist(uuid, integer, boolean)', 'execute') then
    raise exception 'authenticated เรียก share_shortlist ไม่ได้ — นายหน้าจะสร้างลิงก์ไม่ได้';
  end if;
  if not has_function_privilege('authenticated', 'public.unshare_shortlist(uuid)', 'execute') then
    raise exception 'authenticated เรียก unshare_shortlist ไม่ได้ — นายหน้าจะยกเลิกลิงก์ไม่ได้';
  end if;

  raise notice 'ลิงก์แชร์ชอร์ตลิสต์พร้อมใช้ — อายุเริ่มต้น % วัน · เพดาน % วัน',
    public.share_settings()->>'days', public.share_settings()->>'maxDays';
end $$;

select key, value from public.app_settings where key = 'share';
