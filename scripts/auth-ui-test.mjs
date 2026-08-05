// ทดสอบหน้าเข้าสู่ระบบ (จำการเข้าสู่ระบบ / ลืมรหัสผ่าน) ด้วย Playwright — Edge ในเครื่อง
// ต้องเปิด dev server ไว้ก่อน: npm run dev
// รัน: node scripts/auth-ui-test.mjs        (--headed เพื่อดูเบราว์เซอร์)
//
// ทดสอบผ่าน dev/form-harness.html?page=login — ไม่ยิงไป Supabase จริง (แค่ตรวจ UI/สถานะ)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173/dev/form-harness.html?page=login'
const SHOTS = 'scratch-shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })

const browser = await chromium.launch({ channel: 'msedge', headless: !process.argv.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

const text = () => page.locator('body').innerText()
const btn = (name) => page.getByRole('button', { name, exact: true })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })

// ── โหมดเข้าสู่ระบบ: มีช่องติ๊กจำการเข้าสู่ระบบ (ติ๊กไว้เป็นค่าเริ่มต้น) + ลิงก์ลืมรหัสผ่าน ──
const remember = page.locator('.auth-remember input[type=checkbox]')
check('มีช่องติ๊ก "จำการเข้าสู่ระบบในเครื่องนี้"', (await remember.count()) === 1)
check('ค่าเริ่มต้น = ติ๊กไว้ (ผู้ใช้ทั่วไปไม่ต้องล็อกอินซ้ำ)', await remember.isChecked())
check('มีลิงก์ "ลืมรหัสผ่าน?"', (await btn('ลืมรหัสผ่าน?').count()) === 1)
check('มีช่องรหัสผ่าน', (await page.locator('input[type=password]').count()) === 1)
const shotLogin = `${SHOTS}/19-login.png`
await page.screenshot({ path: shotLogin, fullPage: true })

// ── ไม่ติ๊ก = ต้องจดธงลง localStorage ทันทีที่กดเข้าสู่ระบบ (ก่อนยิง Supabase) ──
await remember.uncheck()
check('ยกเลิกติ๊กได้', !(await remember.isChecked()))
await page.locator('input[type=email]').fill('someone@example.com')
await page.locator('input[type=password]').fill('wrong-password-123')
await page.locator('button.auth-submit').click()   // ปุ่ม submit (แท็บด้านบนชื่อซ้ำกัน)
await page.waitForTimeout(1500)
check('ไม่ติ๊ก → จดธง hop_remember=0 ไว้ในเครื่อง',
  (await page.evaluate(() => localStorage.getItem('hop_remember'))) === '0')

// ── โหมดลืมรหัสผ่าน ──
await page.goto(BASE, { waitUntil: 'networkidle' })
await btn('ลืมรหัสผ่าน?').click()
await page.waitForTimeout(300)
const t = await text()
check('เข้าโหมดลืมรหัสผ่าน: อธิบายว่าจะส่งลิงก์', t.includes('ลิงก์ตั้งรหัสผ่านใหม่'))
check('บอกว่าลิงก์ใช้ครั้งเดียว/หมดอายุ 1 ชั่วโมง', t.includes('หมดอายุใน 1 ชั่วโมง'))
check('ซ่อนช่องรหัสผ่าน (ยังไม่ต้องใช้)', (await page.locator('input[type=password]').count()) === 0)
check('ซ่อนช่องติ๊กจำการเข้าสู่ระบบ', (await page.locator('.auth-remember').count()) === 0)
check('ปุ่มเปลี่ยนเป็น "ส่งลิงก์ตั้งรหัสผ่านใหม่"',
  (await page.locator('button.auth-submit').innerText()).includes('ส่งลิงก์ตั้งรหัสผ่านใหม่'))
check('ซ่อนปุ่ม Google ในโหมดนี้', (await page.getByRole('button', { name: /Google/ }).count()) === 0)
check('บอกทางออกให้คนที่ใช้ Google', t.includes('เข้าระบบด้วย Google อยู่?'))
check('มีปุ่มกลับไปหน้าเข้าสู่ระบบ', (await btn('← กลับไปหน้าเข้าสู่ระบบ').count()) === 1)
// แถบแท็บต้องหาย — โชว์ไว้จะกลายเป็นคอนโทรลที่ไม่มีอันไหนถูกเลือก (ผู้ใช้ทักมา)
check('ซ่อนแถบแท็บ เข้าสู่ระบบ/สมัครสมาชิก', (await page.locator('.auth-tabs').count()) === 0)
check('มีหัวข้อ "ลืมรหัสผ่าน" แทนแถบแท็บ',
  (await page.locator('.auth-title').innerText()) === 'ลืมรหัสผ่าน')
check('ไม่มีลิงก์ "กลับหน้าแรก" ซ้อนอีกอัน', !(await text()).includes('กลับหน้าแรก'))
const shotForgot = `${SHOTS}/20-login-forgot.png`
await page.screenshot({ path: shotForgot, fullPage: true })

// กลับได้จริง
await btn('← กลับไปหน้าเข้าสู่ระบบ').click()
await page.waitForTimeout(250)
check('กลับหน้าเข้าสู่ระบบแล้วช่องรหัสผ่านกลับมา', (await page.locator('input[type=password]').count()) === 1)
check('กลับมาแล้วแถบแท็บกลับมาด้วย', (await page.locator('.auth-tabs').count()) === 1)
check('แท็บ "เข้าสู่ระบบ" ถูกเลือกอยู่',
  (await page.locator('.auth-tabs button.on').innerText()) === 'เข้าสู่ระบบ')

await browser.close()

const fails = results.filter((r) => !r.ok)
console.log(`\nภาพหน้าจอ: ${shotLogin}, ${shotForgot}`)
if (pageErrors.length) {
  console.log(`\n⚠️  error ในหน้าเว็บ ${pageErrors.length} รายการ:`)
  for (const e of pageErrors.slice(0, 8)) console.log(`   - ${e}`)
}
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${results.length - fails.length}/${results.length}):`)
  for (const f of fails) console.error(`   - ${f.name}${f.extra ? ` [${f.extra}]` : ''}`)
  process.exit(1)
}
console.log(`\n✅ หน้าเข้าสู่ระบบ (จำรหัส/ลืมรหัส): ผ่านทั้ง ${results.length} ข้อ`)
