-- HOP · ระบบชวนเพื่อน (referral)
-- ชวนเพื่อนที่ "สร้างองค์กรใหม่" ครบทุก 2 คน → องค์กรผู้ชวนได้ Pro +30 วัน (สะสมได้)
-- รันใน Supabase SQL Editor · idempotent · ทรานแซกชันเดียว
begin;

-- 1) คอลัมน์ referral บน organizations
alter table public.organizations
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.organizations(id) on delete set null,
  add column if not exists referral_rewards_granted int not null default 0;

create unique index if not exists idx_org_referral_code
  on public.organizations(referral_code) where referral_code is not null;

-- 2) สุ่มโค้ดชวน (ตัด 0/O/1/I กันสับสน) + กันชนกัน
create or replace function public.gen_referral_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text; i int;
begin
  loop
    code := 'HOP-';
    for i in 1..5 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.organizations where referral_code = code);
  end loop;
  return code;
end $$;

-- เติมโค้ดให้องค์กรที่มีอยู่ + auto ให้องค์กรใหม่ทุกครั้ง (trigger)
update public.organizations set referral_code = public.gen_referral_code() where referral_code is null;

create or replace function public.set_referral_code() returns trigger
language plpgsql as $$
begin
  if new.referral_code is null then new.referral_code := public.gen_referral_code(); end if;
  return new;
end $$;
drop trigger if exists trg_org_referral_code on public.organizations;
create trigger trg_org_referral_code before insert on public.organizations
  for each row execute function public.set_referral_code();

-- 3) สถานะ referral ขององค์กรตัวเอง (security definer เพื่อ "นับ" องค์กรที่เราชวนข้าม RLS ได้)
create or replace function public.referral_status()
returns table(code text, referred_count int, rewards_granted int, plan text, expires_at date)
language sql stable security definer set search_path = public as $$
  select o.referral_code,
         (select count(*)::int from public.organizations r where r.referred_by = o.id),
         o.referral_rewards_granted,
         o.plan,
         o.sub_expires_at
  from public.organizations o
  where o.id = public.current_org();
$$;
grant execute on function public.referral_status() to authenticated;

-- 4) ผูกผู้ชวน + ให้รางวัล (เรียกหลังผู้ถูกชวน "สร้างองค์กรของตัวเอง" เสร็จ)
create or replace function public.apply_referral(ref_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  my_org uuid := public.current_org();
  ref_org uuid;
  cnt int; should int;
begin
  if my_org is null then return 'no_org'; end if;
  -- องค์กรของเราต้องยังไม่เคยถูกผูกผู้ชวน (กันผูกซ้ำ/เปลี่ยนผู้ชวน)
  if exists (select 1 from public.organizations where id = my_org and referred_by is not null) then
    return 'already_referred';
  end if;
  select id into ref_org from public.organizations
    where upper(referral_code) = upper(trim(ref_code));
  if ref_org is null then return 'invalid_code'; end if;
  if ref_org = my_org then return 'self'; end if;  -- กันชวนตัวเอง

  update public.organizations set referred_by = ref_org where id = my_org;

  -- ทุก 2 คนที่ชวนสำเร็จ = 1 รอบรางวัล · ให้เฉพาะรอบที่ยังไม่เคยให้
  select count(*)::int into cnt from public.organizations where referred_by = ref_org;
  should := cnt / 2;
  if should > (select referral_rewards_granted from public.organizations where id = ref_org) then
    update public.organizations set
      plan = case when plan = 'enterprise' then plan else 'pro' end,
      sub_status = 'active',
      sub_expires_at = (greatest(coalesce(sub_expires_at, current_date), current_date)
                        + make_interval(days => (should - referral_rewards_granted) * 30))::date,
      referral_rewards_granted = should
    where id = ref_org;
  end if;
  return 'ok';
end $$;
grant execute on function public.apply_referral(text) to authenticated;

commit;

-- ตรวจ: โค้ด + ยอดของทุกองค์กร
select name, referral_code, referral_rewards_granted, plan, sub_expires_at,
       (select count(*) from public.organizations r where r.referred_by = o.id) as referred_count
from public.organizations o order by name;
