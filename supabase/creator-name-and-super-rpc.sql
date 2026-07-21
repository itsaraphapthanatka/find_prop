-- HUP · (1) ดึงชื่อผู้ลงทรัพย์  (2) RPC บันทึก subscription ของ super แบบทนทาน
-- รันใน Supabase SQL Editor (idempotent · ทรานแซกชันเดียว)
-- ------------------------------------------------------------------
begin;

-- (1) org_member_names(): คืน id→ชื่อ ของสมาชิก เพื่อโชว์ "ลงโดย: <ชื่อ>"
--     ต้องเป็น SECURITY DEFINER เพราะ RLS ของ profiles ปิดไม่ให้ลูกทีมอ่านโปรไฟล์คนอื่น
--     คืนแค่ id + ชื่อ (ปลอดภัย) · super ที่ไม่สวมสิทธิ์เห็นทุก org / คนอื่นเห็นเฉพาะ org ตัวเอง
create or replace function public.org_member_names()
returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p
  where public.super_overview() or p.org_id = public.current_org();
$$;
grant execute on function public.org_member_names() to authenticated;

-- (2) ให้ super แก้ subscription ผ่าน RPC (SECURITY DEFINER + เช็ก is_super ข้างใน)
--     → ทนต่อการที่ policy "org update" ถูก org.sql รันทับในอนาคต (ไม่พังซ้ำอีก)
create or replace function public.super_set_plan(p_org uuid, p_plan text, p_expires date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'เฉพาะ super admin เท่านั้น'; end if;
  update public.organizations set plan = p_plan, sub_expires_at = p_expires where id = p_org;
end $$;
grant execute on function public.super_set_plan(uuid, text, date) to authenticated;

create or replace function public.super_set_status(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'เฉพาะ super admin เท่านั้น'; end if;
  update public.organizations set sub_status = p_status where id = p_org;
end $$;
grant execute on function public.super_set_status(uuid, text) to authenticated;

commit;
