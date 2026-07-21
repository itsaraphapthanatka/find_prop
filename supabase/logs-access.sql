-- ============================================================
-- ล็อกสิทธิ์ "ประวัติการใช้งาน" (activity_logs) ให้ตรงข้อกำหนด — รันซ้ำได้
--   • member (user ทั่วไป) → อ่านไม่ได้เลย
--   • admin              → อ่านได้เฉพาะ log ขององค์กรตัวเอง และ "ไม่เห็นการกระทำของ super"
--   • super              → อ่านได้ทุก transaction ของทุกองค์กร
-- ใช้เมื่อ policy บน prod อาจหลุด/ต่างจาก repo (โค้ดฝั่งเว็บกันไว้แล้ว ด่านจริงคือ RLS นี้)
-- ============================================================
alter table public.activity_logs enable row level security;

-- helper: log แถวนี้ถูกสร้างโดยบัญชี super หรือไม่ (security definer ข้าม RLS ของ profiles)
create or replace function public.actor_is_super(p_uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and is_super);
$$;

-- อ่าน: (องค์กรตัวเอง + เป็นแอดมิน + คนทำไม่ใช่ super) หรือ super
--   → เมื่อ super สวมสิทธิ์องค์กรแล้วทำอะไร log จะผูก org นั้น แต่แอดมินองค์กรจะไม่เห็น
--     เพราะผู้กระทำเป็น super (super เองยังเห็นครบทุกอย่าง)
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

-- เขียน: ทุกคนเขียน log ของตัวเองในองค์กรตัวเองได้ (member เขียนได้ แต่ "อ่าน" ไม่ได้) / super เขียนได้
drop policy if exists "logs insert" on public.activity_logs;
create policy "logs insert" on public.activity_logs
  for insert with check (
    (user_id = auth.uid() and org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

-- audit trail ถาวร: ไม่มีสิทธิ์ update/delete
drop policy if exists "logs update" on public.activity_logs;
drop policy if exists "logs delete" on public.activity_logs;

-- ── ตรวจผล: ควรเห็นแค่ 2 แถว (SELECT ที่มี actor_is_super + INSERT) ไม่มี UPDATE/DELETE ──
select cmd, policyname, qual as using_clause, with_check
from pg_policies
where schemaname = 'public' and tablename = 'activity_logs'
order by cmd, policyname;
