-- HOP · FIX — เจ้าขององค์กร (Owner) บันทึก "แจ้งเตือนสัญญาเช่าใกล้หมด" ไม่ได้
-- รันใน Supabase → SQL Editor → Run (idempotent · รันซ้ำได้ · ทรานแซกชันเดียว)
-- ------------------------------------------------------------------
-- อาการ: Owner กดบันทึกการ์ดแจ้งเตือนสัญญาในหน้าโปรไฟล์ → "เฉพาะแอดมินขององค์กรเท่านั้นที่ตั้งค่าแจ้งเตือนได้"
-- เหตุ: set_contract_alert_days (contract-alert-per-org.sql, 2026-07-27) เช็ค profiles.role = 'admin'
--       แต่ roles.sql (2026-08-05) แปลงบทบาท admin → owner ไปแล้ว → ไม่มีใครผ่าน (ยกเว้น super)
--       และใช้ profiles.org_id แทน "องค์กรที่ใช้อยู่" (ระบบหลายองค์กร อาจตั้งผิดองค์กร)
-- แก้: เช็คสิทธิ์ด้วย my_role() = 'owner' + current_org() (ชุดเดียวกับ update_org_profile ใน account-type.sql)
--       ตรรกะตรวจค่า/จัดเรียงคงเดิมทุกอย่าง

begin;

create or replace function public.set_contract_alert_days(p_days int[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.current_org();
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if v_org is null then raise exception 'ยังไม่ได้เลือกองค์กร'; end if;
  -- เจ้าขององค์กร (super ที่สวมสิทธิ์ก็ได้ — my_role() = owner)
  if coalesce(public.my_role(), '') <> 'owner' then
    raise exception 'เฉพาะเจ้าขององค์กร (Owner) เท่านั้นที่ตั้งค่าแจ้งเตือนได้';
  end if;

  if p_days is not null then
    if coalesce(array_length(p_days, 1), 0) > 5 then
      raise exception 'ตั้งได้สูงสุด 5 เกณฑ์';
    end if;
    if exists (select 1 from unnest(p_days) d where d < 0 or d > 365) then
      raise exception 'จำนวนวันต้องอยู่ระหว่าง 0–365';
    end if;
    -- ตัดซ้ำ + เรียงมาก→น้อย · อาเรย์ว่าง = ใช้ค่ามาตรฐาน (เก็บเป็น null)
    select array_agg(distinct d order by d desc) into p_days from unnest(p_days) d;
  end if;

  update public.organizations set contract_alert_days = p_days where id = v_org;
end $$;

revoke all on function public.set_contract_alert_days(int[]) from public, anon;
grant execute on function public.set_contract_alert_days(int[]) to authenticated;

notify pgrst, 'reload schema';

commit;

-- ตรวจผล: fixed = true
select prosrc not like '%''admin''%' and prosrc like '%my_role()%' as fixed
from pg_proc where proname = 'set_contract_alert_days';
