-- HOP · สถานะงานของทรัพย์ (deal_status) — เปิดงานอยู่ / ปิดงานเพราะมีคนเช่าแล้ว / ขายแล้ว
-- รันใน Supabase SQL Editor (idempotent)
-- ------------------------------------------------------------------
-- ใช้กับระบบนัดติดตาม: ตามต่อไปเรื่อยๆ จนกด "ปิดงาน" ในการ์ดทรัพย์
-- ปิดงานแล้วแอปจะปิดนัดค้างทั้งหมดของทรัพย์นั้นให้ + ลงประวัติ · เปิดงานใหม่ได้ตลอด

alter table public.properties add column if not exists deal_status text not null default 'open'
  check (deal_status in ('open', 'rented', 'sold'));

-- ตรวจผล: ต้องเห็นคอลัมน์ deal_status
select column_name, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'properties' and column_name = 'deal_status';
