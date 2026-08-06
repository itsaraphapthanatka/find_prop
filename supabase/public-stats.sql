-- ยอดสมัครใช้งานแบบสาธารณะ (หน้า /stats — ไม่ต้องล็อกอิน)
-- ============================================================
-- ⚠️ ฟังก์ชันนี้เปิดให้ anon เรียกได้ จึงต้องคืน "ตัวเลขรวม" เท่านั้น
--    ห้ามคืนชื่อองค์กร อีเมล ชื่อคน รหัสทรัพย์ หรืออะไรที่ระบุตัวได้เด็ดขาด
--    (ตาราง organizations/profiles/properties ยังปิดด้วย RLS ตามเดิม — ฟังก์ชันนี้เป็น
--     ทางเดียวที่คนไม่ล็อกอินเห็นตัวเลข และเห็นได้แค่ผลรวม)
--
-- ⭐ นับเฉพาะ "ผู้ใช้จริง" — องค์กรทดสอบ/ของทีมงานเองไม่นับ (organizations.internal = true)
--    โชว์เลขที่มีองค์กรทดสอบปนอยู่ = โฆษณาเกินจริง (ยิ่งเป็นหน้าสาธารณะยิ่งไม่ควร)
--    ธงนี้ super admin กดเปิด/ปิดเองได้จากหน้า Super Admin (คอลัมน์ "นับใน /stats")
--
-- ไม่รวมยอดที่เป็นความลับทางธุรกิจ: จำนวนองค์กรที่จ่ายเงิน · รายได้ · ชื่อลูกค้า
-- (ถ้าต้องการโชว์ให้นักลงทุน ทำเป็นหน้าอีกอันที่ต้องใส่รหัสผ่าน — ไม่ควรเปิดสาธารณะ)
--
-- รันซ้ำได้ (idempotent)
-- ============================================================

begin;

-- ── 1) ธง "องค์กรภายใน/ทดสอบ" ─────────────────────────────
alter table public.organizations
  add column if not exists internal boolean not null default false;

-- ตั้งค่าเริ่มต้นให้องค์กรที่ "เห็นชัดว่าเป็นของทดสอบ" — ตั้งครั้งเดียวตอนเพิ่มคอลัมน์
-- (ถ้ารันซ้ำภายหลังจะไม่ทับค่าที่ super แก้ไว้ เพราะเช็ค internal = false เดิมไม่พอ
--  จึงใช้ธงใน app_settings จำว่าเคย backfill แล้ว)
do $$
declare done boolean;
begin
  select coalesce((value->>'statsBackfilled')::boolean, false) into done
    from public.app_settings where key = 'stats';
  if coalesce(done, false) then return; end if;

  -- เกณฑ์เดา: ชื่อองค์กรบอกเองว่าทดสอบ · หรือสมาชิกทุกคนเป็นอีเมลทดสอบ/โดเมนของทีมงาน
  -- เดาผิดฝั่ง "ตัดออกเกิน" ปลอดภัยกว่า "นับเกิน" — super ปรับกลับได้ทีหลัง
  update public.organizations o set internal = true
   where o.name ~* '(ทดสอบ|ตัวอย่าง|test|demo|sandbox|dummy)'
      or not exists (
           select 1 from public.memberships m
             join public.profiles p on p.id = m.user_id
            where m.org_id = o.id
              and p.email !~* '(@example\.(com|org)|@test\.|@demo\.|\+test@|@prop\.com$|@demo\.com$)'
         );

  insert into public.app_settings (key, value)
  values ('stats', jsonb_build_object('statsBackfilled', true))
  on conflict (key) do update set value = public.app_settings.value || jsonb_build_object('statsBackfilled', true),
                                  updated_at = now();
end $$;

-- ── 2) ตัวเลขสาธารณะ (นับเฉพาะองค์กรที่ไม่ใช่ internal) ──
create or replace function public.public_signup_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  with real_orgs as (
    select id, created_at::date as d
    from public.organizations
    where internal = false
  ), people as (
    -- ผู้ใช้จริง = ไม่ใช่บัญชีทีมงาน (super) และเป็นสมาชิกขององค์กรที่ไม่ใช่ทดสอบ
    select distinct p.id, p.created_at::date as d
    from public.profiles p
    join public.memberships m on m.user_id = p.id
    join real_orgs ro on ro.id = m.org_id
    where coalesce(p.is_super, false) = false
  ), months as (
    select to_char(m, 'YYYY-MM') as month, m::date as start_d,
           (m + interval '1 month')::date as end_d
    from generate_series(
      date_trunc('month', current_date) - interval '11 months',
      date_trunc('month', current_date),
      interval '1 month'
    ) m
  )
  select jsonb_build_object(
    'orgs_total',       (select count(*) from real_orgs),
    'orgs_30d',         (select count(*) from real_orgs where d >= current_date - 29),
    'orgs_7d',          (select count(*) from real_orgs where d >= current_date - 6),
    'users_total',      (select count(*) from people),
    'users_30d',        (select count(*) from people where d >= current_date - 29),
    'properties_total', (select count(*) from public.properties pr
                          where exists (select 1 from real_orgs ro where ro.id = pr.org_id)),
    -- ยอดสมัครรายเดือน 12 เดือนล่าสุด (เดือนที่ไม่มีคนสมัคร = 0 ไม่ใช่ข้าม)
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', mo.month,
               'orgs',  (select count(*) from real_orgs o where o.d >= mo.start_d and o.d < mo.end_d),
               'users', (select count(*) from people p where p.d >= mo.start_d and p.d < mo.end_d)
             ) order by mo.month), '[]'::jsonb)
      from months mo
    ),
    'updated_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );
$$;

-- เปิดให้คนที่ยังไม่ล็อกอินเรียกได้ (หน้า /stats เรียกผ่าน api/stats.js)
grant execute on function public.public_signup_stats() to anon, authenticated;

-- ── 3) super admin เปิด/ปิดธงเองได้ + เห็นในหน้าภาพรวม ──
create or replace function public.super_set_internal(p_org uuid, p_internal boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'เฉพาะ super admin'; end if;
  update public.organizations set internal = coalesce(p_internal, false) where id = p_org;
end $$;
revoke all on function public.super_set_internal(uuid, boolean) from public, anon;
grant execute on function public.super_set_internal(uuid, boolean) to authenticated;

-- หน้าภาพรวมของ super ต้องเห็นธงนี้ด้วย (ลายเซ็นเปลี่ยน → drop ก่อน)
drop function if exists public.super_org_overview();
create function public.super_org_overview()
returns table (
  id uuid, name text, plan text, sub_status text, sub_expires_at date,
  trial_plan text, trial_expires_at date,
  created_at timestamptz, member_count bigint, property_count bigint, internal boolean
)
language sql security definer set search_path = public as $$
  select o.id, o.name, o.plan, o.sub_status, o.sub_expires_at,
    o.trial_plan, o.trial_expires_at, o.created_at,
    (select count(*) from public.profiles p where p.org_id = o.id),
    (select count(*) from public.properties pr where pr.org_id = o.id),
    o.internal
  from public.organizations o
  where public.is_super()
  order by o.created_at;
$$;
grant execute on function public.super_org_overview() to authenticated;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare v jsonb; src text; n int;
begin
  select public.public_signup_stats() into v;
  if v is null then raise exception 'public_signup_stats คืน null'; end if;

  -- ต้องมีคีย์ที่หน้าเว็บใช้ครบ
  foreach src in array array['orgs_total','orgs_30d','orgs_7d','users_total','users_30d',
                            'properties_total','monthly','updated_at']
  loop
    if (v -> src) is null then raise exception 'ผลลัพธ์ขาดคีย์ %', src; end if;
  end loop;

  -- ต้องมี 12 เดือนเสมอ (เดือนว่างเป็น 0)
  if jsonb_array_length(v -> 'monthly') <> 12 then
    raise exception 'monthly ต้องมี 12 เดือน แต่ได้ %', jsonb_array_length(v -> 'monthly');
  end if;

  -- ⭐ ห้ามหลุดข้อมูลระบุตัวตน: ผลลัพธ์ทั้งก้อนต้องไม่มี @ (อีเมล) และไม่มีคีย์ชื่อ/รหัส
  if v::text like '%@%' then raise exception 'ผลลัพธ์มีอีเมลหลุดออกมา'; end if;
  foreach src in array array['name','email','code','org_name','full_name','phone','lessor']
  loop
    if v::text like '%"' || src || '"%' then raise exception 'ผลลัพธ์มีคีย์ที่ระบุตัวได้: %', src; end if;
  end loop;

  -- ⭐ ต้องไม่นับองค์กรทดสอบ: ยอดที่คืน ต้องเท่ากับจำนวนองค์กรที่ internal = false เท่านั้น
  select count(*) into n from public.organizations where internal = false;
  if (v->>'orgs_total')::int <> n then
    raise exception 'orgs_total (%) ไม่เท่ากับองค์กรที่ไม่ใช่ทดสอบ (%)', v->>'orgs_total', n;
  end if;
  select count(*) into n from public.organizations where internal = true;
  raise notice 'ตัดองค์กรทดสอบออก % แห่ง', n;

  -- anon ต้องเรียกได้ (หน้า /stats ไม่ต้องล็อกอิน) แต่ต้องอ่านตารางตรงๆ ไม่ได้
  if not has_function_privilege('anon', 'public.public_signup_stats()', 'execute') then
    raise exception 'anon เรียก public_signup_stats ไม่ได้';
  end if;
  if has_function_privilege('anon', 'public.super_set_internal(uuid,boolean)', 'execute') then
    raise exception 'anon แก้ธงองค์กรทดสอบได้ — ต้องเป็น super เท่านั้น';
  end if;
  if pg_get_function_result(to_regprocedure('public.super_org_overview()')) not like '%internal%' then
    raise exception 'super_org_overview ยังไม่คืนธง internal';
  end if;

  raise notice '✅ public-stats: องค์กรจริง % · ผู้ใช้จริง % · ทรัพย์ % (ไม่นับองค์กรทดสอบ)',
    v->>'orgs_total', v->>'users_total', v->>'properties_total';
end $$;
