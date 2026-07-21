-- ══ ประวัติการใช้งาน (activity logs) ══
-- รันใน SQL Editor หลัง auth.sql / org.sql / super.sql
-- ทุกคนในองค์กร "เขียน" log ของตัวเองได้ แต่ "อ่าน" ได้เฉพาะแอดมินขององค์กร (และ super)
-- ห้ามแก้/ลบ — ไม่มี policy update/delete จึงเป็น audit trail ถาวร

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade
    default public.current_org(),
  user_id uuid references auth.users(id) on delete set null
    default auth.uid(),
  user_name text,                     -- ชื่อผู้ทำ ณ เวลานั้น (snapshot — โปรไฟล์เปลี่ยน/ลบ log ไม่เพี้ยน)
  action text not null,               -- เช่น property.create / plan.delete / import.run / ai.assistant
  entity_code text,                   -- รหัสอ้างอิง เช่น รหัสทรัพย์ / ชื่อแผน
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_org_time
  on public.activity_logs (org_id, created_at desc);

alter table public.activity_logs enable row level security;

-- หมายเหตุ: ต้องมี "or is_super()" ทุก policy — super admin มักไม่มี org_id
-- (current_org() = null) ถ้าไม่เผื่อไว้ super จะบันทึก/อ่านไม่ได้ (42501)

drop policy if exists "logs insert" on public.activity_logs;
create policy "logs insert" on public.activity_logs
  for insert with check (
    (user_id = auth.uid() and org_id = public.current_org() and public.org_ok(org_id))
    or public.is_super()
  );

-- log แถวนี้ถูกสร้างโดยบัญชี super หรือไม่ (security definer เพื่อข้าม RLS ของ profiles)
create or replace function public.actor_is_super(p_uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and is_super);
$$;

drop policy if exists "logs read" on public.activity_logs;
create policy "logs read" on public.activity_logs
  for select using (
    (
      org_id = public.current_org()
      and public.is_admin()
      and not public.actor_is_super(user_id)   -- แอดมินองค์กรไม่เห็นการกระทำของ super (เช่นตอนสวมสิทธิ์)
    )
    or public.is_super()
  );
