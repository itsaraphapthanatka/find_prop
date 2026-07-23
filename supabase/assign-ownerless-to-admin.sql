-- HOP · ยกทรัพย์ที่ยัง "ไม่มีเจ้าของ" (created_by = NULL) ทั้งหมด → แอดมิน
-- ------------------------------------------------------------------
-- กฎการยก (ปลอดภัย ไม่ทำให้ทรัพย์ไปโผล่ให้ลูกทีมที่ตั้ง "เห็นเฉพาะของตัวเอง"):
--   1) องค์กรที่มีแอดมิน  → ยกให้แอดมินขององค์กรนั้น (role=admin คนแรกที่เข้าร่วม)
--   2) องค์กรที่ไม่มีแอดมิน → ยกให้ super (ไม่ยกให้ member ธรรมดาเด็ดขาด)
-- ปลอดภัยต่อการรันซ้ำ (idempotent) · ทรานแซกชันเดียว
begin;

-- 1) ทรัพย์ในองค์กรที่ "มีแอดมิน" → แอดมินขององค์กรนั้น
update public.properties pr
set created_by = a.admin_id
from (
  select distinct on (org_id) org_id, id as admin_id
  from public.profiles
  where role = 'admin' and org_id is not null
  order by org_id, created_at asc
) a
where pr.created_by is null and pr.org_id = a.org_id;

-- 2) ที่ยังเหลือ = องค์กรไม่มีแอดมิน หรือทรัพย์ไม่มี org → ยกให้ super
update public.properties pr
set created_by = (
  select id from public.profiles where is_super = true order by created_at asc limit 1
)
where pr.created_by is null
  and exists (select 1 from public.profiles where is_super = true);

commit;

-- ===== วินิจฉัย + ตรวจผล (รันหลัง commit) =====
-- A) JKP Property มีใครเป็นสมาชิกบ้าง + ใครเป็นแอดมิน (ไขปมว่าทำไม 3 ชิ้นถึงยกไม่ได้)
select p.email, p.role, p.active
from public.profiles p
join public.organizations o on o.id = p.org_id
where o.name = 'JKP Property'
order by p.role, p.email;

-- B) สรุปต่อองค์กร — ownerless ต้องเป็น 0 ทุกแถว
select coalesce(o.name, '(no org)') as org,
       count(*) as total,
       count(*) filter (where pr.created_by is null) as ownerless
from public.properties pr
left join public.organizations o on o.id = pr.org_id
group by o.name order by o.name nulls last;

-- C) รายชิ้นของ JKP: ตอนนี้ "ลงโดยใคร"
select o.name as org, pr.code, coalesce(pf.email, '(no owner)') as owner
from public.properties pr
join public.organizations o on o.id = pr.org_id
left join public.profiles pf on pf.id = pr.created_by
where o.name = 'JKP Property'
order by pr.code;
