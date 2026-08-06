// ทดสอบระบบบันทึกชอร์ตลิสต์เสนอลูกค้า — รัน: npm run test:shortlist
// เคสต้นเรื่อง: หน้า /compare เก็บทุกอย่างไว้ใน state เบราว์เซอร์ รีเฟรชแล้วหาย
// (รวมบทวิเคราะห์ AI ที่จ่ายโทเคนไปแล้ว) — ต้องบันทึกลงฐานข้อมูล + คุมสิทธิ์ให้ตรงกับทรัพย์
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/shortlists.sql', 'utf8')
const page = readFileSync('src/pages/ComparePage.tsx', 'utf8')
const hook = readFileSync('src/hooks/useShortlists.ts', 'utf8')
const types = readFileSync('src/types.ts', 'utf8')
const css = readFileSync('src/styles.css', 'utf8')

const fails = []
let pass = 0
const ok = (name, cond) => (cond ? pass++ : fails.push(name))

/** ตัดเอาแต่เนื้อใน policy ที่ระบุ (กันแมตช์ข้าม policy) */
function policyBody(name) {
  const i = sql.indexOf(`create policy "${name}"`)
  if (i < 0) return ''
  const j = sql.indexOf('\ndrop policy', i)
  const k = sql.indexOf('\n-- อัปเดต updated_at', i)
  const end = [j, k].filter((x) => x > i).sort((a, b) => a - b)[0] ?? sql.length
  return sql.slice(i, end)
}

// ── 1) โครงตาราง: ต้องเก็บครบทั้งชุด ไม่ใช่แค่รหัสทรัพย์ ──────────
ok('มีตาราง shortlists (idempotent)', /create table if not exists public\.shortlists/.test(sql))
for (const col of ['org_id', 'title', 'customer_name', 'requirement', 'codes', 'ai', 'created_by', 'updated_at']) {
  ok(`ตาราง shortlists มีคอลัมน์ ${col}`, new RegExp(`^\\s+${col}\\s`, 'm').test(sql))
}
ok('codes เป็น text[] (รหัสทรัพย์เรียงตามลำดับคอลัมน์)', /codes\s+text\[\]/.test(sql))
ok('ai เป็น jsonb (เปิดซ้ำไม่ต้องเรียก AI ใหม่)', /ai\s+jsonb/.test(sql))
ok('org_id default current_org() — แยกข้อมูลตามองค์กรอัตโนมัติ',
  /org_id[\s\S]{0,120}default public\.current_org\(\)/.test(sql))
ok('created_by default auth.uid() — รู้ว่าใครเป็นเจ้าของชุด', /created_by uuid default auth\.uid\(\)/.test(sql))
ok('index ใช้ if not exists (รันซ้ำได้)', /create index if not exists idx_shortlists_org_updated/.test(sql))

// ── 2) RLS: ห้ามหลุดข้ามองค์กร และต้องมีทั้ง 4 คำสั่ง ──────────────
ok('เปิด RLS', /alter table public\.shortlists enable row level security/.test(sql))
const cmds = ['read', 'insert', 'update', 'delete']
for (const c of cmds) {
  ok(`มี policy "shortlist ${c}"`, sql.includes(`create policy "shortlist ${c}"`))
  ok(`policy "shortlist ${c}" มี drop if exists นำหน้า (รันซ้ำไม่ error 42710)`,
    sql.includes(`drop policy if exists "shortlist ${c}"`))
}
for (const c of cmds) {
  const b = policyBody(`shortlist ${c}`)
  ok(`policy ${c} ผูกกับองค์กรตัวเอง`, b.includes('public.current_org()'))
  ok(`policy ${c} เช็คสถานะองค์กร (org_ok)`, b.includes('public.org_ok('))
}
// การ "เขียน" ต้องเผื่อ super ที่ไม่มี org (current_org() = null) ไม่งั้นโดน 42501
for (const c of ['insert', 'update', 'delete']) {
  ok(`policy ${c} เผื่อ super admin ที่ไม่มี org`, policyBody(`shortlist ${c}`).includes('public.is_super()'))
}
// การ "อ่าน" ต้องแคบลงเหลือองค์กรเดียวตอน super สวมสิทธิ์ (ไม่งั้นเดโมให้ลูกค้าดูแล้วข้อมูลองค์กรอื่นโผล่)
ok('อ่านใช้ super_overview() ไม่ใช่ is_super()',
  policyBody('shortlist read').includes('public.super_overview()')
  && !policyBody('shortlist read').includes('public.is_super()'))
ok('SQL ตรวจเองว่า policy อ่านใช้ super_overview', /v_read not like '%super_overview%'/.test(sql))

// ── 3) สิทธิ์ตามบทบาท 8 ระดับ (ต้องตรงกับกติกาของทรัพย์) ──────────
const read = policyBody('shortlist read')
ok('อ่าน: เห็นของตัวเองเสมอ', read.includes('created_by = auth.uid()'))
ok('อ่าน: owner/manager เห็นทั้งองค์กร (is_admin)', read.includes('public.is_admin()'))

const ins = policyBody('shortlist insert')
ok('สร้าง: social (ดูได้อย่างเดียว) สร้างไม่ได้', /my_role\(\) is distinct from 'social'/.test(ins))
ok('สร้าง: ต้องเป็นชุดของตัวเอง (ปลอม created_by ไม่ได้)', ins.includes('created_by = auth.uid()'))

const upd = policyBody('shortlist update')
ok('แก้: social แก้ไม่ได้', /my_role\(\) is distinct from 'social'/.test(upd))
ok('แก้: ของตัวเอง หรือ owner/manager', upd.includes('created_by = auth.uid()') && upd.includes('public.is_admin()'))

const del = policyBody('shortlist delete')
ok('ลบ: owner ลบได้ทุกชุด', /when 'owner'\s+then true/.test(del))
ok('ลบ: social ลบไม่ได้', /when 'social' then false/.test(del))
ok('ลบ: manager ลบชุดของ owner ไม่ได้', /when 'manager' then[\s\S]{0,320}m\.role = 'owner'/.test(del))
ok('ลบ: บทบาทอื่นลบได้แค่ของตัวเอง', /else created_by = auth\.uid\(\)/.test(del))

// ── 4) updated_at ต้องขยับ ไม่งั้นรายการเรียงผิด ──────────────────
ok('มี trigger อัปเดต updated_at', /create trigger shortlist_touch before update on public\.shortlists/.test(sql))
ok('trigger drop ก่อน create (รันซ้ำได้)', /drop trigger if exists shortlist_touch/.test(sql))
ok('ฟังก์ชัน trigger ใช้ or replace', /create or replace function public\.touch_shortlist/.test(sql))

// ── 5) ตรวจตัวเองใน SQL — ต้องพังเสียงดังถ้าติดตั้งไม่ครบ ─────────
ok('SQL มีบล็อกตรวจตัวเอง (raise exception)', /raise exception/.test(sql))
ok('ตรวจว่า RLS เปิดจริง', /relrowsecurity/.test(sql))
ok('ตรวจว่ามี 4 policies', /v_pol <> 4/.test(sql))
ok('ตรวจว่า policy อ่านคุม created_by (ไม่งั้น trainee เห็นของคนอื่น)',
  /v_read not like '%created_by%'/.test(sql))

// ── 6) ฝั่งแอป: บันทึก/เปิด/ลบ ครบ และไม่กลืน error ────────────────
ok('มี type Shortlist', /export interface Shortlist/.test(types))
ok('CompareResult ย้ายมาอยู่ types (ใช้ร่วมกับ shortlists.ai)', /export interface CompareResult/.test(types))
ok('hook เรียงล่าสุดขึ้นก่อน', /order\('updated_at', \{ ascending: false \}\)/.test(hook))
ok('hook บอกทางเมื่อยังไม่ได้รันตาราง', hook.includes('supabase/shortlists.sql'))

ok('หน้า compare insert ลงตาราง shortlists', /from\('shortlists'\)\s*\.insert/.test(page))
ok('หน้า compare update ชุดที่เปิดอยู่', /from\('shortlists'\)\s*\.update\(payload\)\s*\.eq\('id', curId\)/.test(page))
ok('หน้า compare ลบชุดได้', /from\('shortlists'\)\s*\.delete\(\)\s*\.eq\('id', sl\.id\)/.test(page))
ok('บันทึกเก็บบทวิเคราะห์ AI ไปด้วย', /payload = \{[\s\S]{0,220}\bai,/.test(page))
ok('บันทึกเก็บ requirement + ชื่อลูกค้า',
  /customer_name: customer\.trim\(\) \|\| null/.test(page) && /requirement: requirement\.trim\(\) \|\| null/.test(page))
ok('ปุ่มบันทึกซ่อนจากบทบาทดูได้อย่างเดียว', /!perm\.readOnly && picked\.length >= 2/.test(page))
ok('ปุ่มลบขึ้นเฉพาะคนที่ลบได้ (กติกาเดียวกับทรัพย์)', /perm\.canDelete\(\{ created_by: sl\.created_by/.test(page))
ok('42501 อธิบายเป็นภาษาคน ไม่โยน error ดิบ', /42501[\s\S]{0,160}ดูได้อย่างเดียว/.test(page))
ok('ไม่ให้บันทึกชุดที่มีทรัพย์ < 2 (เอกสารเปรียบเทียบต้องมี 2 ขึ้นไป)',
  /if \(picked\.length < 2\) return/.test(page))
ok('เตือนเมื่อมีการแก้ไขที่ยังไม่บันทึก', page.includes('มีการแก้ไขที่ยังไม่บันทึก'))
ok('ปุ่มบันทึกปิดเมื่อไม่มีอะไรเปลี่ยน', /disabled=\{saving \|\| !dirty\}/.test(page))
ok('dirty เทียบ codes ด้วย (เพิ่ม/ถอดทรัพย์ = ยังไม่บันทึก)', /cur\.codes\.join\(','\) !== codes\.join\(','\)/.test(page))
ok('dirty เทียบบทวิเคราะห์ AI ด้วย', /JSON\.stringify\(cur\.ai \?\? null\) !== JSON\.stringify\(ai \?\? null\)/.test(page))
ok('เปิดชุดที่บันทึกไว้ไม่ถูก ?codes= ทับ', /appliedParam\.current = true \/\/ เปิดชุด/.test(page))
ok('เปิดชุดแล้วไม่กรอง codes ทิ้งตอนทรัพย์ยังโหลดไม่เสร็จ',
  /setCodes\(sl\.codes\.slice\(0, MAX_PICK\)\)/.test(page))

// ── 7) พิมพ์เอกสาร: การ์ดควบคุมต้องไม่ติดไปในกระดาษ ──────────────
ok('print ซ่อนการ์ดชอร์ตลิสต์ที่บันทึกไว้', /@media print[\s\S]{0,400}\.compare-saved/.test(css))
ok('print ซ่อนการ์ดลิงก์แชร์', /@media print[\s\S]{0,400}\.compare-share/.test(css))
ok('print ซ่อนแถบเครื่องมือของหน้าที่ลูกค้าเปิด', /@media print[\s\S]{0,460}\.share-bar/.test(css))

// ══ ลิงก์แชร์ให้ลูกค้า (supabase/shortlist-share.sql) ══════════════
const sh = readFileSync('supabase/shortlist-share.sql', 'utf8')
const lib = readFileSync('src/lib/share.ts', 'utf8')
const sharePage = readFileSync('src/pages/SharePage.tsx', 'utf8')
const sheet = readFileSync('src/components/CompareSheet.tsx', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const superPage = readFileSync('src/pages/SuperAdminPage.tsx', 'utf8')

/** เนื้อในฟังก์ชัน plpgsql ตัวที่ระบุ (ไม่รวมคอมเมนต์นอกฟังก์ชัน) */
function fnBody(name) {
  const i = sh.indexOf(`create or replace function public.${name}(`)
  if (i < 0) return ''
  const open = sh.indexOf('$$', i)
  const close = sh.indexOf('$$;', open + 2)
  return open < 0 || close < 0 ? '' : sh.slice(open, close)
}

// ── 8) คอลัมน์ + ค่าตั้งอายุลิงก์ ─────────────────────────────────
for (const col of ['share_token', 'share_expires_at', 'shared_at', 'share_views']) {
  ok(`เพิ่มคอลัมน์ ${col} แบบ if not exists`, new RegExp(`add column if not exists ${col}\\b`).test(sh))
}
ok('token ห้ามซ้ำ (unique index)', /create unique index if not exists idx_shortlists_share_token/.test(sh))
ok('unique index เป็น partial (แถวที่ไม่แชร์เป็น null ได้หลายแถว)',
  /idx_shortlists_share_token[\s\S]{0,120}where share_token is not null/.test(sh))
ok('มีค่าตั้ง app_settings key share', /values \('share', '\{"days": \d+, "maxDays": \d+\}'\)/.test(sh))
ok('ใส่ค่าตั้งแบบ on conflict do nothing (รันซ้ำไม่ทับค่าที่ super ตั้งไว้)',
  /on conflict \(key\) do nothing/.test(sh))

// ── 9) ห้ามข้อมูลนายหน้าหลุดออกหน้าสาธารณะ ───────────────────────
const pub = fnBody('public_shortlist')
const wl = fnBody('shortlist_items')   // whitelist ฟิลด์ที่ลูกค้าเห็นได้ (ที่เดียวในระบบ)
ok('มีฟังก์ชัน public_shortlist', pub.length > 0)
ok('มีฟังก์ชัน shortlist_items', wl.length > 0)
for (const bad of ['lessor', 'phone', 'house_no', 'p.lat', 'p.lng', 'map_url', 'p.notes', 'p.pic', 'created_by']) {
  ok(`ลิงก์สาธารณะไม่ส่ง "${bad}" ออกไป`, !pub.includes(bad) && !wl.includes(bad))
}
ok('ลิงก์สาธารณะส่งเฉพาะฟิลด์ในเอกสาร (ทำเล/ราคา/พื้นที่)',
  wl.includes("'province'") && wl.includes("'rent_per_month'") && wl.includes("'usable_area'"))
ok('เรียงทรัพย์ตามลำดับที่นายหน้าจัดไว้ (with ordinality)', /unnest\(p_codes\) with ordinality/.test(wl))
ok('ผูกทรัพย์กับองค์กรของชอร์ตลิสต์ (กันรหัสชนกันข้ามองค์กร)',
  /p\.org_id = p_org and p\.code = c\.code/.test(wl))
ok('SQL ตรวจเองว่าไม่มีฟิลด์ต้องห้ามหลุดออกไป', /ลิงก์สาธารณะส่ง "%" ออกไป/.test(sh))

// ── 10) วันหมดอายุ + สิทธิ์เรียกใช้ ───────────────────────────────
ok('เช็ควันหมดอายุก่อนส่งข้อมูล', /share_expires_at is null or v_row\.share_expires_at < now\(\)/.test(pub))
ok('token สั้นเกินไปตัดทิ้งทันที (กันยิงเดา)', /length\(p_token\) < 16/.test(pub))
ok('องค์กรที่ถูกระงับ ลิงก์ปิดทันที', /sub_status = 'suspended'/.test(pub))
ok('นับจำนวนครั้งที่ลูกค้าเปิดดู', /share_views = share_views \+ 1/.test(pub))
ok('ลิงก์หมดอายุ/ไม่มี ตอบเป็นเหตุผล ไม่ใช่ข้อมูลทรัพย์',
  /'ok', false, 'reason', 'expired'/.test(pub) && /'ok', false, 'reason', 'notfound'/.test(pub))

const mk = fnBody('share_shortlist')
ok('สร้างลิงก์: social ทำไม่ได้', /my_role\(\) is distinct from 'social'/.test(mk))
ok('สร้างลิงก์: เจ้าของชุด หรือ owner/manager เท่านั้น',
  /v_by = auth\.uid\(\) or public\.is_admin\(\)/.test(mk))
ok('สร้างลิงก์: องค์กรต้องยังใช้งานได้ (org_ok)', /public\.org_ok\(v_org\)/.test(mk))
ok('เพดานของ super admin ตัดอายุลิงก์ที่นายหน้าขอ', /least\(greatest\(v_days, 1\), v_max\)/.test(mk))
ok('เพดาน 0 = ปิดการแชร์ทั้งระบบ', /v_max <= 0[\s\S]{0,120}raise exception/.test(mk))
ok('ต่ออายุแล้ว token เดิมยังใช้ได้ (ลิงก์ที่ส่งลูกค้าไปไม่พัง)',
  /if v_token is null then[\s\S]{0,140}gen_random_uuid/.test(mk))
ok('token ยาวพอเดาไม่ได้ (uuid 32 ตัวอักษร)', /replace\(gen_random_uuid\(\)::text, '-', ''\)/.test(mk))

const un = fnBody('unshare_shortlist')
ok('ยกเลิกลิงก์ได้ (token = null)', /share_token = null/.test(un))
ok('ยกเลิกลิงก์: คนอื่นในองค์กรทำแทนไม่ได้ ถ้าไม่ใช่ owner/manager',
  /v_by = auth\.uid\(\) or public\.is_admin\(\)/.test(un))

ok('anon เรียก public_shortlist ได้', /grant execute on function public\.public_shortlist\(text\) to anon/.test(sh))
// Postgres แจก execute ให้ role "public" อัตโนมัติกับฟังก์ชันใหม่ทุกตัว →
// revoke จาก anon เพียงตัวเดียวไม่มีผล ต้องตัด public ด้วย (สไตล์เดียวกับไฟล์อื่นในโปรเจกต์)
ok('anon สร้างลิงก์เองไม่ได้ (ตัดทั้ง public และ anon)',
  /revoke all on function public\.share_shortlist\(uuid, integer, boolean\) from public, anon/.test(sh))
ok('anon ยกเลิกลิงก์คนอื่นไม่ได้ (ตัดทั้ง public และ anon)',
  /revoke all on function public\.unshare_shortlist\(uuid\) from public, anon/.test(sh))
ok('revoke จาก public แล้ว grant คืนให้ authenticated',
  /grant execute on function public\.share_shortlist\(uuid, integer, boolean\) to authenticated/.test(sh)
  && /grant execute on function public\.unshare_shortlist\(uuid\) to authenticated/.test(sh))
ok('SQL ตรวจเองว่า anon เรียก share_shortlist ไม่ได้',
  /has_function_privilege\('anon', 'public\.share_shortlist/.test(sh))
ok('SQL ตรวจเองว่า authenticated ยังเรียกได้ (กัน revoke แล้วลืม grant)',
  /has_function_privilege\('authenticated', 'public\.share_shortlist/.test(sh))

// ── 11) ฝั่งแอป: หน้าสาธารณะต้องเปิดได้โดยไม่ล็อกอิน ─────────────
ok('เส้นทาง /share/ อยู่เหนือด่านล็อกอิน',
  app.indexOf("startsWith('/share/')") > 0 && app.indexOf("startsWith('/share/')") < app.indexOf('if (!session)'))
ok('ด่าน loading ก็ไม่ขวางหน้าสาธารณะ',
  app.indexOf("startsWith('/share/')") < app.indexOf('if (loading)'))
ok('หน้าสาธารณะเรียก RPC public_shortlist', /rpc\('public_shortlist'/.test(sharePage))
ok('หน้าสาธารณะไม่ได้ query ตาราง properties ตรงๆ', !/from\('properties/.test(sharePage))
ok('หน้าสาธารณะไม่ได้ query ตาราง shortlists ตรงๆ', !/from\('shortlists'\)/.test(sharePage))
ok('ลิงก์หมดอายุ บอกลูกค้าตรงๆ ไม่ใช่หน้าเปล่า', sharePage.includes('ลิงก์นี้หมดอายุแล้ว'))
ok('ลูกค้าพิมพ์เอกสารเองได้', /printPage\(\)/.test(sharePage))

ok('ลิงก์เป็นรูป /#/share/<token> (HashRouter)', /#\/share\/\$\{token\}/.test(lib))
ok('คัดลอกลิงก์ล้มเหลวยังมีทางสำรองให้ผู้ใช้', /window\.prompt\(/.test(page))
// แถบลิงก์ต้องไม่ใช่ <input> — สไตล์ input ในโปรเจกต์ผูกกับ .form-field เท่านั้น
// อยู่นอก .form-field แล้วจะได้ input เปลือยของเบราว์เซอร์ (หน้าตาไม่เข้ากับที่อื่น)
ok('แถบลิงก์เป็นปุ่มคัดลอก ไม่ใช่ช่องกรอก', /className=\{`share-link/.test(page) && !/readOnly value=\{shareUrl/.test(page))
ok('แถบลิงก์มีสไตล์ของตัวเอง', /\.share-link \{/.test(css) && /\.share-link-url \{/.test(css))
ok('ลิงก์ยาวตัดท้ายด้วย … (ไม่ดันหน้าให้เลื่อนซ้าย-ขวา)',
  /\.share-link-url \{[\s\S]{0,200}text-overflow: ellipsis/.test(css))
ok('กดคัดลอกแล้วเปลี่ยนสีบอกว่าสำเร็จ', /\.share-link\.copied \{/.test(css))
ok('ปุ่มสร้างลิงก์ซ่อนจากบทบาทดูได้อย่างเดียว', /!perm\.readOnly && \(curId \|\| picked\.length >= 2\)/.test(page))
ok('ต้องบันทึกชุดก่อนจึงสร้างลิงก์ได้', /disabled=\{sharing \|\| dirty\}/.test(page))
ok('บอกลูกค้าเปิดดูกี่ครั้ง', /share_views/.test(page))
ok('ยกเลิกลิงก์ต้องยืนยันก่อน', /confirm\('ยกเลิกลิงก์นี้/.test(page))

// ── 12) เอกสารเดียวกันทั้งพิมพ์และแชร์ (กันข้อมูลเกินหลุด) ────────
ok('เอกสารเปรียบเทียบแยกเป็นคอมโพเนนต์กลาง', /export default function CompareSheet/.test(sheet))
ok('หน้า /compare ใช้คอมโพเนนต์เดียวกัน', /<CompareSheet /.test(page))
ok('หน้าลิงก์แชร์ใช้คอมโพเนนต์เดียวกัน', /<CompareSheet/.test(sharePage))
for (const bad of ['lessor_name', 'lessor_company', 'p.phone', 'house_no', 'p.lat', 'p.lng', 'map_url']) {
  ok(`ตารางเปรียบเทียบไม่มีแถว "${bad}" (เอกสารนี้ถูกแชร์ออกนอกองค์กร)`, !sheet.includes(bad))
}

// ── 13) ตรึงราคาไว้ตามวันที่เสนอ ─────────────────────────────────
for (const col of ['snapshot', 'snapshot_at']) {
  ok(`เพิ่มคอลัมน์ ${col} แบบ if not exists`, new RegExp(`add column if not exists ${col}\\b`).test(sh))
}
ok('whitelist ฟิลด์อยู่ที่เดียว (shortlist_items)', wl.includes("'rent_per_month'") && wl.includes("'province'"))
ok('public_shortlist ไม่มี whitelist ซ้ำอีกชุด (กัน 2 ที่หลุดจากกัน)', !pub.includes("'rent_per_month'"))
for (const bad of ['lessor', 'phone', 'house_no', 'p.lat', 'p.lng', 'map_url', 'p.notes', 'p.pic', 'created_by']) {
  ok(`whitelist ไม่มี "${bad}"`, !wl.includes(bad))
}
ok('anon เรียก shortlist_items ตรงๆ ไม่ได้ (ต้องมี token)',
  /revoke all on function public\.shortlist_items\(uuid, text\[\]\) from public, anon, authenticated/.test(sh))
ok('SQL ตรวจเองว่า anon เรียก shortlist_items ไม่ได้',
  /has_function_privilege\('anon', 'public\.shortlist_items/.test(sh))

ok('ลูกค้าเห็นสำเนาที่ตรึงไว้ก่อนราคาปัจจุบัน', /coalesce\(v_row\.snapshot, public\.shortlist_items\(/.test(pub))
ok('ลิงก์เก่าที่ยังไม่มีสำเนา ยังเปิดได้ (fallback ข้อมูลปัจจุบัน)',
  pub.includes('public.shortlist_items(v_row.org_id, v_row.codes)'))
ok('ส่งวันที่เสนอไปให้หน้าเอกสาร', /'offered_at', coalesce\(v_row\.snapshot_at, v_row\.shared_at\)/.test(pub))
ok('SQL ตรวจเองว่าไม่ได้ส่งราคาปัจจุบันแทนราคาที่เสนอ',
  /v_src not like '%coalesce\(v_row\.snapshot%'/.test(sh))

ok('ถ่ายสำเนาตอนสร้างลิงก์ครั้งแรก', /if v_snap is null or p_refresh then[\s\S]{0,140}shortlist_items\(v_org, v_codes\)/.test(mk))
ok('ต่ออายุลิงก์ไม่แตะราคาที่เสนอไว้',
  /snapshot = coalesce\(v_snap, snapshot\)/.test(mk) && /snapshot_at = coalesce\(v_snap_at, snapshot_at\)/.test(mk))
ok('อัปเดตราคาต้องสั่งชัดเจนด้วย p_refresh', /p_refresh boolean default false/.test(sh))
ok('drop ลายเซ็นเดิมก่อนเพิ่มพารามิเตอร์ (กัน overload → PGRST203)',
  /drop function if exists public\.share_shortlist\(uuid, integer\);/.test(sh))
ok('grant/revoke ใช้ลายเซ็นใหม่ (uuid, integer, boolean)',
  /revoke all on function public\.share_shortlist\(uuid, integer, boolean\) from public, anon/.test(sh)
  && /grant execute on function public\.share_shortlist\(uuid, integer, boolean\) to authenticated/.test(sh))

ok('ฝั่งแอปส่ง p_refresh ไปด้วย', /p_refresh: refresh/.test(lib))
ok('ปุ่มต่ออายุบอกชัดว่าราคาไม่เปลี่ยน', page.includes('ต่ออายุลิงก์ (ราคาเดิม)'))
ok('อัปเดตราคาต้องยืนยันก่อน (ลูกค้าจะเห็นราคาใหม่)', /confirm\(\s*\n?\s*'อัปเดตราคาในลิงก์/.test(page))
ok('ต่ออายุ/อัปเดตราคา ไม่คัดลอกลิงก์ทับ (ลิงก์เดิมไม่เปลี่ยน)',
  /if \(!cur\?\.share_token\) await copyShare/.test(page))
ok('บอกนายหน้าว่าราคาตรึงไว้วันไหน', page.includes('ราคาในลิงก์ตรึงไว้ ณ วันที่เสนอ'))
ok('เตือนเมื่อราคาปัจจุบันไม่ตรงกับที่เสนอ', /drift\.length > 0/.test(page))
ok('หน้าลูกค้าใช้วันที่เสนอเป็นวันที่เอกสาร', /dateText=\{offered\}/.test(sharePage))
ok('หน้าลูกค้าบอกว่าข้อมูล ณ วันไหน', /asOfNote=/.test(sharePage) && sharePage.includes('ข้อมูล ณ วันที่'))

// ตรรกะ priceDrift — ทดสอบด้วยค่าจริง (คัดลอกกติกาเดียวกับ src/lib/share.ts)
const PRICE_FIELDS = ['rent_per_month', 'sale_price', 'price_per_sqm']
const drift = (snapshot, live) => {
  if (!snapshot?.length) return []
  const byCode = new Map(live.map((p) => [p.code, p]))
  return snapshot
    .filter((s) => {
      const now = byCode.get(s.code)
      if (!now) return false
      return PRICE_FIELDS.some((f) => (s[f] ?? null) !== (now[f] ?? null))
    })
    .map((s) => s.code)
}
const eqArr = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

eqArr('ราคาเท่าเดิม = ไม่เตือน',
  drift([{ code: 'A', rent_per_month: 1000 }], [{ code: 'A', rent_per_month: 1000 }]), [])
eqArr('เจ้าของขึ้นค่าเช่า = เตือนรหัสนั้น',
  drift([{ code: 'A', rent_per_month: 1000 }], [{ code: 'A', rent_per_month: 1200 }]), ['A'])
eqArr('ราคาขายเปลี่ยน = เตือน',
  drift([{ code: 'B', sale_price: 5_000_000 }], [{ code: 'B', sale_price: 5_500_000 }]), ['B'])
eqArr('เตือนเฉพาะตัวที่เปลี่ยน',
  drift(
    [{ code: 'A', rent_per_month: 1000 }, { code: 'B', rent_per_month: 2000 }],
    [{ code: 'A', rent_per_month: 1000 }, { code: 'B', rent_per_month: 2500 }],
  ), ['B'])
eqArr('ทรัพย์ที่ถูกลบ/ยังโหลดไม่เสร็จ ไม่นับว่าเปลี่ยน (กันเตือนผิด)',
  drift([{ code: 'A', rent_per_month: 1000 }], []), [])
eqArr('ยังไม่มีสำเนา (ลิงก์เก่า) = ไม่เตือน', drift(null, [{ code: 'A', rent_per_month: 9 }]), [])
eqArr('เคยไม่มีราคา แล้วมาใส่ราคา = เตือน',
  drift([{ code: 'A', sale_price: null }], [{ code: 'A', sale_price: 100 }]), ['A'])
eqArr('null กับ undefined ถือว่าเท่ากัน (ไม่เตือนผิด)',
  drift([{ code: 'A', sale_price: null }], [{ code: 'A' }]), [])
eqArr('ฟิลด์ที่ไม่ใช่ราคาเปลี่ยน ไม่เตือน (เตือนเฉพาะข้อเสนอ)',
  drift([{ code: 'A', rent_per_month: 1000, nearby: 'BTS' }], [{ code: 'A', rent_per_month: 1000, nearby: 'MRT' }]), [])

// ── 14) super admin ตั้งอายุลิงก์ได้ ─────────────────────────────
ok('หน้า Super Admin มีการ์ดตั้งค่าลิงก์แชร์', superPage.includes('ลิงก์แชร์ชอร์ตลิสต์ให้ลูกค้า'))
ok('super admin บันทึกลง app_settings key share', /key: 'share'/.test(superPage))
ok('ตรวจค่าเพดาน 0–365 ก่อนบันทึก', /maxDays < 0 \|\| maxDays > 365/.test(superPage))
ok('กันตั้งค่าเริ่มต้นเกินเพดาน', /maxDays > 0 && days > maxDays/.test(superPage))

console.log(`\nชอร์ตลิสต์เสนอลูกค้า: ผ่าน ${pass} · ไม่ผ่าน ${fails.length}`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ บันทึกชอร์ตลิสต์ได้ · สิทธิ์ตรงกับกติกาทรัพย์ · เอกสารพิมพ์ไม่เพี้ยน')
