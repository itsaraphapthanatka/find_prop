-- HOP · super admin ลบองค์กรถาวร — รันใน Supabase SQL Editor (idempotent)
-- ------------------------------------------------------------------
-- ⚠️ การลบ cascade ตาม FK ที่ตั้งไว้แล้ว:
--   หายถาวร: ทรัพย์ (properties), แผนเยี่ยมชม (plans), ประวัติการใช้งาน (logs),
--            ประวัติการชำระเงิน (payments), คำเชิญ (team-invites), push, org_members
--   ไม่หาย:  บัญชีผู้ใช้ (profiles.org_id → set null = กลายเป็นไร้สังกัด ล็อกอินได้
--            แล้วเจอหน้าตั้งองค์กรใหม่) · รีวิว QA (org_id → set null)
-- ผ่าน RPC เท่านั้น (SECURITY DEFINER ข้าม RLS) — ยิงตรงตารางลบไม่ได้เพราะไม่มี delete policy

create or replace function public.super_delete_org(p_org uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'เฉพาะ super admin เท่านั้น'; end if;
  delete from public.organizations where id = p_org;
end $$;

revoke all on function public.super_delete_org(uuid) from public, anon;
grant execute on function public.super_delete_org(uuid) to authenticated;

-- ตรวจผล: ต้องเห็นฟังก์ชัน 1 แถว
select proname from pg_proc where proname = 'super_delete_org';
