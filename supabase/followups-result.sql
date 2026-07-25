-- HOP · เพิ่ม "ผลการติดตาม" (result) ในนัดติดตาม — เก็บว่าตามแล้วเกิดอะไรขึ้น
-- รันใน Supabase SQL Editor (idempotent) — ต้องรัน follow-ups.sql มาก่อน
-- ------------------------------------------------------------------
-- เช่น "โทรไม่รับ" "เจ้าของยอมลดเหลือ 320,000" "ลูกค้าไม่มาตามนัด ขอเลื่อน"
-- บันทึกตอนติ๊กเสร็จ (แอปถาม) หรือปุ่ม "บันทึกผลเลย" สำหรับเหตุการณ์ที่ทำไปแล้ว

alter table public.follow_ups add column if not exists result text;

-- ตรวจผล: ต้องเห็นคอลัมน์ result
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'follow_ups' and column_name = 'result';
