-- ยอดสมัครใช้งานแบบสาธารณะ (หน้า /stats — ไม่ต้องล็อกอิน)
-- ============================================================
-- ⚠️ ฟังก์ชันนี้เปิดให้ anon เรียกได้ จึงต้องคืน "ตัวเลขรวม" เท่านั้น
--    ห้ามคืนชื่อองค์กร อีเมล ชื่อคน รหัสทรัพย์ หรืออะไรที่ระบุตัวได้เด็ดขาด
--    (ตาราง organizations/profiles/properties ยังปิดด้วย RLS ตามเดิม — ฟังก์ชันนี้เป็น
--     ทางเดียวที่คนไม่ล็อกอินเห็นตัวเลข และเห็นได้แค่ผลรวม)
--
-- ไม่รวมยอดที่เป็นความลับทางธุรกิจ: จำนวนองค์กรที่จ่ายเงิน · รายได้ · ชื่อลูกค้า
-- (ถ้าต้องการโชว์ให้นักลงทุน ทำเป็นหน้าอีกอันที่ต้องใส่รหัสผ่าน — ไม่ควรเปิดสาธารณะ)
--
-- รันซ้ำได้ (idempotent)
-- ============================================================

begin;

create or replace function public.public_signup_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  with orgs as (
    select created_at::date as d from public.organizations
  ), people as (
    -- ไม่นับบัญชีทีมงาน (super) — ไม่ใช่ผู้สมัครจากภายนอก
    select created_at::date as d from public.profiles where coalesce(is_super, false) = false
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
    'orgs_total',       (select count(*) from orgs),
    'orgs_30d',         (select count(*) from orgs where d >= current_date - 29),
    'orgs_7d',          (select count(*) from orgs where d >= current_date - 6),
    'users_total',      (select count(*) from people),
    'users_30d',        (select count(*) from people where d >= current_date - 29),
    'properties_total', (select count(*) from public.properties),
    -- ยอดสมัครรายเดือน 12 เดือนล่าสุด (เดือนที่ไม่มีคนสมัคร = 0 ไม่ใช่ข้าม)
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', mo.month,
               'orgs',  (select count(*) from orgs o where o.d >= mo.start_d and o.d < mo.end_d),
               'users', (select count(*) from people p where p.d >= mo.start_d and p.d < mo.end_d)
             ) order by mo.month), '[]'::jsonb)
      from months mo
    ),
    'updated_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );
$$;

-- เปิดให้คนที่ยังไม่ล็อกอินเรียกได้ (หน้า /stats เรียกผ่าน api/stats.js)
grant execute on function public.public_signup_stats() to anon, authenticated;

commit;

-- ── ทดสอบตัวเอง ────────────────────────────────────────────
do $$
declare v jsonb; src text;
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

  -- anon ต้องเรียกได้ (หน้า /stats ไม่ต้องล็อกอิน) แต่ต้องอ่านตารางตรงๆ ไม่ได้
  if not has_function_privilege('anon', 'public.public_signup_stats()', 'execute') then
    raise exception 'anon เรียก public_signup_stats ไม่ได้';
  end if;
  if has_table_privilege('anon', 'public.organizations', 'select')
     and exists (select 1 from pg_policies where tablename = 'organizations' and 'anon' = any(roles)) then
    raise exception 'anon อ่านตาราง organizations ได้ — ต้องเห็นผ่านฟังก์ชันรวมเท่านั้น';
  end if;

  raise notice '✅ public-stats: องค์กร % · ผู้ใช้ % · ทรัพย์ % (คืนผลรวมเท่านั้น)',
    v->>'orgs_total', v->>'users_total', v->>'properties_total';
end $$;
