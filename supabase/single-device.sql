-- ═══════════════════════════════════════════════════════════════════════════
-- ล็อกอินได้ทีละเครื่อง (single device login) — รันซ้ำได้ (idempotent)
-- หลักการ: เครื่องที่ล็อกอินล่าสุดจดรหัสประจำเครื่องลง profiles.current_session_id
-- เครื่องเก่าที่ถือรหัสไม่ตรงจะออกจากระบบเองทันที (realtime + เช็คซ้ำทุก 60 วิ)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) คอลัมน์เก็บรหัสเครื่องที่ใช้งานอยู่ (null = บัญชีเก่าที่ยังไม่เคยล็อกอินหลังอัปเดต)
alter table public.profiles
  add column if not exists current_session_id text;

-- 2) RPC ให้เครื่องที่ล็อกอินสำเร็จจดรหัสของตัวเอง — จดได้เฉพาะแถวของตัวเองเท่านั้น
create or replace function public.claim_device_session(p_session text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set current_session_id = p_session
   where id = auth.uid();
$$;

revoke all on function public.claim_device_session(text) from public, anon;
grant execute on function public.claim_device_session(text) to authenticated;

-- 3) เปิด realtime ตาราง profiles — เครื่องเก่ารู้ตัวทันทีว่ามีคนล็อกอินซ้อน
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null; -- อยู่ใน publication แล้ว รันซ้ำไม่พัง
end $$;

-- ── ตรวจผล: ทั้งสองคำสั่งต้องคืน 1 แถว ──
select column_name as ok_column
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles'
   and column_name = 'current_session_id';

select tablename as ok_realtime
  from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public'
   and tablename = 'profiles';
