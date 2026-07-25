-- HOP · นัดติดตาม (follow_ups) = ฟีเจอร์ Pro เท่านั้น — บังคับฝั่งเซิร์ฟเวอร์
-- รันใน Supabase SQL Editor (idempotent) — ต้องรัน follow-ups.sql มาก่อน
-- ------------------------------------------------------------------
-- แพทเทิร์นเดียวกับแผนเยี่ยมชม (plan-gating.sql): กันที่ "สร้างใหม่" ด้วย trigger
-- org_is_pro นับช่วงทดลองใช้เป็น Pro ด้วย (org_effective_plan) → คนทดลองใช้สร้างนัดได้
-- นัดเดิมไม่ถูกลบเมื่อตกเป็น Free — แค่สร้างเพิ่มไม่ได้ และหน้า/แจ้งเตือนถูกปิด

create or replace function public.enforce_followup_pro() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_super() then return new; end if;
  if not public.org_is_pro(public.current_org()) then
    raise exception 'นัดติดตามเป็นฟีเจอร์ Pro — อัปเกรดเพื่อใช้งาน';
  end if;
  return new;
end $$;
drop trigger if exists trg_followup_pro on public.follow_ups;
create trigger trg_followup_pro before insert on public.follow_ups
  for each row execute function public.enforce_followup_pro();

-- ตรวจผล: เห็น trigger 1 แถว
select tgname from pg_trigger where tgname = 'trg_followup_pro';
