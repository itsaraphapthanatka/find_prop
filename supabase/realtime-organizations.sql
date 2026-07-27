-- เปิด Realtime ให้ตาราง organizations — dashboard ยอดสมัคร (/superstats) จะเด้งทันทีเมื่อมีสมัครใหม่/เปลี่ยนแพ็กเกจ
-- รันซ้ำได้ (idempotent) · Realtime เคารพ RLS: เฉพาะ super (อ่าน organizations ได้ทุกแถว) เท่านั้นที่รับเหตุการณ์ครบ
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'organizations'
  ) then
    alter publication supabase_realtime add table public.organizations;
  end if;
  raise notice '✅ realtime-organizations: ตาราง organizations อยู่ใน publication แล้ว';
end $$;
