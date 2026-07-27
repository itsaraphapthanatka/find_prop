-- แจ้งเตือนสัญญาเช่าใกล้หมด — รันซ้ำได้ (idempotent)
-- 1) คอลัมน์วันสิ้นสุดสัญญาเช่าบนทรัพย์ (กรอกในฟอร์ม ส่วน "เงื่อนไขสัญญา")
-- 2) เกณฑ์แจ้งล่วงหน้าใน app_settings (super admin แก้ได้จากหน้า Super Admin) — มาตรฐาน 60/30 วัน

alter table public.properties
  add column if not exists contract_end date;

insert into public.app_settings (key, value)
values ('contract_alert', '{"days":[60,30]}'::jsonb)
on conflict (key) do nothing; -- ถ้าเคยตั้งค่าไว้แล้ว ไม่ทับ

-- ทดสอบตัวเอง
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties' and column_name = 'contract_end'
  ) then
    raise exception 'คอลัมน์ contract_end ยังไม่ถูกสร้าง';
  end if;
  if not exists (select 1 from public.app_settings where key = 'contract_alert') then
    raise exception 'ยังไม่มีแถวตั้งค่า contract_alert';
  end if;
  raise notice '✅ contract-alert: คอลัมน์ contract_end + เกณฑ์แจ้งเตือน (%) พร้อมแล้ว',
    (select value from public.app_settings where key = 'contract_alert');
end $$;
