-- บ้านเลขที่ / เลขที่ห้อง — ทุกหมวดยกเว้นที่ดินเปล่า (ที่ดินยังไม่มีสิ่งปลูกสร้าง จึงไม่มีเลขที่)
-- ช่องเดียวเก็บทั้งสองความหมาย: คอนโดโชว์ป้าย "เลขที่ห้อง" · ที่เหลือโชว์ "บ้านเลขที่"
-- เก็บเป็น text ไม่ใช่ตัวเลข เพราะเลขที่จริงมีขีด/ทับ เช่น 88/123, 9-11, 1/2 ก
-- รันซ้ำได้ (idempotent) · nullable ไม่กระทบข้อมูลเดิม
-- ต้องรันก่อน deploy โค้ดชุดนี้ ไม่งั้นการบันทึกทรัพย์จะ error เพราะ insert คอลัมน์ที่ยังไม่มี

alter table public.properties
  add column if not exists house_no text;

-- ทดสอบตัวเอง: มีคอลัมน์ และเป็น text (กันเผลอสร้างเป็น numeric แล้วเลขแบบ 88/123 เข้าไม่ได้)
do $$
declare t text;
begin
  select data_type into t from information_schema.columns
  where table_schema = 'public' and table_name = 'properties' and column_name = 'house_no';
  if t is null then
    raise exception 'ไม่พบคอลัมน์ house_no';
  end if;
  if t <> 'text' then
    raise exception 'house_no ต้องเป็น text แต่ได้ %', t;
  end if;
  raise notice '✅ house-no: เพิ่มคอลัมน์ house_no (text) เรียบร้อย';
end $$;
