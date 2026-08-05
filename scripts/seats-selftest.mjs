// ทดสอบโควตาที่นั่งทีม (src/lib/plan.ts) — รัน: npm run test:seats
// ที่นั่ง = 1 บัญชีในองค์กร (นับแอดมินด้วย) · ตัวเลขต้องตรง 3 ที่: plan.ts · api/_lib/seats.js · supabase/seats.sql
import { build } from 'esbuild'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'seats-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/plan.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
  // plan.ts ดึง useAuth/supabase มาด้วย — ทดสอบเฉพาะฟังก์ชันคำนวณ จึงแทนด้วยของปลอม
  plugins: [{
    name: 'stub',
    setup(b) {
      b.onResolve({ filter: /\.\/(auth|supabase)$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const useAuth = () => ({}); export const supabase = {}',
        loader: 'js',
      }))
    },
  }],
})
const { baseSeats, seatLimit, activeExtraSeats, seatShortfall, planAccess, SEATS_BY_PLAN, FREE_SEATS } =
  await import(pathToFileURL(out).href)

// ตั้งค่าที่ super admin แก้ได้ (app_settings 'seats') — โครงเดียวกับ SeatBase ใน payments.ts
const CFG = { free: 2, starter: { 100: 4, 250: 6, 500: 12 }, pro: { 100: 6, 250: 12, 500: 24 } }

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

const today = new Date().toISOString().slice(0, 10)
const dayShift = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10)

// ── โควตาตามแพ็กเกจ × ระดับ ──
eq('Basic 100 = 3 ที่นั่ง', baseSeats('starter', 100), 3)
eq('Basic 250 = 5 ที่นั่ง', baseSeats('starter', 250), 5)
eq('Basic 500 = 10 ที่นั่ง', baseSeats('starter', 500), 10)
eq('Pro 100 = 5 ที่นั่ง', baseSeats('pro', 100), 5)
eq('Pro 250 = 10 ที่นั่ง', baseSeats('pro', 250), 10)
eq('Pro 500 = 20 ที่นั่ง', baseSeats('pro', 500), 20)
eq('ไม่มีระดับ = ระดับ 500 (ลูกค้าเดิม/ทดลอง)', baseSeats('pro', null), 20)
eq('ระดับแปลกปลอม = ถอยไประดับ 500', baseSeats('starter', 999), 10)
eq('Free = 1 ที่นั่ง (เจ้าของคนเดียว)', baseSeats('free', 100), FREE_SEATS)
eq('ไม่มีแพ็กเกจ = 1 ที่นั่ง', baseSeats(null, null), 1)
eq('Enterprise = ไม่จำกัด', baseSeats('enterprise', 100), null)

// ── ที่นั่งที่ซื้อเพิ่ม ──
eq('ยังไม่ซื้อเพิ่ม = 0', activeExtraSeats({ plan: 'pro' }), 0)
eq('ซื้อเพิ่มแต่ไม่มีวันหมดอายุ = ไม่นับ (ข้อมูลไม่ครบ)', activeExtraSeats({ extra_seats: 5 }), 0)
eq('ซื้อเพิ่มยังไม่หมดอายุ = นับ', activeExtraSeats({ extra_seats: 5, extra_seats_expires_at: dayShift(3) }), 5)
eq('หมดอายุวันนี้ = ยังใช้ได้ (ถึงสิ้นวัน)', activeExtraSeats({ extra_seats: 2, extra_seats_expires_at: today }), 2)
eq('หมดอายุเมื่อวาน = ไม่นับ', activeExtraSeats({ extra_seats: 2, extra_seats_expires_at: dayShift(-1) }), 0)

// ── ที่นั่งตามตั้งค่าของ super admin (ทับค่ามาตรฐาน) ──
eq('ตั้งค่าใหม่: Basic 100 = 4', baseSeats('starter', 100, CFG), 4)
eq('ตั้งค่าใหม่: Pro 500 = 24', baseSeats('pro', 500, CFG), 24)
eq('ตั้งค่าใหม่: Free = 2', baseSeats('free', null, CFG), 2)
eq('ตั้งค่าใหม่: ระดับแปลก → ถอยไประดับ 500', baseSeats('pro', 999, CFG), 24)
eq('ตั้งค่าใหม่: Enterprise ยังไม่จำกัด', baseSeats('enterprise', 100, CFG), null)
eq('ไม่ส่งตั้งค่า → ใช้ค่ามาตรฐานเดิม', baseSeats('starter', 100), 3)
eq('seatLimit ใช้ตั้งค่าที่ส่งเข้าไป',
  seatLimit({ plan: 'starter', plan_tier: 250, extra_seats: 1, extra_seats_expires_at: dayShift(9) }, CFG), 7)

// ── ช่วงทดลองใช้ = ไม่จำกัดที่นั่ง (เชิญทีมได้เต็มที่ก่อนตัดสินใจซื้อ) ──
eq('ทดลอง Pro → ไม่จำกัดที่นั่ง',
  seatLimit({ plan: 'free', trial_plan: 'pro', trial_expires_at: dayShift(5) }), null)
eq('ทดลอง Basic → ไม่จำกัดที่นั่งเหมือนกัน',
  seatLimit({ plan: 'free', trial_plan: 'starter', trial_expires_at: dayShift(1) }), null)
eq('ทดลองวันสุดท้าย (หมดวันนี้) ยังไม่จำกัด',
  seatLimit({ plan: 'free', trial_plan: 'pro', trial_expires_at: today }), null)
eq('หมดทดลองแล้วยังไม่จ่าย → เหลือ 1 ที่นั่ง (ต้องเลือกแพ็กเกจ)',
  seatLimit({ plan: 'free', trial_plan: 'pro', trial_expires_at: dayShift(-1) }), 1)
eq('หมดทดลองแล้วจ่าย Basic 100 → กลับมาเป็นโควตาแพ็กเกจ',
  seatLimit({ plan: 'starter', plan_tier: 100, trial_plan: 'pro', trial_expires_at: dayShift(-1) }), 3)
eq('จ่ายแล้วแต่ trial ยังไม่หมด → ใช้โควตาแพ็กเกจที่จ่าย (ไม่ใช่ไม่จำกัด)',
  seatLimit({ plan: 'starter', plan_tier: 100, trial_plan: 'pro', trial_expires_at: dayShift(5) }), 3)

// ── ยอดรวมที่ใช้บังคับจริง ──
eq('Basic 100 + ซื้อเพิ่ม 2 = 5', seatLimit({ plan: 'starter', plan_tier: 100, extra_seats: 2, extra_seats_expires_at: dayShift(30) }), 5)
eq('Basic 100 + ที่ซื้อหมดอายุ = 3', seatLimit({ plan: 'starter', plan_tier: 100, extra_seats: 2, extra_seats_expires_at: dayShift(-1) }), 3)
eq('Enterprise + ซื้อเพิ่ม = ยังไม่จำกัด', seatLimit({ plan: 'enterprise', extra_seats: 5, extra_seats_expires_at: dayShift(9) }), null)
eq('ไม่มี org = 1 ที่นั่ง', seatLimit(null), 1)
// (กติกาช่วงทดลองใช้ย้ายไปอยู่หัวข้อ "ช่วงทดลองใช้ = ไม่จำกัดที่นั่ง" ด้านบน)

// ── ที่นั่งที่ขาด (ต้องจ่ายเพิ่ม) หลังหมดช่วงทดลองใช้ ──
eq('ไม่เกินโควตา = ไม่ต้องจ่าย', seatShortfall(3, 5), 0)
eq('เต็มพอดี = ยังไม่ต้องจ่าย', seatShortfall(5, 5), 0)
eq('ทดลองไว้ 8 คน หมดทดลอง เหลือ 3 ที่นั่ง → ขาด 5', seatShortfall(8, 3), 5)
eq('ยังทดลองใช้ (ไม่จำกัด) = ไม่ขาด', seatShortfall(30, null), 0)
eq('หมดทดลองแล้วยังไม่จ่าย (1 ที่นั่ง) 6 คน → ขาด 5', seatShortfall(6, 1), 5)

// ── planAccess ต้องรายงานที่นั่งพื้นฐานให้หน้าโปรไฟล์ ──
eq('planAccess Basic 250 → maxSeats 5', planAccess('starter', 250).maxSeats, 5)
eq('planAccess free → maxSeats 1', planAccess('free', null).maxSeats, 1)
eq('planAccess enterprise → maxSeats ไม่จำกัด', planAccess('enterprise', null).maxSeats, null)

// ── ตัวเลขต้องตรงกันทั้ง 3 ที่ (client / api / sql) ──
const apiSrc = readFileSync('api/_lib/seats.js', 'utf8')
const sqlSrc = readFileSync('supabase/seats.sql', 'utf8')
for (const plan of ['starter', 'pro']) {
  for (const tier of [100, 250, 500]) {
    const n = SEATS_BY_PLAN[plan][tier]
    const apiHas = new RegExp(`${tier}:\\s*${n}`).test(apiSrc)
    eq(`api/_lib/seats.js มี ${plan} ${tier} = ${n}`, apiHas, true)
    const sqlHas = new RegExp(`when ${tier} then ${n}`).test(sqlSrc)
    eq(`supabase/seats.sql มี ${plan} ${tier} = ${n}`, sqlHas, true)
  }
}
eq('ราคาที่นั่งใน api ตรงกับ sql (290/2958)',
  /monthly: 290, yearly: 2958/.test(apiSrc) && /"monthly": 290, "yearly": 2958/.test(sqlSrc), true)

// ── supabase/seats-config.sql: super ตั้งค่าได้ + ช่วงทดลองไม่จำกัด ──
const cfgSql = readFileSync('supabase/seats-config.sql', 'utf8')
eq('SQL อ่านที่นั่งจาก app_settings', /from public\.app_settings where key = 'seats'/.test(cfgSql), true)
eq('SQL: ช่วงทดลองใช้ = ไม่จำกัดที่นั่ง',
  /org_on_trial\(p_org\) then null/.test(cfgSql), true)
eq('SQL: ค่าตั้งเพี้ยนถอยไปใช้ค่ามาตรฐาน', />= 1 then \(select n from raw\)/.test(cfgSql), true)
eq('SQL: my_seat_usage คืนธงช่วงทดลอง', /on_trial boolean/.test(cfgSql), true)
eq('ค่ามาตรฐานใน SQL ตรงกับฝั่งแอป (Basic 3/5/10 · Pro 5/10/20)',
  /'starter', jsonb_build_object\('100', 3, '250', 5, '500', 10\)/.test(cfgSql)
  && /'pro',     jsonb_build_object\('100', 5, '250', 10, '500', 20\)/.test(cfgSql), true)

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ โควตาที่นั่งทีม: ผ่านทั้ง ${pass} ข้อ`)
