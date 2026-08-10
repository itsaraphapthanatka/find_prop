-- ═══════════════════════════════════════════════════════════════════════════
-- แก้ "สมัครสมาชิกใหม่ไม่ได้" (Database error saving new user) — รันซ้ำได้
-- อาการ: สมัครด้วย Google/อีเมลแล้วเด้ง error=server_error ตั้งแต่ ~สิงหาคม 2026
-- สาเหตุ: supabase/roles.sql เปลี่ยน check constraint ของ profiles.role เป็นบทบาท
--   8 ระดับใหม่ และแปลงข้อมูลเดิม (member → manager) แล้ว แต่ "ค่า default ของคอลัมน์"
--   ยังเป็น 'member' อยู่ → trigger สร้างโปรไฟล์ตอนสมัครใหม่ insert ค่าต้องห้าม
--   → 23514 violates check constraint "profiles_role_check"
-- ═══════════════════════════════════════════════════════════════════════════

-- สมัครเอง (self-serve) = จะไปตั้งองค์กรของตัวเองต่อ → เป็นเจ้าของ (owner)
-- ส่วนคนที่ถูกเชิญ/ถูกสร้างโดยแอดมิน ระบบตั้ง role ตามคำเชิญทับอยู่แล้ว
alter table public.profiles alter column role set default 'owner';

-- ── ตรวจผล: ต้องเห็น 'owner'::text ──
select column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';
