-- ============================================================
-- ตาราง FCM token ของเครื่องที่ลงทะเบียนรับแจ้งเตือน (แอปมือถือ)
-- ฝั่งเขียน: แอปหลังล็อกอิน (src/lib/push.ts) — เขียนได้เฉพาะ token ของตัวเอง
-- ฝั่งอ่านเพื่อส่ง: api/push-cron.js ใช้ service role (ข้าม RLS อยู่แล้ว)
-- รันซ้ำได้
-- ============================================================
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table public.device_tokens enable row level security;

drop policy if exists "own tokens" on public.device_tokens;
create policy "own tokens" on public.device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

select 'device_tokens พร้อมใช้งาน — แอปจะบันทึก token อัตโนมัติหลังผู้ใช้อนุญาตแจ้งเตือน' as ผล;
