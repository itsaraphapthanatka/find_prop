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

// ── 7) พิมพ์เอกสาร: การ์ดรายการที่บันทึกไว้ต้องไม่ติดไปในกระดาษ ────
ok('print ซ่อนการ์ดชอร์ตลิสต์ที่บันทึกไว้', /@media print[\s\S]{0,400}\.compare-saved/.test(css))

console.log(`\nชอร์ตลิสต์เสนอลูกค้า: ผ่าน ${pass} · ไม่ผ่าน ${fails.length}`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ บันทึกชอร์ตลิสต์ได้ · สิทธิ์ตรงกับกติกาทรัพย์ · เอกสารพิมพ์ไม่เพี้ยน')
