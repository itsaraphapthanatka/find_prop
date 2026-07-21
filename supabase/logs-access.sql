-- ============================================================
-- ล็อกสิทธิ์ "ประวัติการใช้งาน" (activity_logs) ให้ตรงข้อกำหนด — รันซ้ำได้
--   • member (user ทั่วไป) → อ่านไม่ได้เลย
--   • admin              → อ่านได้เฉพาะ log ขององค์กรตัวเอง
--   • super              → อ่านได้ทุก transaction ของทุกองค์กร
-- ใช้เมื่อ policy บน prod อาจหลุด/ต่างจาก repo (โค้ดฝั่งเว็บกันไว้แล้ว ด่านจริงคือ RLS นี้)
-- ============================================================
alter table public.activity_logs enable row level security;

-- อ่าน: (องค์กรตัวเอง และเป็นแอดมิน) หรือ super
drop policy if exists "logs read" on public.activity_logs;
create policy "logs read" on public.activity_logs
  for select using (
    (org_id = public.current_org() and public.is_admin())
    or public.is_super()
  );

-- เขียน: ทุกคนเขียน log ของตัวเองในองค์กรตัวเองได้ (member เขียนได้ แต่ "อ่าน" ไม่ได้) / super เขียนได้
drop policy if exists "logs insert" on public.activity_logs;
create policy "logs insert" on public.activity_logs
  for insert with check (
    (user_id = auth.uid() and org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

-- audit trail ถาวร: ไม่มีสิทธิ์ update/delete (กันแก้/ลบย้อนหลัง)
drop policy if exists "logs update" on public.activity_logs;
drop policy if exists "logs delete" on public.activity_logs;

-- ── ตรวจผล: ควรเห็นแค่ 2 แถว ──
--   INSERT | with_check = ((user_id = auth.uid() AND org_id = current_org() AND org_ok(org_id)) OR is_super())
--   SELECT | using      = ((org_id = current_org() AND is_admin()) OR is_super())
--   ถ้าเห็นแถว UPDATE/DELETE หรือ using ของ SELECT ไม่มี is_admin() = ยังหลุดอยู่
select cmd, policyname, qual as using_clause, with_check
from pg_policies
where schemaname = 'public' and tablename = 'activity_logs'
order by cmd, policyname;
