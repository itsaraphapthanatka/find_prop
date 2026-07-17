-- ============================================================
-- HOB — แผนเยี่ยมชมทรัพย์ (Visit Plans) — รันหลัง super.sql
-- มนุษย์จัดรูทเยี่ยมชมทรัพย์ให้ลูกค้า / AI ช่วยหาทรัพย์เมื่อลูกค้า
-- เปลี่ยน requirement — ข้อมูลแยกตามองค์กรด้วย RLS เหมือน properties
-- ============================================================

create table if not exists public.visit_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade
    default public.current_org(),
  title text not null,
  customer_name text,
  requirement text,                      -- requirement ล่าสุดของลูกค้า
  visit_date date,
  stops jsonb not null default '[]'::jsonb,  -- [{"property_id": uuid, "note": text}] เรียงตามลำดับรูท
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visit_plans enable row level security;

drop policy if exists "plan read" on public.visit_plans;
create policy "plan read" on public.visit_plans
  for select using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );
drop policy if exists "plan insert" on public.visit_plans;
create policy "plan insert" on public.visit_plans
  for insert with check (org_id = public.current_org() and public.org_ok(org_id));
drop policy if exists "plan update" on public.visit_plans;
create policy "plan update" on public.visit_plans
  for update using (org_id = public.current_org() and public.org_ok(org_id));
drop policy if exists "plan delete" on public.visit_plans;
create policy "plan delete" on public.visit_plans
  for delete using (org_id = public.current_org() and public.org_ok(org_id));

-- อัปเดต updated_at อัตโนมัติ
create or replace function public.touch_visit_plan() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists visit_plan_touch on public.visit_plans;
create trigger visit_plan_touch before update on public.visit_plans
  for each row execute function public.touch_visit_plan();
