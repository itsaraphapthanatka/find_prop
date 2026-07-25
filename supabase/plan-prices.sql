-- HOP · ตารางราคาแพ็กเกจ — super admin ตั้งราคาเองได้จากหน้า Super Admin
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- ผู้ใช้ราคา: หน้า landing (สาธารณะ) · หน้าอัปเกรด · api/create-charge, verify-charge,
-- punpay-webhook (คิดเงินจริง — ทุกตัวมี fallback เป็นราคามาตรฐานถ้าตารางนี้ยังไม่มี)

create table if not exists public.plan_prices (
  plan       text primary key check (plan in ('starter', 'pro')),
  monthly    numeric not null check (monthly > 0),  -- ราคา ฿/เดือน
  yearly     numeric not null check (yearly > 0),   -- ราคาเหมาจ่าย ฿/ปี (ไม่ผูกสูตรส่วนลด ตั้งอิสระได้)
  updated_at timestamptz not null default now()
);
alter table public.plan_prices enable row level security;

-- อ่านได้ทุกคนรวม anon (หน้า landing สาธารณะต้องโชว์ราคา) — เขียนได้เฉพาะ super admin
drop policy if exists "prices read" on public.plan_prices;
create policy "prices read" on public.plan_prices for select using (true);
drop policy if exists "prices write" on public.plan_prices;
create policy "prices write" on public.plan_prices for all
  using (public.is_super()) with check (public.is_super());

-- ราคาตั้งต้น = ราคาที่เคย hardcode (รายปี = ลด 15%) — on conflict do nothing จึงไม่ทับราคาที่ super เคยแก้
insert into public.plan_prices (plan, monthly, yearly) values
  ('starter', 990, 10098),
  ('pro', 1290, 13158)
on conflict (plan) do nothing;

-- ตรวจผล: ต้องเห็น 2 แถว starter/pro พร้อมราคา
select plan, monthly, yearly from public.plan_prices order by plan;
