// ทดสอบ "ดูรูปเต็มจอ" บนเบราว์เซอร์จริง — รัน: npm run test:lightbox
// เคสต้นเรื่อง: การ์ดรายละเอียดโชว์รูปเป็นตารางเล็กๆ ซูมไม่ได้ เลื่อนดูรูปถัดไปไม่ได้
// ใช้ dev/form-harness.html?page=detail&pics=N จึงไม่ต้องล็อกอินและไม่ต้องต่อเน็ต (รูปเป็น data URI)
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 5178
const BASE = `http://localhost:${PORT}/dev/form-harness.html`

const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore', shell: true,
})
const stop = () => { try { dev.kill() } catch { /* ปิดไปแล้ว */ } }
process.on('exit', stop)

const fails = []
let pass = 0
const ok = (name, cond) => (cond ? pass++ : fails.push(name))
const eq = (name, got, want) =>
  (got === want ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

// รอ dev server ตอบก่อน (ไม่ใช้ sleep ยาวๆ)
async function waitServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('dev server ไม่ขึ้นภายใน 30 วินาที')
}

/**
 * transform จริงของรูป "ที่กำลังดูอยู่" (ไม่ใช่รูปแรกในราง — เคยพลาดตรงนี้แล้วเทสไม่จริง)
 * คืน { scale, dx } อ่านจากค่าที่เบราว์เซอร์คำนวณจริง
 */
const transformOf = (page) => page.evaluate(() => {
  const dots = [...document.querySelectorAll('.lb-dot')]
  const at = dots.length ? dots.findIndex((d) => d.classList.contains('on')) : 0
  const img = document.querySelectorAll('.lb-slide img')[Math.max(at, 0)]
  const m = new DOMMatrixReadOnly(getComputedStyle(img).transform)
  return { scale: Math.round(m.a * 100) / 100, dx: Math.round(m.e) }
})
const scaleOf = async (page) => (await transformOf(page)).scale

try {
  await waitServer()
  const browser = await chromium.launch({ channel: 'msedge' })

  // ── 1) รูปเดียว: กดรูปแล้วเปิดเต็มจอ ซูมได้ ปิดได้ ──────────────
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.goto(`${BASE}?page=detail&pics=1`, { waitUntil: 'networkidle' })
    eq('รูปเดียว: แกลเลอรีมี 1 รูป', await page.locator('.detail-gallery button').count(), 1)
    ok('รูปเดียว: ไม่ขึ้นป้ายจำนวนรูป', await page.locator('.gal-more').count() === 0)
    ok('ยังไม่กด = ไม่มีหน้าดูรูปเต็มจอ', await page.locator('.lb').count() === 0)

    await page.locator('.detail-gallery button').first().click()
    ok('กดรูปแล้วเปิดเต็มจอ', await page.locator('.lb').isVisible())
    ok('รูปเดียวไม่มีปุ่มเลื่อน', await page.locator('.lb-nav').count() === 0)
    ok('รูปเดียวไม่มีจุดบอกตำแหน่ง', await page.locator('.lb-dot').count() === 0)
    eq('เริ่มที่ขนาดพอดีจอ 100%', (await page.locator('.lb-btn', { hasText: '%' }).innerText()).trim(), '100%')

    // ซูมด้วยปุ่ม +
    await page.locator('.lb-btn[aria-label="ซูมเข้า"]').click()
    ok('กดปุ่ม + แล้วซูมเข้า (scale > 1)', (await scaleOf(page)) > 1)
    ok('ซูมแล้วปุ่มรีเซ็ตกดได้', await page.locator('.lb-btn', { hasText: '%' }).isEnabled())

    // ดับเบิลคลิกย่อกลับ
    await page.locator('.lb-stage').dblclick()
    eq('ดับเบิลคลิกตอนซูมอยู่ = ย่อกลับ 100%', await scaleOf(page), 1)

    // ดับเบิลคลิกซูมเข้า
    await page.locator('.lb-stage').dblclick()
    ok('ดับเบิลคลิกตอนยังไม่ซูม = ซูมเข้า', (await scaleOf(page)) > 1)

    // ล้อเมาส์ซูมออก
    await page.locator('.lb-stage').hover()
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(120)
    const afterWheel = await scaleOf(page)
    ok('ล้อเมาส์ลง = ซูมออก', afterWheel < 2.5)
    ok('ซูมออกไม่ต่ำกว่า 100% (ไม่ให้รูปเล็กกว่าจอ)', afterWheel >= 1)

    // ปุ่ม 0 รีเซ็ต
    await page.keyboard.press('0')
    eq('กด 0 = กลับ 100%', await scaleOf(page), 1)

    // Esc ปิด
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    ok('กด Esc ปิดหน้าดูรูป', await page.locator('.lb').count() === 0)
    ok('ปิดรูปแล้วการ์ดรายละเอียดยังอยู่ (Esc ไม่ทะลุไปปิดการ์ด)',
      await page.locator('.detail-pane').isVisible())
    await page.close()
  }

  // ── 2) หลายรูป: ปุ่มเลื่อน / จุด / ปัดนิ้ว / คีย์บอร์ด ───────────
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    await page.goto(`${BASE}?page=detail&pics=4`, { waitUntil: 'networkidle' })
    eq('4 รูป: แกลเลอรีมี 4 รูป', await page.locator('.detail-gallery button').count(), 4)
    eq('รูปปกมีป้ายจำนวนรูป', (await page.locator('.gal-more').innerText()).trim(), '4 รูป')

    // กดรูปที่ 3 → ต้องเปิดที่รูปที่ 3 ไม่ใช่รูปแรก
    await page.locator('.detail-gallery button').nth(2).click()
    eq('กดรูปไหนเปิดรูปนั้น', (await page.locator('.lb-count').innerText()).includes('3 / 4'), true)
    eq('มีจุดบอกตำแหน่งครบทุกรูป', await page.locator('.lb-dot').count(), 4)

    await page.locator('.lb-nav.next').click()
    eq('กดถัดไป → รูปที่ 4', (await page.locator('.lb-count').innerText()).includes('4 / 4'), true)
    ok('รูปสุดท้ายปิดปุ่มถัดไป', await page.locator('.lb-nav.next').isDisabled())

    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(150)
    eq('ลูกศรซ้าย → รูปที่ 3', (await page.locator('.lb-count').innerText()).includes('3 / 4'), true)

    // จุดสุดท้าย → รูปสุดท้าย
    await page.locator('.lb-dot').first().click()
    await page.waitForTimeout(150)
    eq('กดจุดแรก → รูปที่ 1', (await page.locator('.lb-count').innerText()).includes('1 / 4'), true)
    ok('รูปแรกปิดปุ่มก่อนหน้า', await page.locator('.lb-nav.prev').isDisabled())

    // ปัดนิ้ว (ลากซ้ายเกิน 60px) → รูปถัดไป
    const box = await page.locator('.lb-stage').boundingBox()
    const cy = box.y + box.height / 2
    await page.mouse.move(box.x + box.width * 0.7, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7 - 200, cy, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    eq('ปัดซ้าย → รูปถัดไป', (await page.locator('.lb-count').innerText()).includes('2 / 4'), true)

    // ปัดสั้นๆ (ไม่ถึงเกณฑ์) ต้องไม่เปลี่ยนรูป
    await page.mouse.move(box.x + box.width * 0.7, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7 - 20, cy, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    eq('ปัดสั้นไม่ถึงเกณฑ์ = ไม่เปลี่ยนรูป', (await page.locator('.lb-count').innerText()).includes('2 / 4'), true)

    // ซูมค้างไว้แล้วเปลี่ยนรูป → ต้องรีเซ็ตซูมให้รูปใหม่
    await page.locator('.lb-btn[aria-label="ซูมเข้า"]').click()
    ok('ซูมรูปที่ 2 ไว้', (await scaleOf(page)) > 1)
    await page.locator('.lb-nav.next').click()
    await page.waitForTimeout(250)
    eq('เปลี่ยนรูปแล้วซูมรีเซ็ตเป็น 100%', await scaleOf(page), 1)

    // ลากตอนซูมแล้ว = เลื่อนดูรูป ไม่ใช่เปลี่ยนรูป
    await page.locator('.lb-btn[aria-label="ซูมเข้า"]').click()
    const before = await page.locator('.lb-count').innerText()
    await page.mouse.move(box.x + box.width / 2, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 200, cy, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    eq('ซูมแล้วลาก = ไม่เปลี่ยนรูป', await page.locator('.lb-count').innerText(), before)
    ok('ซูมแล้วลาก = รูปเลื่อนตามนิ้ว', Math.abs((await transformOf(page)).dx) > 5)

    // ปิดด้วยปุ่มกากบาท
    await page.locator('.lb-btn[aria-label="ปิด"]').click()
    await page.waitForTimeout(200)
    ok('ปุ่มกากบาทปิดได้', await page.locator('.lb').count() === 0)
    await page.close()
  }

  // ── 3) มือถือ: ไม่มีปุ่มบังรูป และรูปไม่ล้นจอ ────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 })
    await page.goto(`${BASE}?page=detail&pics=3`, { waitUntil: 'networkidle' })
    await page.locator('.detail-gallery button').first().click()
    ok('มือถือ: ซ่อนปุ่มเลื่อน (ใช้ปัดนิ้ว)', !(await page.locator('.lb-nav.next').isVisible()))
    ok('มือถือ: ยังมีจุดบอกตำแหน่ง', await page.locator('.lb-dot').first().isVisible())
    const fits = await page.evaluate(() => {
      const img = document.querySelector('.lb-slide img')
      const r = img.getBoundingClientRect()
      return r.width <= window.innerWidth + 1 && r.height <= window.innerHeight + 1
    })
    ok('มือถือ: รูปพอดีจอ ไม่ล้น', fits)
    eq('มือถือ: หน้าไม่เลื่อนซ้าย-ขวา',
      await page.evaluate(() => document.documentElement.scrollWidth), 390)
    await page.close()
  }

  await browser.close()
} finally {
  stop()
}

console.log(`\nดูรูปเต็มจอ: ผ่าน ${pass} · ไม่ผ่าน ${fails.length}`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ ซูมได้ (ปุ่ม/ดับเบิลคลิก/ล้อเมาส์) · เลื่อนดูหลายรูปได้ (ปุ่ม/จุด/ปัด/คีย์บอร์ด) · มือถือพอดีจอ')
