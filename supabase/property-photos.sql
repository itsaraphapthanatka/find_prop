-- HOP · รองรับหลายรูปต่อทรัพย์ (แกลเลอรี · คุมจำนวน ≤10 ที่ฟอร์ม)
-- รันใน Supabase SQL Editor (idempotent) — photos[0] = รูปปก = photo_url
begin;

alter table public.properties add column if not exists photos text[];

-- ยกรูปเดิม (photo_url) เข้าแกลเลอรีเป็นรูปแรก ให้ทรัพย์เก่าโชว์ในหน้ารายละเอียดได้
update public.properties
  set photos = array[photo_url]
  where photo_url is not null
    and (photos is null or array_length(photos, 1) is null);

commit;
