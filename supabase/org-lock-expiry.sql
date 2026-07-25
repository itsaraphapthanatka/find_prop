-- HOP · นโยบายหมดอายุใหม่ — หมดช่วงทดลอง (free) = ล็อกองค์กร บังคับเลือกแพ็กเกจ
-- รันใน Supabase SQL Editor (idempotent) — ต้องรัน trial.sql มาก่อน
-- ------------------------------------------------------------------
-- แทนนโยบายเดิมใน trial.sql ที่ "หมดทดลองแล้วตกเป็น Free ใช้ต่อได้":
--   • plan = 'free' + เคยมีช่วงทดลอง (trial_expires_at ไม่ null) + หมดแล้ว → org_ok = false
--     = ล็อกทั้งแอปและ RLS ฝั่ง DB จนกว่าจะจ่ายเลือกแพ็กเกจ (ฝั่งแอป: แอดมินเจอหน้า
--     เลือกแพ็กเกจ/จ่ายเงินทันที · ลูกทีมเจอข้อความให้แจ้งแอดมิน)
--   • plan = 'free' + trial_expires_at เป็น null (org เก่าที่ไม่เคยได้ trial / ตอนปิดระบบทดลอง)
--     → ไม่ล็อก ใช้ได้ในลิมิต Free เหมือนเดิม — ถ้าอยากบังคับ org ไหน ให้ super ตั้งวัน
--     trial_expires_at ย้อนหลังให้ org นั้น
--   • แพ็กเกจจ่ายเงินหมดอายุ (sub_expires_at) → ล็อกเหมือนเดิม (แอดมินก็ต่ออายุเองได้จากหน้าเดียวกัน)

create or replace function public.org_ok(p_org uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org
      and sub_status = 'active'
      and (sub_expires_at is null or sub_expires_at >= current_date)
      and (plan is distinct from 'free'
           or trial_expires_at is null
           or trial_expires_at >= current_date)
  );
$$;

-- ตรวจผล: org_ok ต้องมีเงื่อนไข trial แล้ว (คืน 1 แถว = สำเร็จ)
select proname from pg_proc where proname = 'org_ok' and prosrc like '%trial_expires_at%';
