-- HOP · สวิตช์เปิด-ปิด "แพ็กเกจทดสอบระบบชำระเงิน ฿1" จากหน้า Super Admin
-- รันใน Supabase SQL Editor (idempotent) — ⚠️ ต้องรัน app-settings-jsonb-fix.sql ก่อน
-- ------------------------------------------------------------------
-- เปิด = หน้าอัปเกรดโชว์การ์ดทดสอบ ฿1 และ api/create-charge ยอมสร้างรายการ 'test'
-- ปิด = ซ่อนการ์ด + เซิร์ฟเวอร์ปฏิเสธการสร้างรายการ test (รายการที่จ่ายค้างอยู่ยัง verify ได้
--       เพื่อไม่ให้เงินค้าง — สร้างใหม่ไม่ได้ก็พอ)
-- ก่อนเปิดตัวจริง: แค่กด "ปิด" ในหน้า Super Admin — ไม่ต้องลบโค้ดอีกต่อไป

insert into public.app_settings (key, value) values ('payment_test', '{"enabled": true}')
on conflict (key) do nothing;

-- ตรวจผล: ต้องเห็น enabled เป็น true/false (ไม่ใช่ null — ถ้า null = ยังไม่ได้รัน jsonb fix)
select key, value, value->>'enabled' as enabled from public.app_settings where key = 'payment_test';
