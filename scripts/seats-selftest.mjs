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
const { baseSeats, seatLimit, activeExtraSeats, planAccess, SEATS_BY_PLAN, FREE_SEATS } =
  await import(pathToFileURL(out).href)

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

// ── ยอดรวมที่ใช้บังคับจริง ──
eq('Basic 100 + ซื้อเพิ่ม 2 = 5', seatLimit({ plan: 'starter', plan_tier: 100, extra_seats: 2, extra_seats_expires_at: dayShift(30) }), 5)
eq('Basic 100 + ที่ซื้อหมดอายุ = 3', seatLimit({ plan: 'starter', plan_tier: 100, extra_seats: 2, extra_seats_expires_at: dayShift(-1) }), 3)
eq('Enterprise + ซื้อเพิ่ม = ยังไม่จำกัด', seatLimit({ plan: 'enterprise', extra_seats: 5, extra_seats_expires_at: dayShift(9) }), null)
eq('ไม่มี org = 1 ที่นั่ง', seatLimit(null), 1)
// ช่วงทดลอง (plan=free แต่ trial ยังไม่หมด) = ได้ที่นั่งของแพ็กเกจที่ทดลอง
eq('ทดลอง Pro (ไม่มีระดับ) = 20 ที่นั่ง',
  seatLimit({ plan: 'free', trial_plan: 'pro', trial_expires_at: dayShift(5) }), 20)
eq('ทดลองหมดอายุแล้ว = 1 ที่นั่ง',
  seatLimit({ plan: 'free', trial_plan: 'pro', trial_expires_at: dayShift(-1) }), 1)

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

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ โควตาที่นั่งทีม: ผ่านทั้ง ${pass} ข้อ`)
