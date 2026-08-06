// ทดสอบหน้ายอดสมัครสาธารณะ /stats — รัน: npm run test:stats
// ต้องเปิด dev server ไว้ก่อน: npm run dev
//
// หน้านี้เปิดสาธารณะ (ไม่ต้องล็อกอิน) จึงตรวจ 2 เรื่องหลัก:
//   1) ความปลอดภัย — ไม่มีคีย์ในไฟล์ · SQL คืนแต่ตัวเลขรวม · ไม่มีข้อมูลระบุตัวตน
//   2) หน้าเว็บทำงานจริง — ตัวเลข/กราฟ/ตาราง/ทูลทิป และ "พังแบบสวย" เมื่ออ่านตัวเลขไม่ได้
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const SHOTS = 'scratch-shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, extra = '') => results.push({ name, ok: Boolean(ok), extra })

// ── 1) ตรวจไฟล์แบบสถิต (ไม่ต้องเปิดเบราว์เซอร์) ──
const page$ = readFileSync('public/stats.html', 'utf8')
const api$ = readFileSync('api/stats.js', 'utf8')
const sql$ = readFileSync('supabase/public-stats.sql', 'utf8')

check('หน้า /stats ไม่มีคีย์ JWT ฝังในไฟล์', !/eyJ[A-Za-z0-9_-]{10,}/.test(page$))
check('หน้า /stats ไม่มี URL ฐานข้อมูลตรงๆ', !/supabase\.co/.test(page$))
check('หน้า /stats ไม่อ่าน env ของแอป', !/VITE_[A-Z_]+/.test(page$))
check('หน้า /stats ดึงตัวเลขผ่าน /api/stats', page$.includes("fetch('/api/stats'"))
check('หน้า /stats กันไม่ให้ Google เก็บ index', /name="robots" content="noindex"/.test(page$))
check('หน้า /stats มีทางกลับหน้าแรก', page$.includes('href="/"'))
check('หน้า /stats มีตารางให้อ่านแทนกราฟ (accessibility)', page$.includes('ดูเป็นตาราง'))
check('กราฟมี aria-label อธิบาย', /role="img"[\s\S]{0,120}aria-label/.test(page$))
check('โหมดมืดเลือกสีเอง ไม่พลิกสีเดิม', /prefers-color-scheme: dark[\s\S]*?--purple: #a78bfa/.test(page$))

check('API ใช้คีย์ anon (ไม่ใช่ service role)',
  api$.includes('VITE_SUPABASE_ANON_KEY') && !api$.includes('SERVICE_ROLE'))
check('API แคชที่ CDN กันคนกดรีเฟรชรัวๆ', /s-maxage=\d+/.test(api$))
check('API บอกชัดเมื่อยังไม่ได้รัน SQL', api$.includes('PGRST202'))

check('SQL เปิดให้ anon เรียกฟังก์ชันได้', /grant execute on function public\.public_signup_stats\(\) to anon/.test(sql$))
check('SQL เป็น security definer (ตารางยังปิดด้วย RLS)', /security definer/.test(sql$))
// ⭐ ห้ามคืนคอลัมน์ที่ระบุตัวตนได้เด็ดขาด
// ตรวจแค่ "ตัวฟังก์ชัน" (ก่อน commit) — ท้ายไฟล์เป็น self-test ที่มีรายชื่อคำห้ามอยู่ ไม่ใช่ข้อมูลที่คืน
const sqlFn = sql$.slice(
  sql$.indexOf('create or replace function public.public_signup_stats'), sql$.indexOf('commit;'))
check('ตัดตัวฟังก์ชันมาตรวจได้', sqlFn.length > 200)
for (const bad of ['name', 'email', 'full_name', 'phone', 'lessor_name', 'code']) {
  check(`SQL ไม่คืนฟิลด์ระบุตัวตน (${bad})`, !new RegExp(`'${bad}'\\s*,`).test(sqlFn))
}
check('SQL ไม่นับบัญชีทีมงาน (super) เป็นผู้สมัคร', /is_super, false\) = false/.test(sql$))
// ⭐ ต้องตัดองค์กรทดสอบ/ของทีมงานออกจากตัวเลขสาธารณะ
check('SQL มีธง organizations.internal', /add column if not exists internal boolean/.test(sql$))
check('SQL นับเฉพาะองค์กรที่ไม่ใช่ทดสอบ', /where internal = false/.test(sqlFn))
check('SQL นับผู้ใช้ผ่านองค์กรจริงเท่านั้น', /join real_orgs ro on ro\.id = m\.org_id/.test(sqlFn))
check('SQL นับทรัพย์เฉพาะขององค์กรจริง', /from real_orgs ro where ro\.id = pr\.org_id/.test(sqlFn))
check('SQL มี self-test เทียบยอดกับองค์กรที่ไม่ใช่ทดสอบ', /ไม่เท่ากับองค์กรที่ไม่ใช่ทดสอบ/.test(sql$))
check('SQL ให้ super สลับธงได้ (คนอื่นไม่ได้)',
  /function public\.super_set_internal/.test(sql$) && /revoke all on function public\.super_set_internal\(uuid, boolean\) from public, anon/.test(sql$))
check('SQL backfill ทำครั้งเดียว (ไม่ทับค่าที่ super แก้)', /statsBackfilled/.test(sql$))
// องค์กรเดโมที่สร้าง "ทีหลัง" ต้องถูกตัดออกเองด้วย ไม่ใช่พึ่ง backfill ครั้งเดียว
check('มี trigger ติดธงองค์กรเดโม/ทดสอบที่สร้างใหม่',
  /create trigger mark_internal_org[\s\S]*?before insert on public\.organizations/.test(sql$))
check('เกณฑ์ชื่อครอบคำว่า เดโม/demo ทั้งไทยและอังกฤษ',
  /ทดสอบ\|ตัวอย่าง\|เดโม\|test\|demo\|sandbox\|dummy/.test(sql$))
check('trigger ไม่ทับค่าที่ super ตั้งเอง (เช็คก่อนว่ายังเป็น false)',
  /if coalesce\(new\.internal, false\) = false/.test(sql$))
check('SQL มี self-test ว่าไม่มีองค์กรชื่อเดโมหลุดเข้าเลขสาธารณะ',
  /ยังมีองค์กรชื่อเดโม\/ทดสอบ/.test(sql$))
const demoSql$ = readFileSync('supabase/demo-org.sql', 'utf8')
check('ไฟล์สร้างองค์กรเดโมติดธง internal ให้ตัวเอง', /set internal = true where id = v_org/.test(demoSql$))
check('ไฟล์เดโมทนกรณียังไม่มีคอลัมน์ (รันก่อน public-stats.sql)',
  /exception when undefined_column then null/.test(demoSql$))
const superPage$ = readFileSync('src/pages/SuperAdminPage.tsx', 'utf8')
check('หน้า Super Admin มีปุ่มสลับ "นับใน /stats"', superPage$.includes('นับใน /stats'))
check('ปุ่มเรียก RPC super_set_internal', superPage$.includes("rpc('super_set_internal'"))
check('หน้า /stats บอกว่าไม่นับองค์กรทดสอบ', page$.includes('ไม่นับองค์กรทดสอบ'))
check('SQL มี self-test กันข้อมูลหลุด', sql$.includes('ผลลัพธ์มีอีเมลหลุดออกมา'))
check('SQL ไม่เปิดเผยยอดที่จ่ายเงิน/รายได้', !/payments|revenue|mrr/i.test(sql$.split('-- ==')[2] ?? sql$))

// ── 2) เปิดหน้าจริงด้วยเบราว์เซอร์ ──
const FIXTURE = {
  orgs_total: 12, orgs_30d: 4, orgs_7d: 1,
  users_total: 37, users_30d: 9,
  properties_total: 1284,
  monthly: [
    { month: '2025-09', orgs: 0, users: 0 }, { month: '2025-10', orgs: 1, users: 2 },
    { month: '2025-11', orgs: 0, users: 0 }, { month: '2025-12', orgs: 2, users: 5 },
    { month: '2026-01', orgs: 1, users: 3 }, { month: '2026-02', orgs: 0, users: 0 },
    { month: '2026-03', orgs: 3, users: 8 }, { month: '2026-04', orgs: 1, users: 1 },
    { month: '2026-05', orgs: 0, users: 0 }, { month: '2026-06', orgs: 2, users: 4 },
    { month: '2026-07', orgs: 1, users: 2 }, { month: '2026-08', orgs: 1, users: 3 },
  ],
  updated_at: '2026-08-05T09:30:00+07:00',
}

const browser = await chromium.launch({ channel: 'msedge', headless: !process.argv.includes('--headed') })
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

// กรณีปกติ: แทนคำตอบของ API ด้วยข้อมูลตัวอย่าง (dev server ไม่ได้รัน serverless function)
await page.route('**/api/stats', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }))
await page.goto(`${BASE}/stats.html`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)

const text = await page.locator('body').innerText()
check('โชว์ยอดองค์กรทั้งหมด', text.includes('12') && text.includes('องค์กรที่สมัครใช้งาน'))
check('โชว์ยอดผู้ใช้', text.includes('37') && text.includes('ผู้ใช้ทั้งหมด'))
check('จัดรูปเลขหลักพันมีคอมมา', text.includes('1,284'), text.match(/1[,.]?284/)?.[0] ?? '')
check('โชว์ยอดใหม่ 30 วัน', text.includes('+4 ใน 30 วัน'))
check('มี 4 การ์ดตัวเลข', (await page.locator('.tile').count()) === 4)

check('กราฟมี 12 ช่องเดือน', (await page.locator('.barg').count()) === 12)
// เดือนที่ยอด 0 ต้องไม่วาดแท่ง (แต่ยังมีป้ายเดือนบนแกน) — 12 เดือน มี 4 เดือนที่เป็น 0
check('เดือนที่ไม่มีคนสมัครไม่วาดแท่ง', (await page.locator('path.bar').count()) === 8,
  String(await page.locator('path.bar').count()))
check('ติดป้ายตัวเลขแค่เดือนสูงสุดกับเดือนล่าสุด', (await page.locator('.barlabel').count()) === 2,
  String(await page.locator('.barlabel').count()))
check('แกนเดือนเป็น พ.ศ. แบบสั้น', text.includes('ส.ค. 69'))

// ทูลทิปตอนชี้แท่ง
await page.locator('.barg').nth(6).hover()
await page.waitForTimeout(200)
const tipText = await page.locator('#tip').innerText()
check('ชี้แท่งแล้วขึ้นทูลทิปพร้อมชื่อเดือนเต็ม', tipText.includes('มี.ค. 2569') && tipText.includes('3 องค์กร'), tipText)
check('ทูลทิปมองเห็นจริง', (await page.locator('#tip').evaluate((el) => getComputedStyle(el).opacity)) === '1')

// ตารางสำรอง
await page.locator('details summary').click()
await page.waitForTimeout(150)
check('ตารางมี 12 แถว (หัวตาราง 1 แถว)', (await page.locator('table tr').count()) === 13)
check('ไม่มี error ในคอนโซล', errors.length === 0, errors[0] ?? '')
const shotOk = `${SHOTS}/22-stats.png`
await page.screenshot({ path: shotOk, fullPage: true })

// กรณี API ล่ม / ยังไม่ได้รัน SQL → ต้องบอกผู้ใช้ ไม่ใช่จอเปล่า
await page.unroute('**/api/stats')
await page.route('**/api/stats', (route) =>
  route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: 'ยังไม่ได้ติดตั้งฟีเจอร์นี้ (รัน supabase/public-stats.sql)' }) }))
await page.goto(`${BASE}/stats.html`, { waitUntil: 'networkidle' })
await page.waitForTimeout(300)
const errText = await page.locator('body').innerText()
check('API ล่ม → ขึ้นข้อความบอกเหตุ ไม่ใช่จอว่าง', errText.includes('แสดงยอดสมัครไม่ได้ตอนนี้'))
check('API ล่ม → ยังบอกวิธีแก้ (ชื่อไฟล์ SQL)', errText.includes('public-stats.sql'))
const shotErr = `${SHOTS}/23-stats-error.png`
await page.screenshot({ path: shotErr, fullPage: true })

await browser.close()

const fails = results.filter((r) => !r.ok)
console.log(`\nภาพหน้าจอ: ${shotOk}, ${shotErr}`)
if (fails.length) {
  console.error(`\n❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${results.length - fails.length}/${results.length}):`)
  for (const f of fails) console.error(`   - ${f.name}${f.extra ? ` [${f.extra}]` : ''}`)
  process.exit(1)
}
console.log(`\n✅ หน้ายอดสมัครสาธารณะ: ผ่านทั้ง ${results.length} ข้อ`)
