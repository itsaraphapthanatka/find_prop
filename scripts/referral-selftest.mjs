// ทดสอบกติการางวัลชวนเพื่อน (เพดานรวม + ไม่กินวันทดลองที่เหลือ) — รัน: npm run test:referral
// เคสต้นเรื่อง: "สมัครช่วงทดลอง 14 วัน แล้วไปชวนเพื่อน" — เดิมวันทดลองที่เหลือหายไป และไม่มีเพดาน
import { build } from 'esbuild'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'referral-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/plan.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
  plugins: [{
    name: 'stub',
    setup(b) {
      b.onResolve({ filter: /\.\/(auth|supabase|payments)$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const useAuth = () => ({}); export const supabase = {}',
        loader: 'js',
      }))
    },
  }],
})
const { DEFAULT_REFERRAL } = await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

// ── ค่ามาตรฐานของเกณฑ์รางวัล (super admin แก้ได้จากหน้า Super Admin) ──
eq('ชวนครบ 2 คน = 1 รอบ', DEFAULT_REFERRAL.need, 2)
eq('รอบละ 30 วัน', DEFAULT_REFERRAL.days, 30)
eq('เพดานรวม 90 วัน/องค์กร', DEFAULT_REFERRAL.maxDays, 90)

// ── สูตรที่ SQL ใช้ (ทดสอบตรรกะเดียวกันด้วย JS เพื่อคุมพฤติกรรม) ──
/** วันรางวัลที่จะให้รอบนี้ = รอบใหม่ × วันต่อรอบ แต่ไม่เกินเพดานที่เหลือ */
const grantDays = (rounds, granted, perRound, maxDays, used) =>
  Math.min(Math.max(0, rounds - granted) * perRound, Math.max(0, maxDays - used))

eq('ชวนครบรอบแรก = 30 วัน', grantDays(1, 0, 30, 90, 0), 30)
eq('ข้าม 2 รอบพร้อมกัน = 60 วัน', grantDays(2, 0, 30, 90, 0), 60)
eq('รอบที่ 4 ชนเพดาน 90 → ได้แค่ส่วนที่เหลือ', grantDays(4, 3, 30, 90, 90), 0)
eq('ใช้ไป 60 เหลือ 30 → ได้ 30 (ไม่ใช่ 60)', grantDays(4, 2, 30, 90, 60), 30)
eq('ใช้ไป 80 เหลือ 10 → ได้ 10', grantDays(3, 2, 30, 90, 80), 10)
eq('เพดาน 0 = ปิดรางวัล', grantDays(5, 0, 30, 0, 0), 0)
eq('ไม่มีรอบใหม่ = ไม่ได้อะไร', grantDays(2, 2, 30, 90, 60), 0)

/** วันหมดอายุใหม่ = ต่อจากวันที่ไกลสุด (แพ็กเกจที่จ่าย / วันหมดทดลอง / วันนี้) + วันรางวัล */
const newExpiry = (sub, trial, today, add) => {
  const base = [sub, trial, today].filter(Boolean).sort().at(-1)
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + add)
  return d.toISOString().slice(0, 10)
}
eq('org ทดลองเหลือ 13 วัน + รางวัล 30 → ต่อจากวันหมดทดลอง (43 วันจากวันนี้)',
  newExpiry(null, '2026-08-18', '2026-08-05', 30), '2026-09-17')
eq('org ที่จ่ายแล้ว → ต่อจากวันหมดแพ็กเกจ',
  newExpiry('2026-12-31', '2026-08-18', '2026-08-05', 30), '2027-01-30')
eq('org ที่หมดทั้งคู่แล้ว → ต่อจากวันนี้',
  newExpiry('2026-07-01', '2026-07-10', '2026-08-05', 30), '2026-09-04')

// ── เกณฑ์นับ "เพื่อนที่จ่ายเงินแล้ว" ไม่ใช่ "เพื่อนที่สมัคร" ──
/** รอบรางวัล = จำนวนเพื่อนที่จ่ายแล้ว หารด้วยเกณฑ์ (คนที่สมัครแต่ไม่จ่าย ไม่นับ) */
const rounds = (paid, need) => Math.floor(paid / need)
eq('สมัคร 6 จ่าย 0 → ยังไม่ได้รางวัล', rounds(0, 2), 0)
eq('จ่าย 1 คน → ยังไม่ครบรอบ', rounds(1, 2), 0)
eq('จ่าย 2 คน → 1 รอบ', rounds(2, 2), 1)
eq('จ่าย 5 คน → 2 รอบ (เศษยกไปรอบหน้า)', rounds(5, 2), 2)

// ── SQL ต้องใช้กติกาเดียวกัน ──
const sql = readFileSync('supabase/referral-cap.sql', 'utf8')
eq('SQL: อ่านเพดานจากตั้งค่า maxDays', /'maxDays'/.test(sql), true)
eq('SQL: นับเฉพาะเพื่อนที่มีแถวใน payments (จ่ายจริง)',
  /exists \(select 1 from public\.payments pay where pay\.org_id = o\.id\)/.test(sql), true)
// ตัดเอาเฉพาะตัวฟังก์ชัน apply_referral มาตรวจ (ไม่งั้น regex วิ่งข้ามไปเจอฟังก์ชันอื่น)
const fnBody = (name) => {
  const start = sql.indexOf(`create or replace function public.${name}`)
  if (start < 0) return ''
  const next = sql.indexOf('create or replace function', start + 10)
  return sql.slice(start, next < 0 ? undefined : next)
}
{
  const body = fnBody('apply_referral')
  eq('SQL: apply_referral มีอยู่', body.length > 0, true)
  eq('SQL: apply_referral ไม่ต่อวันหมดอายุ (ไม่แจกรางวัล)', /sub_expires_at/.test(body), false)
  eq('SQL: apply_referral ไม่แตะยอดวันรางวัล', /referral_reward_days/.test(body), false)
  eq('SQL: apply_referral เหลือหน้าที่ผูกผู้ชวน', /set referred_by = ref_org/.test(body), true)
}
eq('SQL: เงินเข้า (แพ็กเกจ) เรียกตัวแจกรางวัล',
  /apply_payment[\s\S]*?perform public\.grant_referral_reward/.test(sql), true)
eq('SQL: เงินเข้า (ที่นั่งเพิ่ม) เรียกตัวแจกรางวัล',
  /apply_seat_payment[\s\S]*?perform public\.grant_referral_reward/.test(sql), true)
eq('SQL: รางวัลพลาดต้องไม่ทำให้การจ่ายเงินล้ม',
  /exception when others then null/.test(sql), true)
eq('SQL: ผู้ใช้ทั่วไปเรียกตัวแจกรางวัลเองไม่ได้',
  /revoke all on function public\.grant_referral_reward\(uuid\) from public, anon, authenticated/.test(sql), true)
eq('SQL: referral_status แยกยอดจ่ายแล้ว', /paid_count int/.test(sql), true)
eq('SQL: ตัดวันรางวัลด้วยเพดานที่เหลือ',
  /least\(\(should - v_granted\) \* v_days, greatest\(0, v_max - v_days_used\)\)/.test(sql), true)
eq('SQL: ต่อจากวันหมดทดลองด้วย (ไม่กินวันที่เหลือ)',
  /greatest\(coalesce\(sub_expires_at, current_date\),[\s\S]*?coalesce\(trial_expires_at, current_date\)/.test(sql), true)
eq('SQL: จดยอดวันรางวัลสะสม', /referral_reward_days = referral_reward_days \+ v_add/.test(sql), true)
eq('SQL: นับรอบไว้เสมอแม้ชนเพดาน (กันวนขอรางวัลซ้ำ)',
  /set referral_rewards_granted = should where id = ref_org/.test(sql), true)
eq('SQL: referral_status คืนยอดวัน + เพดาน',
  /reward_days int, max_reward_days int/.test(sql), true)
eq('SQL: ค่าเริ่มต้นเพดาน 90 วัน', /"maxDays": 90/.test(sql), true)

// ── ฝั่งแอปต้องโชว์เพดานให้ผู้ใช้เห็น (ไม่ให้เข้าใจว่าชวนได้ฟรีตลอดชีพ) ──
const team = readFileSync('src/pages/TeamPage.tsx', 'utf8')
eq('หน้าทีมโชว์เพดานที่เหลือ', /รับรางวัลได้อีกไม่เกิน/.test(team), true)
eq('หน้าทีมบอกเมื่อครบเพดาน', /ครบเพดานรางวัล/.test(team), true)
eq('หน้าทีมบอกว่าช่วงทดลองรางวัลต่อจากวันหมดทดลอง', /ต่อจากวันหมดทดลอง/.test(team), true)
eq('หน้าทีมบอกเงื่อนไขว่าเพื่อนต้องจ่ายเงินก่อน', /ชำระเงินครั้งแรก/.test(team), true)
eq('หน้าทีมแยกยอด สมัคร/จ่ายแล้ว', /จ่ายเงินแล้ว <b>\{paidCount\}<\/b>/.test(team), true)
const superPage = readFileSync('src/pages/SuperAdminPage.tsx', 'utf8')
eq('หน้า Super Admin ตั้งเพดานได้', /maxDays/.test(superPage), true)
const landing = readFileSync('src/pages/LandingPage.tsx', 'utf8')
eq('หน้า landing เขียนเงื่อนไขตรง (ต้องชำระเงินครั้งแรก)', /ชำระเงินครั้งแรก/.test(landing), true)
eq('หน้า landing ไม่โฆษณาว่าสะสมไม่จำกัด', !/สะสมได้ไม่จำกัด/.test(landing), true)

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ รางวัลชวนเพื่อน (เพดาน + ช่วงทดลอง): ผ่านทั้ง ${pass} ข้อ`)
