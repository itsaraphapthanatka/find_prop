-- ระบบชำระเงิน PunPay — ตารางบันทึกการจ่าย + ฟังก์ชันอัปเกรดแบบกันซ้ำ
-- เรียกจากเซิร์ฟเวอร์ (api/verify-charge.js) ด้วย service-role เท่านั้น
-- รันทั้งก้อนได้เลย (idempotent — รันซ้ำไม่พัง)

-- 1) ตารางบันทึกการชำระเงินที่สำเร็จ (charge_id เป็น PK → กันอัปเกรดซ้ำ)
create table if not exists public.payments (
  charge_id  text primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  plan       text not null,
  months     int  not null,
  amount     numeric not null,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
-- ไม่มี policy สำหรับผู้ใช้ทั่วไป → เข้าถึงได้เฉพาะ service-role (ซึ่ง bypass RLS)

-- 2) อัปเกรดองค์กรหลังจ่ายสำเร็จ — atomic + กันซ้ำด้วย charge_id
--    applied=true  → เพิ่งอัปเกรด/ต่ออายุให้
--    applied=false → charge นี้เคยใช้แล้ว (ไม่ต่อซ้ำ)
create or replace function public.apply_payment(
  p_charge_id text,
  p_org       uuid,
  p_plan      text,
  p_months    int,
  p_amount    numeric
) returns table(applied boolean, expires date)
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  insert into public.payments (charge_id, org_id, plan, months, amount)
  values (p_charge_id, p_org, p_plan, p_months, p_amount)
  on conflict (charge_id) do nothing;
  get diagnostics v_inserted = row_count;   -- 1 = ใหม่, 0 = ซ้ำ

  if v_inserted = 0 then
    -- charge นี้อัปเกรดไปแล้ว → คืนวันหมดอายุปัจจุบัน ไม่ต่อซ้ำ
    return query select false, (select sub_expires_at from public.organizations where id = p_org);
    return;
  end if;

  update public.organizations
     set plan = p_plan,
         sub_status = 'active',
         sub_expires_at = (greatest(coalesce(sub_expires_at, current_date), current_date)
                           + (p_months || ' months')::interval)::date
   where id = p_org
   returning sub_expires_at into expires;

  applied := true;
  return next;
end $$;

-- เรียกได้เฉพาะเซิร์ฟเวอร์ (service-role) — ห้าม user เรียกเองเพื่ออัปเกรดฟรี
revoke all on function public.apply_payment(text, uuid, text, int, numeric) from public, anon, authenticated;
grant execute on function public.apply_payment(text, uuid, text, int, numeric) to service_role;
