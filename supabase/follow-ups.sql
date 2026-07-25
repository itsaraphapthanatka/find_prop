-- HOP · ระบบนัดติดตาม (Follow-up) — ติดตามลูกค้า/เจ้าของทรัพย์ ครบกำหนดวันไหน ใครต้องทำอะไร
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- ใช้ได้ทุกแพ็กเกจ (ไม่ gate เป็น Pro) · ข้อมูลแยกองค์กรด้วย RLS แบบเดียวกับ visit_plans
-- แจ้งเตือน: api/push-cron.js (07:00 ไทย) ส่ง push นัดที่ครบกำหนด "วันนี้" ให้ทั้งองค์กร

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade
    default public.current_org(),
  property_id uuid references public.properties(id) on delete cascade,  -- ผูกทรัพย์ (ไม่บังคับ)
  title text not null,                 -- เรื่องที่ต้องติดตาม เช่น "โทรตามเจ้าของลดราคา"
  note text,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  done_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_follow_ups_org_due
  on public.follow_ups(org_id, status, due_date);

alter table public.follow_ups enable row level security;

-- ต้องมี "or is_super()" ทุก policy — super admin มักไม่มี org_id (แบบเดียวกับ visit_plans)
drop policy if exists "followup read" on public.follow_ups;
create policy "followup read" on public.follow_ups
  for select using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );
drop policy if exists "followup insert" on public.follow_ups;
create policy "followup insert" on public.follow_ups
  for insert with check (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );
drop policy if exists "followup update" on public.follow_ups;
create policy "followup update" on public.follow_ups
  for update using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );
drop policy if exists "followup delete" on public.follow_ups;
create policy "followup delete" on public.follow_ups
  for delete using (
    (org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

-- ตรวจผล: เห็นตาราง + 4 policies
select policyname from pg_policies where tablename = 'follow_ups' order by policyname;
