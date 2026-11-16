-- ============================================================
-- HOP · ส่ง "ข้อเสนอ (Proposal)" เป็นลิงก์ให้ลูกค้า
-- รันใน Supabase SQL Editor ทั้งไฟล์ครั้งเดียว (ทรานแซกชันเดียว · error = rollback หมด · รันซ้ำได้)
-- ต้องรัน shortlists.sql + shortlist-share.sql ก่อน
-- ⚠️ หลังรันไฟล์นี้แล้ว ห้ามรัน shortlist-share.sql ซ้ำ — จะทับ shortlist_items / public_shortlist
--    กลับเป็นรุ่นที่ไม่มีรูปแกลเลอรีและข้อมูลข้อเสนอ (ลิงก์ข้อเสนอจะกลายเป็นตารางเปรียบเทียบ)
-- ------------------------------------------------------------
-- 1) shortlists.doc_mode = 'compare' | 'proposal' — ลิงก์เปิดเป็นเอกสารแบบไหน
--    shortlists.proposal = { agent: {name, phone, line, email}, note, valid_until } — ข้อมูลบนข้อเสนอ
-- 2) shortlist_items ส่งรูปแกลเลอรี (photos) เพิ่ม — หน้าละ 1 ทรัพย์ในข้อเสนอใช้ 1–4 รูป
-- 3) public_shortlist ส่ง doc_mode + proposal ผ่าน proposal_public() ซึ่ง whitelist ทีละคีย์
--
-- ⚠️ กติกาเดิมยังอยู่ครบ: ห้ามส่งชื่อ/เบอร์เจ้าของ · บ้านเลขที่ · พิกัด · โน้ตภายใน · ผู้ดูแล (pic)
--    ช่องทางติดต่อในข้อเสนอเป็นของ "นายหน้าผู้เสนอ" ที่กรอกเองบนหน้าเปรียบเทียบ ไม่ใช่ของเจ้าของทรัพย์
--    (แยกไว้ในฟังก์ชัน proposal_public — เทสเดิมของ shortlist-share.sql ที่สแกนคำต้องห้ามในตัว
--     shortlist_items / public_shortlist จึงยังผ่าน และมีเทสท้ายไฟล์นี้คุมคีย์ที่ส่งออกอีกชั้น)
-- ============================================================

begin;

-- ── 1) คอลัมน์ ──
alter table public.shortlists
  add column if not exists doc_mode text not null default 'compare',
  add column if not exists proposal jsonb;
alter table public.shortlists drop constraint if exists shortlists_doc_mode_check;
alter table public.shortlists
  add constraint shortlists_doc_mode_check check (doc_mode in ('compare', 'proposal'));

-- ── 2) whitelist ข้อมูลทรัพย์ (คัดจาก shortlist-share.sql + photos) ──
create or replace function public.shortlist_items(p_org uuid, p_codes text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'code',             p.code,
      'photo_url',        p.photo_url,
      'photos',           p.photos,
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

-- ── 3) ข้อมูลบนข้อเสนอที่ลูกค้าเห็น — whitelist ทีละคีย์ + จำกัดความยาว ──
--    คีย์อื่นที่อาจหลุดเข้ามาใน jsonb (เช่นจากแอปรุ่นอนาคต) จะไม่ถูกส่งออก
create or replace function public.proposal_public(p jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'agent', case when jsonb_typeof(p->'agent') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'name',  left(nullif(btrim(p->'agent'->>'name'), ''), 120),
      'phone', left(nullif(btrim(p->'agent'->>'phone'), ''), 40),
      'line',  left(nullif(btrim(p->'agent'->>'line'), ''), 80),
      'email', left(nullif(btrim(p->'agent'->>'email'), ''), 160)
    )) end,
    'note', left(nullif(btrim(p->>'note'), ''), 2000),
    'valid_until', case when (p->>'valid_until') ~ '^\d{4}-\d{2}-\d{2}$' then p->>'valid_until' end
  )) end
$$;

-- ── 4) หน้าสาธารณะ (คัดจาก shortlist-share.sql + doc_mode/proposal) ──
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
    'items', v_items,
    'doc_mode', coalesce(v_row.doc_mode, 'compare'),
    'proposal', case when v_row.doc_mode = 'proposal' then public.proposal_public(v_row.proposal) end
  );
end $$;

-- ── สิทธิ์ (เหมือน shortlist-share.sql — revoke จาก public ก่อน ไม่งั้น anon ยังได้ผ่าน public) ──
revoke all on function public.shortlist_items(uuid, text[]) from public, anon, authenticated;
revoke all on function public.proposal_public(jsonb) from public, anon;
grant execute on function public.public_shortlist(text) to anon, authenticated;

commit;

-- ── ตรวจตัวเอง (error = มีอะไรผิด · ผ่าน = ขึ้น NOTICE ท้ายสุด) ──
do $$
declare
  v_src text;
  v_bad text;
  v_out jsonb;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'shortlists' and column_name = 'doc_mode')
     or not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'shortlists' and column_name = 'proposal') then
    raise exception 'ไม่พบคอลัมน์ doc_mode / proposal ในตาราง shortlists';
  end if;

  -- ตัว whitelist ทรัพย์และตัวที่ตอบลูกค้า ต้องไม่ส่งข้อมูลเจ้าของ/บ้านเลขที่/พิกัด/โน้ตภายใน (ชุดคำเดียวกับเทสเดิม)
  select (select prosrc from pg_proc where proname = 'shortlist_items')
      || (select prosrc from pg_proc where proname = 'public_shortlist') into v_src;
  foreach v_bad in array array['lessor', 'phone', 'house_no', 'p.lat', 'p.lng', 'map_url', 'p.notes', 'p.pic']
  loop
    if v_src like '%' || v_bad || '%' then
      raise exception 'ลิงก์สาธารณะส่ง "%" ออกไป — ลูกค้าจะติดต่อเจ้าของข้ามนายหน้าได้', v_bad;
    end if;
  end loop;
  if v_src not like '%share_expires_at%' then raise exception 'public_shortlist ไม่ได้เช็ควันหมดอายุลิงก์'; end if;
  if v_src not like '%coalesce(v_row.snapshot%' then raise exception 'public_shortlist ไม่ได้ใช้สำเนาที่ตรึงไว้'; end if;
  if v_src not like '%''photos''%' then raise exception 'shortlist_items ยังไม่ส่งรูปแกลเลอรี'; end if;

  -- proposal_public ต้องตัดคีย์แปลกปลอมทิ้ง (เช่นมีคนยัดเบอร์เจ้าของลงใน jsonb)
  v_out := public.proposal_public(
    '{"agent":{"name":" สมชาย ","phone":"081","line":"","email":"a@b.co","owner_phone":"x"},
      "note":"เรียนลูกค้า","valid_until":"2026-12-31","lessor_phone":"y","extra":1}'::jsonb);
  if v_out <> '{"agent":{"name":"สมชาย","phone":"081","email":"a@b.co"},"note":"เรียนลูกค้า","valid_until":"2026-12-31"}'::jsonb then
    raise exception 'proposal_public ส่งคีย์เกิน/ผิด: %', v_out;
  end if;
  if public.proposal_public('{"valid_until":"31/12/2026"}'::jsonb) <> '{}'::jsonb then
    raise exception 'proposal_public ต้องทิ้งวันที่ผิดรูปแบบ';
  end if;
  if public.proposal_public(null) is not null or public.proposal_public('"x"'::jsonb) is not null then
    raise exception 'proposal_public ต้องคืน null เมื่อไม่ใช่ object';
  end if;

  if has_function_privilege('anon', 'public.shortlist_items(uuid, text[])', 'execute') then
    raise exception 'anon ยังเรียก shortlist_items ได้ — ดูข้อมูลทรัพย์ได้โดยไม่มีลิงก์';
  end if;
  if not has_function_privilege('anon', 'public.public_shortlist(text)', 'execute') then
    raise exception 'anon เรียก public_shortlist ไม่ได้ — ลูกค้าจะเปิดลิงก์ไม่ได้';
  end if;

  raise notice 'ลิงก์ข้อเสนอพร้อมใช้ ✓';
end $$;

select 'doc_mode' as check, exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'shortlists' and column_name = 'doc_mode') as ok
union all
select 'proposal_public', exists (select 1 from pg_proc where proname = 'proposal_public')
union all
select 'public_shortlist ส่งข้อเสนอ', (select prosrc like '%proposal_public%' from pg_proc where proname = 'public_shortlist');
