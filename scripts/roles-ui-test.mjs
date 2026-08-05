// ทดสอบหน้าจอตามบทบาท (การ์ดรายละเอียดทรัพย์ + หน้าจัดการทีม) ด้วย Playwright (Edge ในเครื่อง)
// ต้องเปิด dev server ไว้ก่อน: npm run dev
// รัน: node scripts/roles-ui-test.mjs        (--headed เพื่อดูเบราว์เซอร์)
//
// ผ่าน dev/form-harness.html จึงไม่ต้องล็อกอิน — บทบาทปลอมผ่าน ?role=
// การ์ดรายละเอียดจำลองธง contact_masked/location_masked แบบเดียวกับที่ properties_view ส่งมา
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173/dev/form-harness.html'
const SHOTS = 'scratch-shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })

const browser = await chromium.launch({ channel: 'msedge', headless: !process.argv.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const openDetail = (q) => page.goto(`${BASE}?page=detail&pro=1&${q}`, { waitUntil: 'networkidle' })
const text = () => page.locator('body').innerText()
const btn = (name) => page.getByRole('button', { name, exact: true })
/** จำนวนแถวข้อมูลที่มีป้ายนี้ + ข้อความในแถว (ถ้ามี) — ไม่เรียก innerText ตอนไม่มีแถว ไม่งั้นรอ timeout 30 วิ */
async function rowInfo(label) {
  const rows = page.locator('.field').filter({ hasText: label })
  const count = await rows.count()
  return { count, text: count > 0 ? await rows.first().innerText() : '' }
}

// [บทบาท, เห็นเบอร์เจ้าของ, เห็นบ้านเลขที่, เห็นพิกัด, ปุ่มแก้ไข, ปุ่มลบ]  ← ทรัพย์ของ "คนอื่น"
const CASES = [
  ['owner', true, true, true, true, true],
  ['manager', true, true, true, true, false],   // ทรัพย์ปลอมลงโดย someone-else ที่เป็น Owner → ลบไม่ได้
  ['associate', false, false, true, false, false],
  ['analyst', false, false, false, false, false],
  ['survey', false, false, false, false, false], // ไม่ได้กำหนดเขต = ไม่เห็นพิกัด
  ['temporary', false, false, false, false, false],
  ['social', false, false, false, false, false],
  ['trainee', true, false, true, false, false],  // ของคนอื่น trainee ไม่เห็นแถวอยู่แล้ว
]
for (const [role, seeContact, seeHouseNo, seeLoc, canEdit, canDel] of CASES) {
  await openDetail(`role=${role}`)
  await page.waitForTimeout(250)
  const t = await text()
  check(`${role}: ${seeContact ? 'เห็น' : 'ไม่เห็น'}เบอร์เจ้าของทรัพย์`, t.includes('0812345678') === seeContact,
    t.includes('0812345678') ? 'เห็นเบอร์' : 'ไม่เห็นเบอร์')
  check(`${role}: ${seeLoc ? 'เห็น' : 'ไม่เห็น'}พิกัด`, t.includes('13.599, 100.618') === seeLoc)
  check(`${role}: ${seeHouseNo ? 'เห็น' : 'ไม่เห็น'}บ้านเลขที่`, t.includes('88/123') === seeHouseNo)
  if (!seeHouseNo) {
    // แถวบ้านเลขที่ต้องหายไป ไม่ใช่ขึ้น "ไม่ได้ระบุ" (จะอ่านผิดว่าไม่ได้กรอก)
    const houseRow = await rowInfo('บ้านเลขที่')
    check(`${role}: แถวบ้านเลขที่ถูกซ่อน ไม่ขึ้น "ไม่ได้ระบุ"`, houseRow.count === 0, houseRow.text)
  }
  if (!seeContact) {
    check(`${role}: บอกว่าปิดตามสิทธิ์ (ไม่ใช่ไม่มีข้อมูล)`, t.includes('ปิดตามสิทธิ์'))
    check(`${role}: ให้ติดต่อคนลงข้อมูลแทน`, t.includes('0899999999'))
    // ห้ามขึ้น "ไม่ได้ระบุ" ในแถวที่ถูกปิด — ไม่งั้นอ่านผิดเป็น "เจ้าของไม่ได้กรอกข้อมูล"
    const nameRow = await rowInfo('ชื่อผู้ติดต่อ')
    check(`${role}: แถวชื่อผู้ติดต่อถูกซ่อน ไม่ขึ้น "ไม่ได้ระบุ"`, nameRow.count === 0, nameRow.text)
    const phoneRow = await rowInfo('เบอร์โทรติดต่อ')
    check(`${role}: แถวเบอร์โทรติดต่อถูกซ่อน ไม่ขึ้น "ไม่ได้ระบุ"`, phoneRow.count === 0, phoneRow.text)
  }
  check(`${role}: ปุ่มแก้ไข ${canEdit ? 'โชว์' : 'ไม่โชว์'}`, (await btn('แก้ไข').count()) === (canEdit ? 1 : 0))
  check(`${role}: ปุ่มลบ ${canDel ? 'โชว์' : 'ไม่โชว์'}`, (await btn('ลบ').count()) === (canDel ? 1 : 0))
}

// ทรัพย์ที่ตัวเองลง — ทุกบทบาท (ยกเว้น social) ต้องเห็นครบและแก้/ลบได้
for (const role of ['associate', 'analyst', 'temporary', 'trainee']) {
  await openDetail(`role=${role}&mine=1`)
  await page.waitForTimeout(250)
  const t = await text()
  check(`${role}: ทรัพย์ของตัวเองเห็นเบอร์เจ้าของ`, t.includes('0812345678'))
  check(`${role}: ทรัพย์ของตัวเองเห็นพิกัด`, t.includes('13.599, 100.618'))
  check(`${role}: ทรัพย์ของตัวเองเห็นบ้านเลขที่`, t.includes('88/123'))
  check(`${role}: ทรัพย์ของตัวเองแก้ได้`, (await btn('แก้ไข').count()) === 1)
  check(`${role}: ทรัพย์ของตัวเองลบได้`, (await btn('ลบ').count()) === 1)
}
await openDetail('role=social&mine=1')
await page.waitForTimeout(250)
check('social: ทรัพย์ของตัวเองก็แก้/ลบไม่ได้ (ดูล้วน)',
  (await btn('แก้ไข').count()) === 0 && (await btn('ลบ').count()) === 0)
check('social: แผงนัดติดตามเป็นแบบดูล้วน (ไม่มีปุ่มปิดงาน/เพิ่มนัด)',
  (await btn('เพิ่มนัด').count()) === 0 && (await btn('ปิดงาน · ขายแล้ว').count()) === 0
  && (await text()).includes('ดูได้เท่านั้น'))
// บทบาทที่แก้ทรัพย์ของคนอื่นไม่ได้ ก็ต้องปิดงาน/ตั้งนัดของคนอื่นไม่ได้
await openDetail('role=analyst')
await page.waitForTimeout(250)
check('analyst: นัดติดตามของทรัพย์คนอื่น = ดูล้วน',
  (await btn('เพิ่มนัด').count()) === 0 && (await btn('ปิดงาน · มีคนเช่าแล้ว').count()) === 0)
await openDetail('role=analyst&mine=1')
await page.waitForTimeout(250)
check('analyst: นัดติดตามของทรัพย์ตัวเอง = ทำได้', (await btn('เพิ่มนัด').count()) === 1)
const shotAnalyst = `${SHOTS}/20-detail-analyst.png`
await openDetail('role=analyst')
await page.waitForTimeout(250)
await page.screenshot({ path: shotAnalyst, fullPage: true })

// ── หน้าจัดการทีม: dropdown บทบาท 8 ตัว + ช่องเลือกบทบาทตอนเชิญ ──
await page.goto(`${BASE}?page=team&pro=1&role=owner&plan=pro&tier=500`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const t2 = await text()
check('หน้าทีม: มีช่องเลือกบทบาทตอนเชิญ', t2.includes('บทบาท'))
const inviteSelect = page.locator('select.org-switch').first()
check('เลือกบทบาทได้ 8 ตัว', (await inviteSelect.locator('option').count()) === 8,
  String(await inviteSelect.locator('option').count()))
check('ค่าเริ่มต้นคำเชิญ = Manager', (await inviteSelect.inputValue()) === 'manager')
await inviteSelect.selectOption('analyst')
await page.waitForTimeout(200)
{
  const t3 = await text()
  check('เลือก Analyst → โชว์คำอธิบายบทบาท',
    t3.includes('Analyst') && t3.includes('ไม่เห็นข้อมูลติดต่อเจ้าของ') && t3.includes('บ้านเลขที่'))
}
const shotTeam = `${SHOTS}/21-team-roles.png`
await page.screenshot({ path: shotTeam, fullPage: true })

// ── หน้าอัปเกรดแพ็กเกจ = Owner เท่านั้น ──
await page.goto(`${BASE}?page=upgrade&pro=1&role=owner&plan=pro&tier=100`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
check('owner: เข้าหน้าอัปเกรดได้', (await page.locator('#seats').count()) === 1)
for (const role of ['manager', 'associate', 'trainee', 'social']) {
  await page.goto(`${BASE}?page=upgrade&pro=1&role=${role}&plan=pro&tier=100`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  check(`${role}: เข้าหน้าอัปเกรดไม่ได้`, (await text()).includes('เฉพาะเจ้าขององค์กร'))
}

await browser.close()

const fails = results.filter((r) => !r.ok)
console.log(`\nภาพหน้าจอ: ${shotAnalyst}, ${shotTeam}`)
if (pageErrors.length) {
  console.log(`\n⚠️  error ในหน้าเว็บ ${pageErrors.length} รายการ:`)
  for (const e of pageErrors.slice(0, 8)) console.log(`   - ${e}`)
}
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${results.length - fails.length}/${results.length}):`)
  for (const f of fails) console.error(`   - ${f.name}${f.extra ? ` [${f.extra}]` : ''}`)
  process.exit(1)
}
console.log(`\n✅ หน้าจอตามบทบาท: ผ่านทั้ง ${results.length} ข้อ`)
