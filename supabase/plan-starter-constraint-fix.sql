-- HOP · FIX — constraint ของ plan ไม่รู้จัก 'starter' → จ่ายเงินแล้วอัปเกรดพัง
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- อาการ: apply_payment ล้มด้วย "violates check constraint organizations_plan_check"
-- เหตุ:  super.sql สร้างคอลัมน์ plan พร้อม check (plan in ('free','pro','enterprise'))
--        ตอนเพิ่มแพ็กเกจ "เริ่มต้น" (starter) ภายหลัง ไม่ได้ขยาย constraint ตามไปด้วย
-- แก้:   สร้าง constraint ใหม่ให้ครอบ 'starter' ด้วย
begin;

alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('free', 'starter', 'pro', 'enterprise'));

commit;

-- ตรวจผล: ต้องเห็น 'starter' ในนิยาม constraint
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'organizations_plan_check';
