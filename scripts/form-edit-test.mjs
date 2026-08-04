// ตรวจโหมดแก้ไขของฟอร์ม: แถบสเต็ปต้องขึ้น และเปิดจากรายการที่เลื่อนลงมาต้องเลื่อนขึ้นบนสุดให้เอง
// (เคสที่เจอจริง: กด "แก้ไข" จากรายการที่เลื่อนลงมา แล้วแถบสเต็ปอยู่เหนือจอเหมือนไม่มี)
// ต้องเปิด dev server ไว้ก่อน: npm run dev   ·   รัน: npm run test:edit
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('scratch-shots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: !process.argv.includes('--headed') })
const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })

// ── 1. โหมดแก้ไข: โครงฟอร์มต้องครบ ──
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('dialog', (d) => d.accept()) // "โหลดข้อมูลไม่สำเร็จ" = ปกติ (harness ไม่ได้ล็อกอิน)
  await page.goto('http://localhost:5173/dev/form-harness.html?edit=fake-id', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('โหมดแก้ไข: หัวข้อขึ้น "แก้ไข"', (await page.locator('.view-header h1').innerText()).includes('แก้ไข'))
  check('โหมดแก้ไข: มีแถบสเต็ป 5 ขั้น', (await page.locator('.wiz-step').count()) === 5)
  check('โหมดแก้ไข: มีปุ่มบันทึกตั้งแต่ขั้นแรก', (await page.getByRole('button', { name: 'บันทึก', exact: true }).count()) === 1)
  check('โหมดแก้ไข: ไม่มีแถบร่าง (ร่างใช้เฉพาะทรัพย์ใหม่)', (await page.getByText('พบร่างที่กรอกค้างไว้').count()) === 0)
  check('แพ็กเกจ Free: ไม่โชว์แผงนัดติดตาม', (await page.getByText('นัดติดตาม', { exact: false }).count()) === 0)
  await page.close()
}

// ── 2. แผงนัดติดตามในหน้าแก้ไข (ต้องเป็นแพ็กเกจ Pro) ──
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('dialog', (d) => d.accept())
  await page.goto('http://localhost:5173/dev/form-harness.html?edit=fake-id&pro=1', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  check('แก้ไข+Pro: มีหัวข้อ "นัดติดตาม" ในหน้าแก้ไข', (await page.getByText('นัดติดตาม', { exact: false }).count()) > 0)
  check('แก้ไข+Pro: มีปุ่มปิดงาน (เช่าแล้ว/ขายแล้ว)',
    (await page.getByRole('button', { name: /ปิดงาน/ }).count()) >= 2)
  check('แก้ไข+Pro: มีช่องเพิ่มนัด', (await page.getByRole('button', { name: 'เพิ่มนัด', exact: true }).count()) === 1)
  // ฟอร์มซ้อนฟอร์มไม่ได้ — แผงนัดต้องอยู่นอก <form> ของฟอร์มทรัพย์
  const nested = await page.evaluate(() =>
    document.querySelectorAll('form.form-wrap form').length)
  check('แผงนัดไม่ได้ซ้อนอยู่ใน form ของฟอร์มทรัพย์', nested === 0, `nested=${nested}`)
  await page.screenshot({ path: 'scratch-shots/10-edit-followups.png', fullPage: true })
  await page.close()
}

// ── 3. ทรัพย์ใหม่ (ยังไม่มี id) ต้องไม่มีแผงนัดติดตาม ──
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('dialog', (d) => d.accept())
  await page.goto('http://localhost:5173/dev/form-harness.html?pro=1', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('เพิ่มทรัพย์ใหม่: ยังไม่มีแผงนัดติดตาม', (await page.getByText('นัดติดตาม', { exact: false }).count()) === 0)
  await page.close()
}

// ── 2. กด "แก้ไข" จากรายการที่เลื่อนลงมา → ฟอร์มต้องเริ่มที่บนสุด ──
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  page.on('dialog', (d) => d.accept())
  await page.goto('http://localhost:5173/dev/form-harness.html?nav=1', { waitUntil: 'networkidle' })
  await page.locator('#go-edit').scrollIntoViewIfNeeded()
  const yBefore = await page.evaluate(() => window.scrollY)
  check('จำลองเลื่อนรายการลงมาก่อนกดแก้ไข', yBefore > 500, `scrollY=${yBefore}`)
  await page.locator('#go-edit').click()
  await page.waitForTimeout(600)
  const yAfter = await page.evaluate(() => window.scrollY)
  check('เปิดฟอร์มแล้วเลื่อนขึ้นบนสุดให้เอง', yAfter === 0, `scrollY=${yAfter}`)
  const bar = await page.locator('.wiz-steps').boundingBox()
  check('แถบสเต็ปอยู่ในจอ (ไม่ลอยเหนือขอบบน)', bar && bar.y >= 0 && bar.y < 900, bar ? `y=${Math.round(bar.y)}` : 'ไม่พบแถบ')
  await page.screenshot({ path: 'scratch-shots/09-edit-after-nav.png' })
  await page.close()
}

await browser.close()

for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.extra ? ` [${r.extra}]` : ''}`)
const fails = results.filter((r) => !r.ok)
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ`)
  process.exit(1)
}
console.log(`\n✅ โหมดแก้ไข + การเลื่อนหน้า: ผ่านทั้ง ${results.length} ข้อ`)
