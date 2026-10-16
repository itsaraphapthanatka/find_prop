-- HOP · ล้างรายการจ่ายเงิน "โหมดทดสอบ" ของ Stripe ออกจากตาราง payments — รันครั้งเดียวหลังสลับเป็นคีย์ Live
-- รันใน Supabase → SQL Editor → Run (คำสั่งเดียว atomic · รันซ้ำได้ ไม่มีอะไรให้ลบก็ได้ deleted = 0)
-- ------------------------------------------------------------------
-- ทำไมต้องลบ: แถวใน payments = "เงินเข้าจริง" — ใช้นับสิทธิ์รางวัลชวนเพื่อน (referral-cap.sql) และยอดรายได้
--             รายการจ่ายด้วยบัตรทดสอบ 4242 ไม่ใช่เงินจริง ห้ามค้างไว้ปนกับของจริง
-- ปลอดภัย: ลบเฉพาะใบแจ้งหนี้ Stripe (charge_id ขึ้นต้น in_) ที่เกิด "ก่อน" build คีย์ Live ขึ้น
--          (2026-10-16 22:48:21 เวลาไทย) — ลูกค้าจริงที่จ่ายหลังจากนั้นไม่โดนลบแน่นอน
-- ไม่แตะ: แพ็กเกจ/วันหมดอายุขององค์กรที่ใช้ทดสอบ (ใช้ต่อได้ถึงวันหมดอายุ — ถ้าจะปรับ ทำในหน้า Super Admin)
--         รหัสลูกค้า Stripe ทดสอบบนองค์กร → ล้างให้อัตโนมัติเมื่อ Owner เปิดหน้าอัปเกรดครั้งแรกในโหมด Live
with gone as (
  delete from public.payments
   where charge_id like 'in\_%'
     and created_at < timestamptz '2026-10-16 22:48:21+07'
  returning charge_id, org_id, amount, created_at
)
select count(*)                 as deleted,
       coalesce(sum(amount), 0) as total_thb,
       min(created_at)          as first_at,
       max(created_at)          as last_at
  from gone;
