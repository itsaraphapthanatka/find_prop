-- HOP · backfill membership ให้ org ที่ตกหล่น (สร้างหลัง stage1) · idempotent
insert into public.memberships (user_id, org_id, role, active, see_all_properties)
select id, org_id, coalesce(role, 'member'), coalesce(active, true), coalesce(see_all_properties, true)
from public.profiles
where org_id is not null
on conflict (user_id, org_id) do nothing;

-- ตรวจ: สมาชิกต่อองค์กร
select o.name, count(*) from public.memberships m join public.organizations o on o.id=m.org_id group by o.name order by o.name;
