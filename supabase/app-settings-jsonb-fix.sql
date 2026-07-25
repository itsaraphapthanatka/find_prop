-- HOP · FIX ด่วน — app_settings.value เป็น text ทำให้สมัครองค์กรใหม่/ระบบชวนเพื่อนพัง
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------------
-- เหตุ: review.sql สร้าง app_settings ไว้ก่อนโดย value เป็น "text" → create table if not exists
--       ใน trial.sql/referral-setting.sql เลยไม่มีผล ค่า {"days":14,...} ถูกเก็บเป็นข้อความ
--       แล้ว create_organization/apply_referral เรียก value->>'days' กับ text → error ตอนรันจริง
--       = สร้างองค์กรใหม่พัง + ให้รางวัลชวนเพื่อนพัง
-- แก้: แปลงคอลัมน์เป็น jsonb โดยย้ายข้อมูลเดิมให้ถูกชนิด:
--       'on'/'off' (review_mode) → jsonb string (โค้ดฝั่งแอปเทียบ === 'on' ได้เหมือนเดิม)
--       '{"days":...}' (trial/referral) → jsonb object → value->>'days' ใช้ได้

do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value') = 'text' then
    alter table public.app_settings
      alter column value type jsonb using (
        case
          when value is null then to_jsonb(''::text)
          when left(btrim(value), 1) in ('{', '[', '"') then value::jsonb  -- JSON อยู่แล้ว → parse
          when btrim(value) in ('true', 'false', 'null') then value::jsonb
          when btrim(value) ~ '^-?[0-9]+(\.[0-9]+)?$' then value::jsonb
          else to_jsonb(value)                                             -- ข้อความธรรมดา → jsonb string
        end
      );
  end if;
end $$;

-- ตรวจผล: trial/referral ต้องดึงตัวเลขได้แล้ว (ห้ามเป็น null) + review_mode ยังอ่านค่าเดิมได้
select key,
       value,
       value->>'days'  as days,
       value->>'plan'  as plan,
       value->>'need'  as need,
       value #>> '{}'  as as_text   -- review_mode ต้องเห็น on/off ตรงนี้
from public.app_settings
order by key;
