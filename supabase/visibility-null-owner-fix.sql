-- HOP · FIX — ตั้ง "เห็นเฉพาะของตัวเอง" แล้วยังเห็นทรัพย์คนอื่น
-- ------------------------------------------------------------------
-- อาการ: ตั้งลูกทีมเป็น "เฉพาะของตัวเอง" แต่พอล็อกอินยังเห็นทรัพย์ทุกชิ้นของทีม
-- เหตุ (2 อย่างประกอบกัน):
--   1) ทรัพย์เก่าที่ลงไว้ "ก่อน" มีคอลัมน์ created_by → created_by = NULL ทุกแถว
--      (คำสั่ง set default auth.uid() มีผลกับแถวที่เพิ่ม "ใหม่" เท่านั้น ไม่ย้อนเติมแถวเก่า)
--   2) can_see_prop() มีเงื่อนไข `or row_created_by is null`
--      = "แถวไม่มีเจ้าของ ถือเป็นของกลาง เห็นได้ทุกคน"
--      → ทรัพย์เก่าทุกชิ้นจึงโผล่ให้ลูกทีมเห็น แม้ตั้งเป็นเฉพาะตัวเอง
-- แก้: (A) เติมเจ้าของให้ทรัพย์เก่า = แอดมินขององค์กรนั้น
--      (B) ตัดเงื่อนไข `is null` ออก + ผูก policy อ่าน/แก้/ลบ เข้ากับ can_see_prop ให้แน่ใจ
-- ปลอดภัยต่อการรันซ้ำ (idempotent) · ทรานแซกชันเดียว ถ้า error จะ rollback ทั้งก้อน
begin;

-- (A) เติมเจ้าของให้ทรัพย์เก่าที่ยังว่าง = แอดมินที่เข้าร่วมองค์กรนั้น "คนแรก"
--     (แอดมินเห็นทั้ง org อยู่แล้ว การเห็นทรัพย์จึงไม่เปลี่ยน แค่ทำให้มีเจ้าของชัดเจน
--      และช่อง "ลงโดย" มีชื่อแทนที่จะว่าง)
update public.properties pr
set created_by = a.admin_id
from (
  select distinct on (org_id) org_id, id as admin_id
  from public.profiles
  where role = 'admin' and org_id is not null
  order by org_id, created_at asc
) a
where pr.created_by is null and pr.org_id = a.org_id;

-- (B) นิยาม can_see_prop ใหม่ — ตัด `or row_created_by is null` ออก
--     คงเงื่อนไขอื่นครบ:
--       · super (ไม่ได้สวมสิทธิ์) เห็นทุก org
--       · admin เห็นทั้ง org
--       · ลูกทีมที่ตั้ง "เห็นทั้งทีม" เห็นทั้ง org
--       · ลูกทีมที่ตั้ง "เฉพาะตัวเอง" เห็นเฉพาะทรัพย์ที่ตัวเองลง (created_by = ตัวเอง)
create or replace function public.can_see_prop(row_created_by uuid, row_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.super_overview()
    or ( row_org = public.current_org() and public.org_ok(row_org) and (
         public.is_admin()
         or coalesce((select p.see_all_properties from public.profiles p where p.id = auth.uid()), true)
         or row_created_by = auth.uid() ) );
$$;

-- ผูก policy อ่าน/แก้/ลบ เข้ากับ can_see_prop อีกครั้ง (กันเคส policy ถูก override)
drop policy if exists "team read" on public.properties;
create policy "team read" on public.properties
  for select using (public.can_see_prop(created_by, org_id));

drop policy if exists "team update" on public.properties;
create policy "team update" on public.properties
  for update using (public.can_see_prop(created_by, org_id))
  with check (public.is_super()
              or (org_id = public.current_org() and public.org_ok(org_id)));

drop policy if exists "team delete" on public.properties;
create policy "team delete" on public.properties
  for delete using (public.can_see_prop(created_by, org_id));

commit;

-- ===== ตรวจผล (รันหลัง commit — ไม่กระทบการแก้ที่ commit ไปแล้ว) =====
-- 1) ยังเหลือทรัพย์ที่ไม่มีเจ้าของไหม (ควรเป็น 0 ถ้าองค์กรมีแอดมิน)
select o.name as org, count(*) as total,
       count(*) filter (where pr.created_by is null) as ownerless
from public.properties pr
join public.organizations o on o.id = pr.org_id
group by o.name order by o.name;

-- 2) ทรัพย์แต่ละชิ้น "ลงโดยใคร" ตอนนี้
select pr.code, o.name as org, coalesce(pf.email, '(no owner)') as owner
from public.properties pr
join public.organizations o on o.id = pr.org_id
left join public.profiles pf on pf.id = pr.created_by
order by o.name, pr.code;

-- ===== ถ้าต้องการ "ยก" ทรัพย์ให้เป็นของลูกทีมคนใดคนหนึ่ง =====
-- (เพื่อให้คนนั้นเห็นทรัพย์ชิ้นนี้ในโหมด "เฉพาะตัวเอง")
--   update public.properties
--   set created_by = (select id from public.profiles where email = 'sale1@jkpprop.com')
--   where code = 'JKP280';
