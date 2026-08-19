-- 🔍 วิเคราะห์ข้อมูลรูป/พิกัด (อ่านอย่างเดียว — ไม่แก้ไขข้อมูลใดๆ)
-- วางทั้งก้อนใน Supabase → SQL Editor → Run แล้วส่งผลลัพธ์กลับมา

-- 1) ภาพรวมพิกัด + ชนิดของ map_url (ตอบว่าทำไม "เติมพิกัด" ยังไม่เติม)
select
  count(*)                                                                                as total,
  count(*) filter (where lat is not null and lng is not null)                             as has_latlng,
  count(*) filter (where lat is null or lng is null)                                      as missing_latlng,
  count(*) filter (where (lat is null or lng is null) and (map_url is null or map_url = '')) as no_mapurl,
  count(*) filter (where (lat is null or lng is null)
                     and map_url ~* 'maps\.app\.goo\.gl|goo\.gl/maps')                     as shortlink,
  count(*) filter (where (lat is null or lng is null)
                     and map_url ~* '@-?[0-9]|!3d|[?&](q|query|ll|center|destination)=')   as full_parseable
from properties;

-- 2) ตัวอย่าง map_url จริงของทรัพย์ที่ยังไม่มีพิกัด (ดูว่าหน้าตาลิงก์เป็นแบบไหน)
select code, left(map_url, 100) as map_url_sample
from properties
where (lat is null or lng is null) and map_url is not null and map_url <> ''
limit 8;

-- 3) ภาพรวมรูป (เหลือรอ "ย้ายรูปเข้าระบบ" กี่รายการ)
select
  count(*) filter (where photo_url ~* 'drive\.google\.com'
                     and coalesce(array_length(photos,1),0) = 0)                           as photos_todo,
  count(*) filter (where coalesce(array_length(photos,1),0) > 0)                           as photos_in_system
from properties;
