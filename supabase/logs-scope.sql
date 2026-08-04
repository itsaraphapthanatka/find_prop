-- ============================================================
-- ขอบเขตการเห็น "ประวัติการใช้งาน" (activity_logs)
--   • สมาชิกทั่วไป (member) → อ่านไม่ได้
--   • แอดมินองค์กร          → อ่านได้ "เฉพาะองค์กรตัวเอง" เท่านั้น
--   • super admin           → อ่านได้ทั้งหมดทุกองค์กร
-- ------------------------------------------------------------
-- ไฟล์นี้เป็นตัวล่าสุดของสิทธิ์อ่าน/เขียน log (แทน logs-access.sql)
-- เพิ่มจากเดิม: กันช่องที่ log จาก trigger อาจถูก RLS ปฏิเสธแบบเงียบๆ
--   → trigger เขียน log ของแถวที่ org_id อาจไม่เท่ากับ current_org() (เช่น super เขียนแทนองค์กรลูกค้า)
--     และเขียนจาก SQL Editor ที่ auth.uid() เป็น null · policy insert เดิมจะบล็อกทั้งสองกรณี
--     ทำให้ประวัติหายเงียบ ๆ (log_event กลืน error ไว้) → อนุญาตด้วย pg_trigger_depth() > 0
-- ต้องรัน logs.sql + logs-triggers.sql มาก่อน · รันซ้ำได้ (idempotent)
-- ============================================================
alter table public.activity_logs enable row level security;

-- log แถวนี้ถูกสร้างโดยบัญชี super หรือไม่ (security definer ข้าม RLS ของ profiles)
create or replace function public.actor_is_super(p_uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and is_super);
$$;

-- ── อ่าน ──
-- แอดมิน: เฉพาะ log ขององค์กรที่กำลังใช้งานอยู่ และไม่เห็นการกระทำของ super (เช่นตอนสวมสิทธิ์)
-- super : เห็นทุกองค์กร รวม log ที่ org_id เป็น null (เช่นตอนลบองค์กร)
drop policy if exists "logs read" on public.activity_logs;
create policy "logs read" on public.activity_logs
  for select using (
    (
      org_id = public.current_org()
      and public.is_admin()
      and not public.actor_is_super(user_id)
    )
    or public.is_super()
  );

-- ── เขียน ──
-- 1) จาก trigger (pg_trigger_depth() > 0) = ระบบบันทึกให้เอง → อนุญาตเสมอ ไม่งั้นประวัติจะหายเงียบ
-- 2) จากฝั่งแอปโดยตรง (import.run / ai.*) → ต้องเป็น log ของตัวเองในองค์กรตัวเองเท่านั้น
-- 3) super → เขียนได้ทุกกรณี
drop policy if exists "logs insert" on public.activity_logs;
create policy "logs insert" on public.activity_logs
  for insert with check (
    pg_trigger_depth() > 0
    or (user_id = auth.uid() and org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

-- ── audit trail ถาวร: ไม่มีสิทธิ์ update/delete (ห้ามแก้ประวัติย้อนหลัง) ──
drop policy if exists "logs update" on public.activity_logs;
drop policy if exists "logs delete" on public.activity_logs;

-- ===== ทดสอบตัวเอง =====
do $$
declare n_sel int; n_ins int; n_bad int;
begin
  select count(*) into n_sel from pg_policies
   where schemaname='public' and tablename='activity_logs' and cmd='SELECT';
  select count(*) into n_ins from pg_policies
   where schemaname='public' and tablename='activity_logs' and cmd='INSERT';
  select count(*) into n_bad from pg_policies
   where schemaname='public' and tablename='activity_logs' and cmd in ('UPDATE','DELETE');
  if n_sel <> 1 or n_ins <> 1 then
    raise exception 'policy ไม่ครบ: select=% insert=% (ต้องเป็น 1/1)', n_sel, n_ins;
  end if;
  if n_bad > 0 then
    raise exception 'พบ policy update/delete % ตัว — ประวัติต้องแก้ย้อนหลังไม่ได้', n_bad;
  end if;
  -- policy อ่านต้องผูกกับ current_org() (กันกรณีเผลอเปิดให้เห็นข้ามองค์กร)
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='activity_logs' and cmd='SELECT'
       and qual like '%current_org%' and qual like '%is_super%'
  ) then
    raise exception 'policy อ่านไม่ได้ผูกกับ current_org()/is_super() ตามข้อกำหนด';
  end if;
  raise notice '✅ logs-scope: แอดมินเห็นเฉพาะองค์กรตัวเอง · super เห็นทั้งหมด · แก้/ลบประวัติไม่ได้';
end $$;

-- ===== ตรวจด้วยตาเพิ่ม (ไม่บังคับ) =====
-- policy ที่ใช้อยู่จริงตอนนี้
--   select cmd, policyname, qual, with_check from pg_policies
--    where schemaname='public' and tablename='activity_logs' order by cmd;
--
-- log แยกตามองค์กร (รันเป็น postgres จะเห็นทุกองค์กร — ใช้ดูว่า trigger ผูก org ถูกไหม)
--   select coalesce(o.name,'(ไม่ระบุองค์กร)') as องค์กร, count(*) as จำนวน
--     from public.activity_logs l left join public.organizations o on o.id = l.org_id
--    group by 1 order by 2 desc;
