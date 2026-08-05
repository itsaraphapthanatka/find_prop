// ทดสอบ UI ที่นั่งทีม (หน้าจัดการทีม + หน้าอัปเกรด) ด้วย Playwright (Edge ที่มีในเครื่อง)
// ต้องเปิด dev server ไว้ก่อน: npm run dev
// รัน: node scripts/seats-ui-test.mjs        (ใส่ --headed เพื่อดูเบราว์เซอร์กดเอง)
//
// ผ่านหน้า dev/form-harness.html จึงไม่ต้องล็อกอิน — แพ็กเกจ/ระดับ/ที่นั่งที่ซื้อเพิ่มปลอมผ่าน query
// หมายเหตุ: ไม่ได้ล็อกอิน → RPC my_seat_usage ใช้ไม่ได้ จึงเป็นการทดสอบ "เส้นทางคำนวณสำรอง" ด้วย
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

const team = (q) => page.goto(`${BASE}?page=team&pro=1&${q}`, { waitUntil: 'networkidle' })
const bodyText = () => page.locator('body').innerText()
const has = async (t) => (await bodyText()).includes(t)

// ── หน้าจัดการทีม: โควตาที่นั่งต่อแพ็กเกจ/ระดับ ──
const CASES = [
  { q: 'plan=starter&tier=100', want: 'ใช้ 1 จาก 3 ที่นั่ง', base: 'แพ็กเกจให้ 3 ที่นั่ง' },
  { q: 'plan=starter&tier=250', want: 'ใช้ 1 จาก 5 ที่นั่ง', base: 'แพ็กเกจให้ 5 ที่นั่ง' },
  { q: 'plan=starter&tier=500', want: 'ใช้ 1 จาก 10 ที่นั่ง', base: 'แพ็กเกจให้ 10 ที่นั่ง' },
  { q: 'plan=pro&tier=100', want: 'ใช้ 1 จาก 5 ที่นั่ง', base: 'แพ็กเกจให้ 5 ที่นั่ง' },
  { q: 'plan=pro&tier=500', want: 'ใช้ 1 จาก 20 ที่นั่ง', base: 'แพ็กเกจให้ 20 ที่นั่ง' },
]
for (const c of CASES) {
  await team(c.q)
  await page.waitForTimeout(300)
  const txt = await bodyText()
  check(`ทีม ${c.q}: ${c.want}`, txt.includes(c.want), txt.match(/ใช้ \d+ จาก \d+ ที่นั่ง/)?.[0] ?? 'ไม่เจอ')
  check(`ทีม ${c.q}: ${c.base}`, txt.includes(c.base))
}

// ที่นั่งที่ซื้อเพิ่มต้องบวกทับโควตาแพ็กเกจ
await team('plan=starter&tier=100&extra=2')
await page.waitForTimeout(300)
check('Basic 100 + ซื้อเพิ่ม 2 = 5 ที่นั่ง', await has('ใช้ 1 จาก 5 ที่นั่ง'))
check('บอกว่าซื้อเพิ่มไว้ 2 ที่นั่ง', await has('ซื้อเพิ่ม 2 ที่นั่ง'))
check('บอกวันหมดอายุที่นั่งที่ซื้อ', /ถึง \d+ .+ \d{4}/.test(await bodyText()))
const shotBasic = `${SHOTS}/10-seats-basic.png`
await page.screenshot({ path: shotBasic, fullPage: true })

// Free = เจ้าของคนเดียว → เต็มทันที เชิญไม่ได้
await team('plan=free')
await page.waitForTimeout(300)
check('Free: ใช้ 1 จาก 1 ที่นั่ง', await has('ใช้ 1 จาก 1 ที่นั่ง'))
check('Free: บอกว่าไม่รองรับลูกทีม', await has('Free ไม่รองรับลูกทีม') || await has('Free ใช้ได้คนเดียว'))
check('Free: ปุ่มสร้างลิงก์เชิญถูกปิด',
  await page.getByRole('button', { name: 'สร้างลิงก์เชิญ' }).isDisabled())
const shotFree = `${SHOTS}/11-seats-free.png`
await page.screenshot({ path: shotFree, fullPage: true })

// Enterprise = ไม่จำกัด (ไม่ต้องมีปุ่มซื้อที่นั่ง)
await team('plan=enterprise')
await page.waitForTimeout(300)
check('Enterprise: ไม่จำกัดที่นั่ง', await has('ไม่จำกัดที่นั่ง'))
check('Enterprise: ไม่โชว์ปุ่มซื้อที่นั่งเพิ่ม',
  (await page.getByRole('link', { name: 'ซื้อที่นั่งเพิ่ม' }).count()) === 0)
check('Enterprise: ปุ่มเชิญยังกดได้',
  !(await page.getByRole('button', { name: 'สร้างลิงก์เชิญ' }).isDisabled()))

// เหลือที่นั่งเท่าไรต้องบอกในกล่องเชิญ
await team('plan=pro&tier=250')
await page.waitForTimeout(300)
check('บอกจำนวนที่เชิญเพิ่มได้ (10−1=9)', await has('เชิญเพิ่มได้อีก'))
check('ตัวเลขที่เหลือถูกต้อง', (await bodyText()).includes('9'))

// ── หน้าอัปเกรด: การ์ดซื้อที่นั่งเพิ่ม ──
await page.goto(`${BASE}?page=upgrade&pro=1&plan=starter&tier=100`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
check('หน้าอัปเกรด: มีการ์ดที่นั่งเพิ่ม', (await page.locator('#seats').count()) === 1)
check('หน้าอัปเกรด: บอกว่าแพ็กเกจให้ 3 ที่นั่ง', await has('แพ็กเกจปัจจุบันให้'))
const qty = page.locator('#seats input[type=number]')
check('ค่าเริ่มต้น 1 ที่นั่ง', (await qty.inputValue()) === '1')
check('ราคา 1 ที่นั่ง/เดือน = ฿290', await has('฿290'))
await qty.fill('3')
await page.waitForTimeout(200)
check('3 ที่นั่ง = ฿870/เดือน', await has('฿870'), (await page.locator('#seats').innerText()).replace(/\n/g, ' · '))
await qty.fill('999')
await page.waitForTimeout(200)
check('กรอกเกิน 50 → ตัดเหลือ 50', (await qty.inputValue()) === '50')
await qty.fill('3')
await page.getByRole('button', { name: /รายปี/ }).click()
await page.waitForTimeout(250)
check('รายปี 3 ที่นั่ง = ฿8,874', await has('฿8,874'), (await page.locator('#seats').innerText()).replace(/\n/g, ' · '))
check('การ์ดแพ็กเกจบอกจำนวนที่นั่ง (Basic 100 = 3)', await has('ทีม 3 ที่นั่ง'))
check('การ์ดแพ็กเกจ Pro บอก 5 ที่นั่ง (ระดับ 100)', await has('ทีม 5 ที่นั่ง'))
const shotUp = `${SHOTS}/12-seats-upgrade.png`
await page.screenshot({ path: shotUp, fullPage: true })

// ระดับสูงขึ้น → ที่นั่งในการ์ดแพ็กเกจต้องเพิ่มตาม
await page.getByRole('button', { name: 'ไม่เกิน 500 ทรัพย์' }).click()
await page.waitForTimeout(250)
check('เลือกระดับ 500 → Basic 10 ที่นั่ง', await has('ทีม 10 ที่นั่ง'))
check('เลือกระดับ 500 → Pro 20 ที่นั่ง', await has('ทีม 20 ที่นั่ง'))

await browser.close()

// ── สรุป ──
const fails = results.filter((r) => !r.ok)
console.log(`\nภาพหน้าจอ: ${[shotBasic, shotFree, shotUp].join(', ')}`)
if (pageErrors.length) {
  console.log(`\n⚠️  error ในหน้าเว็บ ${pageErrors.length} รายการ:`)
  for (const e of pageErrors.slice(0, 8)) console.log(`   - ${e}`)
}
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${results.length - fails.length}/${results.length}):`)
  for (const f of fails) console.error(`   - ${f.name}${f.extra ? ` [${f.extra}]` : ''}`)
  process.exit(1)
}
console.log(`\n✅ ที่นั่งทีม (UI): ผ่านทั้ง ${results.length} ข้อ`)
