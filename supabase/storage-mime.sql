-- ============================================================
-- HOP · ตั้งค่าถังเก็บรูป/เอกสาร (property-photos)
-- รันใน Supabase SQL Editor (idempotent · รันซ้ำไม่พัง)
-- ------------------------------------------------------------
-- แก้อาการ: อัปโหลดรูปแล้วขึ้น
--   {"statusCode":"415","error":"invalid_mime_type",
--    "message":"mime type image/jpeg is not supported","code":"InvalidMimeType"}
--
-- สาเหตุ: ถัง property-photos ถูกตั้ง "Allowed MIME types" ไว้เป็นค่าที่ไม่มี image/jpeg
--   มักเกิดจากกรอกในหน้า Dashboard เป็นนามสกุลไฟล์ (jpg, png) ซึ่งไม่ใช่ MIME type
--   ที่ถูกต้องคือ image/jpeg, image/png
--
-- ⚠️ แอปบีบรูปทุกใบเป็น image/jpeg ก่อนอัปโหลดเสมอ (src/lib/image.ts)
--    ถ้าถังไม่รับ image/jpeg = อัปโหลดรูปไม่ได้เลยทั้งระบบ
--
-- ทำไมไม่ปล่อยว่าง (= รับทุกชนิด): policy อัปโหลดของถังนี้เปิดกว้าง
--   (storage.objects "photos anon upload") ถ้ารับทุกชนิดจะกลายเป็นที่ฝากไฟล์อะไรก็ได้
--   ใต้โดเมนเรา · ไม่ใส่ image/svg+xml ด้วย — SVG ฝัง script ได้ และถังนี้เป็น public
-- ============================================================

-- ชนิดไฟล์ที่แอปส่งขึ้นจริง:
--   · รูปทรัพย์ — บีบเป็น image/jpeg · ที่บีบไม่ได้จะผ่านตามชนิดเดิม (png/webp/gif/heic จากไอโฟน)
--   · เอกสารสิทธิ์ — รูป หรือ application/pdf (ฟอร์ม accept="image/*,application/pdf")
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos', 'property-photos', true,
  20971520,  -- 20 MB (รูปที่บีบแล้วไม่ถึง 1 MB · เผื่อ PDF เอกสารสิทธิ์หลายหน้า)
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif', 'image/avif',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = true,
    file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), excluded.file_size_limit),
    allowed_mime_types = excluded.allowed_mime_types;

-- ── ตรวจตัวเอง ─────────────────────────────────────────────
do $$
declare
  v_types text[];
  v_limit bigint;
  v_pub   boolean;
  v_need  text;
begin
  select allowed_mime_types, file_size_limit, public
    into v_types, v_limit, v_pub
  from storage.buckets where id = 'property-photos';

  if not found then
    raise exception 'ไม่พบถัง property-photos (สร้างไม่สำเร็จ?)';
  end if;

  if not v_pub then
    raise exception 'ถัง property-photos ไม่ใช่ public — รูปทรัพย์จะแสดงไม่ขึ้นในแอป';
  end if;

  -- ชนิดที่แอปส่งขึ้นแน่ๆ ต้องผ่านทุกตัว
  foreach v_need in array array['image/jpeg', 'image/png', 'application/pdf']
  loop
    if v_types is not null and not (v_need = any(v_types)) then
      raise exception 'ถัง property-photos ยังไม่อนุญาต % — อัปโหลดจะได้ 415 InvalidMimeType', v_need;
    end if;
  end loop;

  -- กันกรอกเป็นนามสกุลไฟล์ (jpg/png) ซึ่ง Storage เทียบไม่ติดตลอดกาล
  if v_types is not null and exists (
    select 1 from unnest(v_types) t where t not like '%/%'
  ) then
    raise exception 'Allowed MIME types มีค่าที่ไม่ใช่ MIME type (ต้องเป็นรูป image/jpeg ไม่ใช่ jpg)';
  end if;

  if coalesce(v_limit, 0) < 5242880 then
    raise exception 'file_size_limit เล็กเกินไป (% ไบต์) — รูปจากมือถือ/PDF จะอัปโหลดไม่ผ่าน', v_limit;
  end if;

  raise notice 'ถัง property-photos พร้อมใช้ — จำกัด % MB · อนุญาต %',
    round(v_limit / 1048576.0, 1), array_to_string(v_types, ', ');
end $$;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'property-photos';
