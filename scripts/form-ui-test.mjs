// ทดสอบ UI ฟอร์มลงทรัพย์ 5 สเต็ป + ร่างอัตโนมัติ ด้วย Playwright (ใช้ Edge ที่มีในเครื่อง)
// ต้องเปิด dev server ไว้ก่อน: npm run dev
// รัน: node scripts/form-ui-test.mjs        (ใส่ --headed เพื่อดูเบราว์เซอร์กดเอง)
//
// ทดสอบผ่านหน้า dev/form-harness.html จึงไม่ต้องล็อกอิน (ทดสอบ UI/ตรรกะฟอร์ม ไม่แตะ DB)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173/dev/form-harness.html'
const SHOTS = 'scratch-shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const dialogs = []
let shotNo = 0
function check(name, cond, extra = '') {
  results.push({ name, ok: Boolean(cond), extra })
}
async function shot(page, name) {
  shotNo++
  const file = `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: !process.argv.includes('--headed'),
})
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`) })
page.on('requestfailed', (r) => pageErrors.push(`โหลดไม่ได้: ${r.url()}`))
page.on('response', (r) => { if (r.status() === 404) pageErrors.push(`404: ${r.url()}`) })
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept() })

// ── helper ──
const field = (label) => page.locator('.form-field', { hasText: label })
// ช่อง ใช่/ไม่ — แยกจาก chip ของ "คุณสมบัติ" ที่มีข้อความซ้ำกัน (เช่น ใกล้ถนนหลัก, อาคารเดี่ยว)
const boolField = (label) => page.locator('.form-field:has(.btn-group)', { hasText: label })
const fillField = async (label, value) => field(label).locator('input').first().fill(value)
const fieldValue = (label) => field(label).locator('input').first().inputValue()
const btn = (name) => page.getByRole('button', { name, exact: true })
/** เลือกตัวเลือกปุ่ม — ถ้าเลือกอยู่แล้วไม่ต้องกดซ้ำ (กดซ้ำที่ค่าเดิม = ล้างค่า) */
async function selectOpt(name) {
  const b = btn(name)
  const on = (await b.getAttribute('class'))?.includes('on')
  if (!on) await b.click()
}
const seen = async (text) => (await page.getByText(text, { exact: false }).count()) > 0
const activeStep = () => page.locator('.wiz-step.on .wiz-name').innerText()
async function pickCombo(label, value) {
  const input = field(label).locator('input').first()
  await input.click()
  await page.locator('.combo-menu .combo-item').first().waitFor({ timeout: 5000 })
  await input.fill(value)
  await input.press('Enter')
}
const lastDialog = () => dialogs[dialogs.length - 1] ?? ''

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

// ══ STEP 1 ══
check('มีแถบสเต็ป 5 ขั้น', (await page.locator('.wiz-step').count()) === 5)
check('เริ่มที่ขั้น 1 ประเภททรัพย์', (await activeStep()) === 'ประเภททรัพย์')

// กด "ถัดไป" ทั้งที่ยังไม่กรอก → ต้องเตือนและอยู่ขั้นเดิม
await btn('ถัดไป →').click()
await page.waitForTimeout(300)
check('ยังไม่กรอกแล้วกดถัดไป → เตือนฟิลด์บังคับ', lastDialog().includes('กรอกให้ครบก่อน'), lastDialog())
check('ยังไม่กรอก → ไม่เปลี่ยนขั้น', (await activeStep()) === 'ประเภททรัพย์')

check('ยังไม่เลือกหมวด → ยังไม่มีปุ่มประเภท', (await btn('โกดัง').count()) === 0)
await btn('เชิงอุตสาหกรรม').click()
check('เลือกหมวดอุตสาหกรรม → มีโกดัง/โรงงาน', (await btn('โกดัง').count()) === 1 && (await btn('โรงงาน').count()) === 1)
check('หมวดอุตสาหกรรม → ไม่มีปุ่มบ้าน/คอนโด', (await btn('บ้าน').count()) === 0 && (await btn('คอนโด').count()) === 0)
await btn('โกดัง').click()
await btn('เช่า').click()
await btn('ปิด').click()
await btn('เจ้าของ').click()
check('ยังไม่เลือกนิติบุคคล → ไม่มีช่องชื่อบริษัท', (await field('ชื่อบริษัท/นิติบุคคล').count()) === 0)
await btn('นิติบุคคล').click()
check('เลือกนิติบุคคล → โชว์ช่องชื่อบริษัท', (await field('ชื่อบริษัท/นิติบุคคล').count()) === 1)
await fillField('ชื่อผู้ติดต่อ', 'คุณทดสอบ')
await fillField('เบอร์โทรติดต่อ', '0812345678')
await fillField('รหัสทรัพย์', 'UI-TEST-01')
const shot1 = await shot(page, 'step1-type')

// ══ STEP 2 ══
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('ผ่านไปขั้น 2 ที่ตั้ง', (await activeStep()) === 'ที่ตั้ง')
await btn('ถัดไป →').click()
await page.waitForTimeout(300)
check('ขั้น 2 ไม่กรอกทำเล → เตือน', lastDialog().includes('จังหวัด'), lastDialog())
await pickCombo('จังหวัด', 'สมุทรปราการ')
await pickCombo('เขต/อำเภอ', 'บางพลี')
await pickCombo('แขวง/ตำบล', 'บางพลีใหญ่')
check('โซนอุตสาหกรรมโชว์ (Free Zone)', await seen('ปลอดอากร (Free Zone)'))
check('มีแผนที่ปักหมุด', (await page.locator('.pick-map').count()) === 1)
check('มีสถานที่สำคัญใกล้เคียงให้กด', await seen('＋ โรงพยาบาล'))
await page.getByRole('button', { name: '＋ โรงพยาบาล' }).click()
await field('สถานที่สำคัญใกล้เคียง').locator('input[type=number]').first().fill('2.5')
const shot2 = await shot(page, 'step2-location')

// ══ STEP 3 (โกดัง) ══
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('ผ่านไปขั้น 3 รายละเอียด', (await activeStep()) === 'รายละเอียด')
check('โกดัง: มีที่ดิน ไร่/งาน/ตร.วา', (await field('ที่ดิน (ไร่)').count()) === 1 && (await field('ที่ดิน (ตร.วา)').count()) === 1)
check('โกดัง: มีพื้นอาคารยกสูง (ซม.)', (await field('พื้นอาคารยกสูง (ซม.)').count()) === 1)
check('โกดัง: มีคำถามใช่/ไม่ ครบ 4 ข้อ',
  (await boolField('มีเครน').count()) === 1 && (await boolField('ใกล้ถนนหลัก').count()) === 1 &&
  (await boolField('อาคารเดี่ยว').count()) === 1 && (await boolField('รถตู้คอนเทนเนอร์เข้าได้').count()) === 1)
check('โกดัง: ไม่มีบ่อบำบัดน้ำเสีย (เฉพาะโรงงาน)', (await field('บ่อบำบัดน้ำเสีย').count()) === 0)
check('โกดัง: ไม่มีจำนวนน้ำต่อวัน (เฉพาะโรงงาน)', (await field('ปริมาณน้ำใช้ได้ต่อวัน').count()) === 0)
check('มีค่าสาธารณูปโภคแบบ ราคา+ชำระกับใคร',
  (await field('ค่าน้ำ (บาท/หน่วย)').count()) === 1 && (await field('ค่าน้ำ ชำระกับ').count()) === 1 &&
  (await field('ค่าไฟ ชำระกับ').count()) === 1 && (await field('ค่าส่วนกลาง ชำระกับ').count()) === 1)
check('ไม่มีช่องขนาดที่ดินแบบข้อความเดิม (ทรัพย์ใหม่)', (await field('ขนาดที่ดินรวม (ข้อความเดิม)').count()) === 0)
await field('มีเครน').getByRole('button', { name: 'ใช่' }).click()
await fillField('พื้นอาคารยกสูง (ซม.)', '120')
const shot3 = await shot(page, 'step3-warehouse')

// ══ STEP 4 (เช่า → ต้องไม่มีฝั่งขาย) ══
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('ผ่านไปขั้น 4 ราคา', (await activeStep()) === 'ราคา')
check('เช่า: มีค่าเช่า/เดือน', (await field('ค่าเช่า/เดือน (บาท)').count()) === 1)
check('เช่า: ไม่มีราคาขาย', (await field('ราคาขาย (บาท)').count()) === 0)
check('ไม่ใช่ที่อยู่อาศัย: มี VAT + ภาษี 2 ตัว',
  (await field('VAT').count()) === 1 && (await field('ภาษีที่ดินและสิ่งปลูกสร้าง').count()) === 1 &&
  (await field('ภาษีหัก ณ ที่จ่าย').count()) === 1)
check('เช่า: มีเงื่อนไขการเช่า', await seen('เงื่อนไขการเช่า'))
check('เช่า: ไม่มีเงื่อนไขการขาย/ค่าโอน', !(await seen('เงื่อนไขการขาย')))
await fillField('ค่าเช่า/เดือน (บาท)', '85000')
const shot4 = await shot(page, 'step4-price-rent')

// ══ STEP 5 ══
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('ผ่านไปขั้น 5 ลงภาพ', (await activeStep()) === 'ลงภาพ')
check('ขั้น 5 มีที่เพิ่มรูป', (await page.locator('.photo-add').count()) === 1)
check('ขั้น 5 มีช่องหมายเหตุ', (await page.locator('textarea').count()) >= 1)
check('ขั้น 5 มีปุ่มบันทึก', (await btn('บันทึก').count()) === 1)

// ══ ร่างอัตโนมัติ ══
await page.waitForTimeout(1200) // autosave หน่วง 800ms
const draftRaw = await page.evaluate(() => localStorage.getItem('find_prop.draft.property.v1'))
check('เขียนร่างลง localStorage แล้ว', Boolean(draftRaw))
check('ร่างจำสเต็ปที่ 5 (index 4)', draftRaw && JSON.parse(draftRaw).step === 4, draftRaw ? `step=${JSON.parse(draftRaw).step}` : '')
check('ร่างเก็บค่าที่กรอกไว้', draftRaw && JSON.parse(draftRaw).form.code === 'UI-TEST-01')
check('โชว์ป้ายเก็บร่างให้ผู้ใช้เห็น', await seen('เก็บร่างไว้ให้แล้ว'))

await page.reload({ waitUntil: 'networkidle' })
check('เปิดหน้าใหม่ → เจอแถบร่างค้าง', await seen('พบร่างที่กรอกค้างไว้'))
check('แถบร่างบอกขั้นที่ค้าง', await seen('ค้างที่ขั้น 5 ลงภาพ'))
check('ยังไม่กดเลือก → ฟอร์มยังว่าง (ไม่ยัดใส่เอง)', (await activeStep()) === 'ประเภททรัพย์')
const shot5 = await shot(page, 'draft-banner')

await btn('กรอกต่อจากร่าง').click()
await page.waitForTimeout(300)
check('กู้คืนร่าง → กลับไปขั้น 5', (await activeStep()) === 'ลงภาพ')
await page.locator('.wiz-step').first().click()
await page.waitForTimeout(300)
check('กู้คืนร่าง → ค่าที่กรอกกลับมาครบ', (await fieldValue('รหัสทรัพย์')) === 'UI-TEST-01')
check('กู้คืนร่าง → ประเภทที่เลือกไว้ยังอยู่', (await page.locator('.btn-group .opt.on', { hasText: 'โกดัง' }).count()) === 1)

await page.reload({ waitUntil: 'networkidle' })
await btn('เริ่มใหม่ (ทิ้งร่าง)').click()
await page.waitForTimeout(300)
check('ทิ้งร่าง → ลบออกจาก localStorage',
  (await page.evaluate(() => localStorage.getItem('find_prop.draft.property.v1'))) === null)
await page.reload({ waitUntil: 'networkidle' })
check('ทิ้งร่างแล้วเปิดใหม่ → ไม่มีแถบร่าง', !(await seen('พบร่างที่กรอกค้างไว้')))

// ══ สลับประเภทเป็นโรงงาน → ต้องมีฟิลด์เฉพาะโรงงาน ══
// (ทิ้งร่างไปแล้ว ฟอร์มว่างเปล่า จึงต้องกรอกฟิลด์บังคับใหม่ก่อนจะข้ามสเต็ปได้)
await btn('เชิงอุตสาหกรรม').click()
await btn('โรงงาน').click()
await btn('เช่า').click()
await fillField('ชื่อผู้ติดต่อ', 'ก')
await fillField('เบอร์โทรติดต่อ', '0800000000')
await fillField('รหัสทรัพย์', 'UI-TEST-02')
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
await pickCombo('จังหวัด', 'สมุทรปราการ')
await pickCombo('เขต/อำเภอ', 'บางพลี')
await pickCombo('แขวง/ตำบล', 'บางพลีใหญ่')
await page.locator('.wiz-step').nth(2).click()
await page.waitForTimeout(400)
check('โรงงาน: มีบ่อบำบัดน้ำเสีย', (await field('บ่อบำบัดน้ำเสีย').count()) === 1, await activeStep())
check('โรงงาน: มีจำนวนน้ำที่ใช้ได้ต่อวัน', (await field('ปริมาณน้ำใช้ได้ต่อวัน').count()) === 1)

// ══ สลับเป็นบ้าน (ที่อยู่อาศัย) ══
await page.locator('.wiz-step').first().click()
await page.waitForTimeout(300)
await btn('ที่อยู่อาศัย').click()
check('เปลี่ยนหมวด → ล้างประเภทเดิม', (await page.locator('.btn-group .opt.on', { hasText: 'โรงงาน' }).count()) === 0)
await btn('บ้าน').click()
check('บ้าน: มีประเภทย่อยให้เลือก', (await btn('บ้านเดี่ยว').count()) === 1 && (await btn('ทาวน์เฮาส์/ทาวน์โฮม').count()) === 1)
await btn('บ้านเดี่ยว').click()
await btn('ขาย').click()
await page.locator('.wiz-step').nth(2).click()
await page.waitForTimeout(400)
check('บ้าน: มีหันหน้าทิศ', (await field('บ้านหันหน้าทิศ').count()) === 1)
check('บ้าน: มีห้องนอน/ห้องน้ำ/ห้องแม่บ้าน',
  (await field('จำนวนห้องนอน').count()) === 1 && (await field('จำนวนห้องน้ำ').count()) === 1 && (await field('ห้องแม่บ้าน').count()) === 1)
check('บ้าน: ไม่มีสเปกโกดัง (พื้นยกสูง/เครน)',
  (await field('พื้นอาคารยกสูง (ซม.)').count()) === 0 && (await boolField('มีเครน').count()) === 0)
check('บ้าน: แนะนำเรื่องโฉนดแบบไม่บังคับ', await seen('ควรมีสำเนาโฉนดหน้า-หลัง (ไม่บังคับ'))
const shot6 = await shot(page, 'step3-house')

// เอกสารสิทธิ์ไม่บังคับ — ยังไม่แนบก็ต้องไปขั้นถัดไปได้ ไม่มี popup ขวาง
const dialogsBeforeDocs = dialogs.length
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('บ้านใหม่ยังไม่แนบโฉนด → ไม่มี popup ขวาง', dialogs.length === dialogsBeforeDocs, lastDialog())
check('บ้านใหม่ยังไม่แนบโฉนด → ไปขั้น 4 ได้', (await activeStep()) === 'ราคา', await activeStep())

// ══ ขั้น 4 ฝั่ง "ขาย" (ใช้โรงงาน) ══
await page.locator('.wiz-step').first().click()
await page.waitForTimeout(300)
await selectOpt('เชิงอุตสาหกรรม')
await selectOpt('โรงงาน')
await selectOpt('ขาย')
await page.locator('.wiz-step').nth(3).click()
await page.waitForTimeout(400)
check('ไปขั้น 4 ได้ (อุตสาหกรรมไม่บังคับโฉนด)', (await activeStep()) === 'ราคา', `${await activeStep()} · ${lastDialog()}`)
check('ขาย: มีราคาขาย', (await field('ราคาขาย (บาท)').count()) === 1)
check('ขาย: ไม่มีค่าเช่า/เดือน', (await field('ค่าเช่า/เดือน (บาท)').count()) === 0)
check('ขาย: มีค่าใช้จ่ายวันโอนกรรมสิทธิ์', (await field('ค่าใช้จ่ายวันโอนกรรมสิทธิ์').count()) === 1)
check('ขายเท่านั้น: ไม่มีเงื่อนไขการเช่า', !(await seen('เงื่อนไขการเช่า')))
check('ขายเท่านั้น: ไม่มี VAT (ภาษีใส่เฉพาะกรณีเช่า)', (await field('VAT').count()) === 0)
const shot7 = await shot(page, 'step4-price-sale')

// ══ ที่อยู่อาศัย + ขาย + มีโฉนดแนบแล้ว ══
// เซ็ตสถานะผ่าน "ร่าง" (แนบไฟล์จริงไม่ได้เพราะ harness ไม่ได้ล็อกอิน) — ได้ทดสอบการกู้คืนร่างซ้ำอีกทาง
await page.evaluate(() => {
  localStorage.setItem('find_prop.draft.property.v1', JSON.stringify({
    savedAt: new Date().toISOString(),
    step: 3,
    form: {
      code: 'UI-TEST-03', record_date: '2026-08-04',
      property_type: 'บ้าน', sub_type: 'บ้านเดี่ยว', listing_type: 'ขาย',
      lessor_name: 'คุณบ้าน', phone: '0899999999',
      province: 'สมุทรปราการ', district: 'บางพลี', subdistrict: 'บางพลีใหญ่',
      documents: [{ name: 'สำเนาโฉนดที่ดิน (ด้านหน้า)', url: 'https://example.com/deed.jpg' }],
    },
  }))
})
await page.reload({ waitUntil: 'networkidle' })
await btn('กรอกต่อจากร่าง').click()
await page.waitForTimeout(400)
check('กู้คืนร่างที่เซ็ตไว้ → ไปขั้น 4 ราคา', (await activeStep()) === 'ราคา', await activeStep())
check('บ้าน+ขาย: มีราคาขาย', (await field('ราคาขาย (บาท)').count()) === 1)
check('ที่อยู่อาศัย: ไม่มี VAT/ภาษีหัก ณ ที่จ่าย',
  (await field('VAT').count()) === 0 && (await field('ภาษีหัก ณ ที่จ่าย').count()) === 0)
check('ที่อยู่อาศัย: ไม่มีราคาต่อ ตร.ม.', (await field('ราคาต่อ ตร.ม. (บาท)').count()) === 0)
check('บ้าน+ขาย: มีค่าใช้จ่ายวันโอนกรรมสิทธิ์', (await field('ค่าใช้จ่ายวันโอนกรรมสิทธิ์').count()) === 1)
// แนบโฉนดแล้ว → ด่านเอกสารต้องปล่อยผ่าน
const dialogCountBefore = dialogs.length
await page.locator('.wiz-step').nth(2).click()
await page.waitForTimeout(300)
await btn('ถัดไป →').click()
await page.waitForTimeout(400)
check('บ้านที่แนบโฉนดแล้ว → ผ่านด่านเอกสารไปขั้น 4 ได้',
  dialogs.length === dialogCountBefore && (await activeStep()) === 'ราคา', lastDialog())
const shot8 = await shot(page, 'step4-house-sale')

await page.evaluate(() => localStorage.clear())
await browser.close()

// ── สรุป ──
const fails = results.filter((r) => !r.ok)
console.log(`\nภาพหน้าจอ: ${[shot1, shot2, shot3, shot4, shot5, shot6, shot7, shot8].join(', ')}`)
if (pageErrors.length) {
  console.log(`\n⚠️  error ในหน้าเว็บ ${pageErrors.length} รายการ:`)
  for (const e of pageErrors.slice(0, 10)) console.log(`   - ${e}`)
}
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${results.length - fails.length}/${results.length}):`)
  for (const f of fails) console.error(`   - ${f.name}${f.extra ? ` [${f.extra}]` : ''}`)
  process.exit(1)
}
console.log(`\n✅ ฟอร์ม 5 สเต็ป + ร่างอัตโนมัติ: ผ่านทั้ง ${results.length} ข้อ`)
