-- แจ้งเตือนสัญญาเช่าใกล้หมด: ให้แอดมินแต่ละองค์กรตั้งเกณฑ์เองได้ — รันซ้ำได้ (idempotent)
-- organizations.contract_alert_days = เกณฑ์ขององค์กร (เช่น {90,60,30}) · null = ใช้ค่ามาตรฐานระบบ
-- (ค่ามาตรฐานยังอยู่ที่ app_settings 'contract_alert' — super admin แก้จากหน้า Super Admin)

alter table public.organizations add column if not exists contract_alert_days int[];

-- แก้ผ่าน RPC เท่านั้น (กันชนกับ guard ที่ห้ามสมาชิกแตะคอลัมน์ subscription ของ organizations)
create or replace function public.set_contract_alert_days(p_days int[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_ok  boolean;
begin
  -- เฉพาะแอดมิน active ขององค์กรตัวเอง (super ที่สวมสิทธิ์อยู่ก็ได้)
  select case when p.is_super then coalesce(p.impersonate_org_id, p.org_id) else p.org_id end,
         (p.role = 'admin' and p.active) or p.is_super
    into v_org, v_ok
    from public.profiles p where p.id = auth.uid();
  if v_org is null or not coalesce(v_ok, false) then
    raise exception 'เฉพาะแอดมินขององค์กรเท่านั้นที่ตั้งค่าแจ้งเตือนได้';
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

-- ทดสอบตัวเอง
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'contract_alert_days') then
    raise exception 'organizations.contract_alert_days ยังไม่ถูกสร้าง';
  end if;
  raise notice '✅ contract-alert-per-org: คอลัมน์ + RPC set_contract_alert_days พร้อมแล้ว';
end $$;
