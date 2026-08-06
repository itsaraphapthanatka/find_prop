-- ============================================================
-- HOP · ชอร์ตลิสต์เสนอลูกค้า (Shortlists) — บันทึกชุดเปรียบเทียบทรัพย์ไว้ใช้ซ้ำ
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง) — ต้องรัน roles.sql ก่อน
-- ------------------------------------------------------------
-- ก่อนหน้านี้หน้า /compare เก็บทุกอย่างไว้ใน state ของเบราว์เซอร์เท่านั้น
-- รีเฟรช/ปิดแท็บ = หาย และบทวิเคราะห์ AI ที่จ่ายโทเคนไปแล้วก็หายไปด้วย
-- ตารางนี้เก็บ: ทรัพย์ที่เลือก · ชื่อลูกค้า · requirement · บทวิเคราะห์ AI
--
-- เก็บ "รหัสทรัพย์" (codes) ไม่ใช่ uuid — หน้าเปรียบเทียบทั้งหน้าอ้างอิงด้วยรหัส
-- และรหัสไม่ซ้ำภายในองค์กร (ชอร์ตลิสต์ผูกกับองค์กรอยู่แล้ว) · ทรัพย์ที่ถูกลบไป
-- จะหลุดออกจากตารางเปรียบเทียบเองเวลาเปิดดู
--
-- สิทธิ์: ชอร์ตลิสต์เป็น "เอกสารของคนที่ทำ"
--   · เห็น/แก้/ลบ ของตัวเองได้ทุกบทบาท (ยกเว้น social ที่ดูได้อย่างเดียว)
--   · owner + manager เห็นของทั้งองค์กร
--   · manager ลบของ owner ไม่ได้ (กติกาเดียวกับทรัพย์)
--   · บทบาทอื่นเห็นเฉพาะของตัวเอง
-- ============================================================

create table if not exists public.shortlists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade
    default public.current_org(),
  title text not null,                   -- ชื่อชุด เช่น "โกดังบางพลี ให้คุณสมชาย"
  customer_name text,                    -- ชื่อลูกค้าที่พิมพ์บนหัวเอกสาร
  requirement text,                      -- requirement ที่ใช้ตอนให้ AI วิเคราะห์
  codes text[] not null default '{}',    -- รหัสทรัพย์ที่เลือก เรียงตามลำดับคอลัมน์ในตาราง
  ai jsonb,                              -- บทวิเคราะห์ AI ที่สร้างไว้ (เปิดซ้ำไม่ต้องจ่ายโทเคนใหม่)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shortlists_org_updated
  on public.shortlists(org_id, updated_at desc);

alter table public.shortlists enable row level security;

-- ต้องมี "or is_super()" ในทุก policy ที่ "เขียน" — super admin มักไม่มี org_id
-- (current_org() = null) ถ้าไม่เผื่อไว้ super จะสร้าง/แก้ชอร์ตลิสต์ไม่ได้ (42501)
--
-- ⚠️ การ "อ่าน" ใช้ super_overview() ไม่ใช่ is_super() — กติกาเดียวกับ properties:
--    · super ที่ไม่ได้สวมสิทธิ์ (โหมดภาพรวม) = เห็นชอร์ตลิสต์ทุกองค์กร
--    · super ที่สวมสิทธิ์องค์กรหนึ่งอยู่ = เห็นแค่ขององค์กรนั้น (เหมือนสมาชิกจริง)
--    ถ้าใช้ is_super() ตรงนี้ เวลาสวมสิทธิ์ไปเดโมให้ลูกค้าดู จะมีชอร์ตลิสต์
--    ขององค์กรอื่นโผล่ในรายการ = ข้อมูลลูกค้าหลุดข้ามองค์กร
drop policy if exists "shortlist read" on public.shortlists;
create policy "shortlist read" on public.shortlists
  for select using (
    public.super_overview()
    or ( org_id = public.current_org() and public.org_ok(org_id)
         and (created_by = auth.uid() or public.is_admin()) )
  );

-- social = ดูได้อย่างเดียว จึงสร้างไม่ได้
drop policy if exists "shortlist insert" on public.shortlists;
create policy "shortlist insert" on public.shortlists
  for insert with check (
    public.is_super()
    or ( org_id = public.current_org() and public.org_ok(org_id)
         and public.my_role() is distinct from 'social'
         and created_by = auth.uid() )
  );

drop policy if exists "shortlist update" on public.shortlists;
create policy "shortlist update" on public.shortlists
  for update using (
    public.is_super()
    or ( org_id = public.current_org() and public.org_ok(org_id)
         and public.my_role() is distinct from 'social'
         and (created_by = auth.uid() or public.is_admin()) )
  );

-- ลบ: owner ลบได้ทุกชุด · manager ลบของคนอื่นได้ยกเว้นชุดของ owner · อื่นๆ ลบได้แค่ของตัวเอง
drop policy if exists "shortlist delete" on public.shortlists;
create policy "shortlist delete" on public.shortlists
  for delete using (
    public.is_super()
    or ( org_id = public.current_org() and public.org_ok(org_id) and (
         case public.my_role()
           when 'owner'  then true
           when 'social' then false
           when 'manager' then
             created_by = auth.uid()
             or not exists (select 1 from public.memberships m
                            where m.user_id = shortlists.created_by
                              and m.org_id = shortlists.org_id and m.role = 'owner')
           else created_by = auth.uid()
         end ) )
  );

-- อัปเดต updated_at อัตโนมัติ (เรียงรายการล่าสุดขึ้นก่อน)
create or replace function public.touch_shortlist() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists shortlist_touch on public.shortlists;
create trigger shortlist_touch before update on public.shortlists
  for each row execute function public.touch_shortlist();

-- ── ตรวจตัวเอง ─────────────────────────────────────────────
do $$
declare
  v_pol   int;
  v_read  text;
  v_del   text;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'shortlists') then
    raise exception 'ไม่พบตาราง shortlists';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.shortlists'::regclass) then
    raise exception 'shortlists ยังไม่เปิด RLS — ทุกคนจะเห็นชอร์ตลิสต์ข้ามองค์กร';
  end if;

  select count(*) into v_pol from pg_policies where tablename = 'shortlists';
  if v_pol <> 4 then
    raise exception 'shortlists ควรมี 4 policies (select/insert/update/delete) แต่พบ %', v_pol;
  end if;

  -- อ่าน: ต้องคุมทั้ง "องค์กรของตัวเอง" และ "ของตัวเอง/owner-manager"
  select qual into v_read from pg_policies
  where tablename = 'shortlists' and policyname = 'shortlist read';
  if v_read not like '%current_org%' or v_read not like '%created_by%' then
    raise exception 'policy อ่าน shortlists ไม่ได้คุม created_by/current_org — บทบาทที่ควรเห็นแค่ของตัวเองจะเห็นของคนอื่น';
  end if;
  -- อ่านต้องใช้ super_overview() ไม่ใช่ is_super() — ตอน super สวมสิทธิ์ต้องแคบลงเหลือองค์กรเดียว
  if v_read not like '%super_overview%' then
    raise exception 'policy อ่าน shortlists ไม่ได้ใช้ super_overview() — super ที่สวมสิทธิ์องค์กรหนึ่งจะเห็นชอร์ตลิสต์ขององค์กรอื่นด้วย';
  end if;

  -- ลบ: manager ต้องลบชุดของ owner ไม่ได้ → policy ต้องอ้าง memberships.role = 'owner'
  select qual into v_del from pg_policies
  where tablename = 'shortlists' and policyname = 'shortlist delete';
  if v_del not like '%memberships%' then
    raise exception 'policy ลบ shortlists ไม่ได้กัน manager ลบชุดของ owner';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'shortlist_touch') then
    raise exception 'ไม่พบ trigger shortlist_touch (updated_at จะไม่ขยับ รายการจะเรียงผิด)';
  end if;

  raise notice 'shortlists พร้อมใช้ — 4 policies · RLS เปิด · trigger updated_at ครบ';
end $$;

select policyname, cmd from pg_policies where tablename = 'shortlists' order by policyname;
