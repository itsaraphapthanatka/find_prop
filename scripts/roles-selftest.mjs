// ทดสอบตารางสิทธิ์ 8 บทบาท (src/lib/roles.ts) — รัน: npm run test:roles
// เทียบกับสเปกที่ผู้ใช้ให้มา (docs/roles-spec.md) ทีละบรรทัด + เช็คว่า SQL ใช้กติกาชุดเดียวกัน
import { build } from 'esbuild'
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'roles-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/roles.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
})
const { ROLES, ROLE_PERM, rolePerm, roleName, canEdit, canDelete } = await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

// ── ตารางสิทธิ์ตามสเปก ──
// [บทบาท, เห็นของคนอื่น, เฉพาะเขต, แก้ของคนอื่น, ลบของคนอื่น, ลบของ Owner, ดูล้วน, ปิดข้อมูลเจ้าของ, ปิดบ้านเลขที่, ปิดพิกัด, นำออก]
const SPEC = [
  ['owner',     true,  false, true,  true,  true,  false, false, false, false,  true],
  ['manager',   true,  false, true,  true,  false, false, false, false, false,  false],
  ['associate', true,  false, false, false, false, false, true,  true,  false,  false],
  ['analyst',   true,  false, false, false, false, false, true,  true,  true,   false],
  ['survey',    true,  false, false, false, false, false, true,  true,  'area', false],
  ['temporary', true,  true,  false, false, false, false, true,  true,  'area', false],
  ['social',    true,  false, false, false, false, true,  true,  true,  true,   false],
  ['trainee',   false, false, false, false, false, false, false, true,  false,  false],
]
eq('มีครบ 8 บทบาท', ROLES.length, 8)
for (const [role, seeOthers, areaScoped, editOthers, deleteOthers, deleteOwnerData, readOnly, maskContact, maskHouseNo, maskLocation, canExport] of SPEC) {
  const p = ROLE_PERM[role]
  eq(`${role}: เห็นทรัพย์ของคนอื่น`, p.seeOthers, seeOthers)
  eq(`${role}: จำกัดเฉพาะเขตที่กำหนด`, p.areaScoped, areaScoped)
  eq(`${role}: แก้ของคนอื่น`, p.editOthers, editOthers)
  eq(`${role}: ลบของคนอื่น`, p.deleteOthers, deleteOthers)
  eq(`${role}: ลบทรัพย์ที่ Owner ลง`, p.deleteOwnerData, deleteOwnerData)
  eq(`${role}: ดูได้อย่างเดียว`, p.readOnly, readOnly)
  eq(`${role}: ปิดข้อมูลติดต่อเจ้าของ`, p.maskContact, maskContact)
  eq(`${role}: ปิดบ้านเลขที่/เลขที่ห้อง`, p.maskHouseNo, maskHouseNo)
  eq(`${role}: ปิดพิกัด/แผนที่`, p.maskLocation, maskLocation)
  eq(`${role}: นำข้อมูลออก Excel/CSV`, p.canExport, canExport)
}
// ทุกบทบาทต้องนำข้อมูลออกไม่ได้ ยกเว้น Owner (ข้อที่ย้ำในสเปกทุกบรรทัด)
eq('นำออกได้เฉพาะ Owner', ROLES.filter((r) => ROLE_PERM[r].canExport), ['owner'])
// จัดการทีม/แพ็กเกจ = Owner เท่านั้น
eq('จัดการองค์กรได้เฉพาะ Owner', ROLES.filter((r) => ROLE_PERM[r].canManageOrg), ['owner'])
// ประวัติการใช้งาน = Owner + Manager
eq('ดูประวัติได้ Owner/Manager', ROLES.filter((r) => ROLE_PERM[r].canSeeLogs), ['owner', 'manager'])

// ── บทบาทแปลก/ยังไม่โหลด = ให้น้อยสุด ──
eq('บทบาทไม่รู้จัก → เท่า trainee', rolePerm('อะไรนะ'), ROLE_PERM.trainee)
eq('ยังไม่โหลดบทบาท (null) → เท่า trainee', rolePerm(null), ROLE_PERM.trainee)
eq('ชื่อบทบาทที่โชว์', roleName('social'), 'Social')

// ── แก้/ลบรายชิ้น ──
const ME = 'u-me'
const OTHER = 'u-other'
const OWNER = 'u-owner'
const ownerIds = new Set([OWNER])
const mine = { created_by: ME }
const theirs = { created_by: OTHER }
const ownersRow = { created_by: OWNER }

for (const r of ROLES) {
  const expect = r !== 'social'   // social ดูล้วน แม้ทรัพย์ของตัวเอง
  eq(`${r}: แก้ทรัพย์ของตัวเอง`, canEdit(mine, r, ME), expect)
  eq(`${r}: ลบทรัพย์ของตัวเอง`, canDelete(mine, r, ME, ownerIds), expect)
}
eq('trainee แก้ของคนอื่นไม่ได้', canEdit(theirs, 'trainee', ME), false)
eq('associate แก้ของคนอื่นไม่ได้', canEdit(theirs, 'associate', ME), false)
eq('analyst ลบของคนอื่นไม่ได้', canDelete(theirs, 'analyst', ME, ownerIds), false)
eq('manager แก้ของคนอื่นได้', canEdit(theirs, 'manager', ME), true)
eq('manager ลบของคนอื่นได้', canDelete(theirs, 'manager', ME, ownerIds), true)
eq('manager ลบทรัพย์ที่ Owner ลง ไม่ได้', canDelete(ownersRow, 'manager', ME, ownerIds), false)
eq('manager แก้ทรัพย์ที่ Owner ลง ได้ (สเปกห้ามแค่ลบ)', canEdit(ownersRow, 'manager', ME), true)
eq('owner ลบทรัพย์ที่ Owner อีกคนลง ได้', canDelete(ownersRow, 'owner', ME, ownerIds), true)
eq('social ลบของตัวเองไม่ได้', canDelete(mine, 'social', ME, ownerIds), false)
eq('ยังไม่รู้ว่าใครเป็น Owner → manager ลบไว้ก่อน (ฐานข้อมูลปฏิเสธเอง)',
  canDelete(ownersRow, 'manager', ME, undefined), true)

// ── ตัวเลข/กติกาต้องตรงกับ SQL ──
const sql = readFileSync('supabase/roles.sql', 'utf8')
for (const r of ROLES) {
  eq(`supabase/roles.sql รู้จักบทบาท ${r}`, sql.includes(`'${r}'`), true)
}
eq('SQL ปิดข้อมูลเจ้าของให้ 5 บทบาท',
  /hide_owner_contact[\s\S]*?'associate','analyst','survey','temporary','social'\);/.test(sql), true)
// บ้านเลขที่ปิดให้ 6 บทบาท (เพิ่ม trainee — ถึงจะไม่มีผลเพราะเห็นแต่ของตัวเองอยู่แล้ว)
eq('SQL ปิดบ้านเลขที่ให้ 6 บทบาท',
  /hide_house_no[\s\S]*?'associate','analyst','survey','temporary','social','trainee'/.test(sql), true)
eq('SQL ปิดบ้านเลขที่ใน view', /hide_house_no\(p\.created_by\) then null else p\.house_no end/.test(sql), true)
eq('SQL มีธง house_no_masked ให้ UI', /hide_house_no\(p\.created_by\) as house_no_masked/.test(sql), true)
eq('SQL ปิดพิกัดของ analyst/social', /'analyst','social'/.test(sql), true)
eq('SQL ให้ survey/temporary เห็นพิกัดเฉพาะในเขต',
  /'survey','temporary'[\s\S]*?in_my_area/.test(sql), true)
eq('SQL: trainee เห็นเฉพาะของตัวเอง', /when 'trainee'\s+then false/.test(sql), true)
eq('SQL: temporary ผูกกับเขต', /when 'temporary' then public\.in_my_area/.test(sql), true)
eq('SQL: manager ห้ามลบทรัพย์ของ owner', /m\.role = 'owner'/.test(sql), true)
eq('SQL: นำออกได้เฉพาะ owner', /can_export[\s\S]*?my_role\(\) = 'owner'/.test(sql), true)
eq('SQL: ถอนสิทธิ์อ่านตาราง properties', /revoke select on public\.properties from authenticated/.test(sql), true)
eq('SQL: คง select \\(id\\) ไว้ให้ update/delete ทำงาน',
  /grant select \(id, org_id, created_by\) on public\.properties/.test(sql), true)

// ── ทุกคอลัมน์ที่ properties_view อ้าง ต้องมีจริงในตาราง properties ──
// (เคยพลาด: view อ้าง p.created_by_name ซึ่งฝั่งแอปเติมเองผ่าน RPC ไม่ใช่คอลัมน์ในตาราง
//  → รัน SQL ไม่ผ่าน "column p.created_by_name does not exist")
const sqlFiles = readdirSync('supabase').filter((f) => f.endsWith('.sql'))
const tableCols = new Set()
{
  const schema = readFileSync('supabase/schema.sql', 'utf8')
  const m = schema.match(/create table[^(]*properties\s*\(([\s\S]*?)\n\);/i)
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.trim().match(/^([a-z_0-9]+)\s+[a-z]/i)
      if (mm && mm[1] !== 'constraint' && mm[1] !== 'primary' && mm[1] !== 'unique') tableCols.add(mm[1])
    }
  }
  for (const f of sqlFiles) {
    const t = readFileSync(`supabase/${f}`, 'utf8')
    for (const blk of t.matchAll(/alter table\s+(?:public\.)?properties([\s\S]*?);/gi)) {
      for (const mm of blk[1].matchAll(/add column(?:\s+if not exists)?\s+([a-z_0-9]+)/gi)) tableCols.add(mm[1])
    }
  }
}
eq('อ่านคอลัมน์ของตาราง properties จากไฟล์ SQL ได้ (>80 คอลัมน์)', tableCols.size > 80, true)
{
  const view = sql.split('create view public.properties_view as')[1].split('from public.properties p')[0]
  const used = [...new Set([...view.matchAll(/\bp\.([a-z_0-9]+)/g)].map((m) => m[1]))]
  const missing = used.filter((c) => !tableCols.has(c))
  eq(`ทุกคอลัมน์ใน view มีจริงในตาราง (อ้าง ${used.length} คอลัมน์)`, missing, [])
  // และต้องครอบคลุมทุกฟิลด์ที่ฝั่งแอปใช้ (Property ใน src/types.ts)
  const types = readFileSync('src/types.ts', 'utf8')
  const body = types.match(/export interface Property \{([\s\S]*?)\n\}/)[1]
  const appFields = [...body.matchAll(/^ {2}([a-z_0-9]+)\??:/gm)].map((m) => m[1])
  const viewAll = sql.split('create view public.properties_view as')[1].split('from public.properties p')[0]
  const notInView = appFields.filter((f) =>
    f !== 'org_name' && !new RegExp(`\\bp\\.${f}\\b`).test(viewAll) && !new RegExp(`as ${f}\\b`).test(viewAll))
  eq('view ส่งฟิลด์ที่แอปใช้มาครบ (ยกเว้น org_name ที่จับคู่ฝั่งแอป)', notInView, [])
}

// ── ฝั่งแอปต้องอ่านทรัพย์จาก view เท่านั้น ──
for (const f of ['src/hooks/useProperties.ts', 'src/pages/FormPage.tsx', 'src/pages/FollowUpPage.tsx']) {
  const src = readFileSync(f, 'utf8')
  eq(`${f} อ่านจาก properties_view`, /from\('properties_view'\)/.test(src), true)
  const readsTable = /from\('properties'\)\s*\n?\s*\.?select/.test(src.replace(/\s+/g, ' ').replace(/from\('properties'\) \./g, "from('properties')."))
  eq(`${f} ไม่อ่านตาราง properties ตรงๆ`, readsTable, false)
}

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ สิทธิ์ 8 บทบาท: ผ่านทั้ง ${pass} ข้อ`)
