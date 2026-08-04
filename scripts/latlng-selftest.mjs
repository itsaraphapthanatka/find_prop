// ทดสอบช่องพิกัดช่องเดียว (src/lib/latlng.ts) — รัน: npm run test:latlng
// เคสจากการใช้จริง: นายหน้าก๊อปพิกัด/ลิงก์จาก Google Maps มาวางในช่องเดียว
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'latlng-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/latlng.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
})
const { parseLatLng: p, formatLatLng: f, roundLatLng: r } = await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

const BKK = { lat: 13.599, lng: 100.618 }

// ── พิมพ์เอง ──
eq('มีเว้นวรรคหลังคอมมา', p('13.599, 100.618'), BKK)
eq('ไม่มีเว้นวรรค', p('13.599,100.618'), BKK)
eq('คั่นด้วยช่องว่าง', p('13.599 100.618'), BKK)
eq('มีช่องว่างหัวท้าย', p('  13.599 , 100.618  '), BKK)
eq('ค่าติดลบ (ซีกโลกใต้/ตะวันตก)', p('-33.87, -70.5'), { lat: -33.87, lng: -70.5 })
eq('จำนวนเต็ม', p('14, 101'), { lat: 14, lng: 101 })

// ── วางจาก Google Maps ──
eq('ลิงก์ /@lat,lng,zoom', p('https://www.google.com/maps/@13.599,100.618,17z'), BKK)
// ลิงก์แบบ place: @lat,lng = จุดกลางจอ · !3d/!4d = พิกัดสถานที่จริง → ต้องเอา !3d/!4d
eq('ลิงก์ place (!3d ก่อน !4d — รูปแบบที่ Google ใช้จริง)',
  p('https://www.google.com/maps/place/HOP/@13.5,100.5,17z/data=!4m5!3m4!8m2!3d13.599!4d100.618'), BKK)
eq('ลิงก์ place (สลับลำดับ !4d ก่อน !3d)',
  p('https://www.google.com/maps/place/HOP/@13.5,100.5,17z/data=!3m1!4b1!4d100.618!3d13.599'), BKK)
eq('ลิงก์ ?q=lat,lng', p('https://maps.google.com/?q=13.599,100.618'), BKK)
eq('ลิงก์ ?ll= (แอปเก่า)', p('https://maps.google.com/maps?ll=13.599,100.618&z=16'), BKK)
eq('ลิงก์นำทาง destination=', p('https://www.google.com/maps/dir/?api=1&destination=13.599,100.618'), BKK)

// ── ต้องอ่านไม่ออก (กันข้อมูลผิดเข้า DB) ──
eq('ว่าง', p(''), null)
eq('null', p(null), null)
eq('ข้อความทั่วไป', p('บางพลี สมุทรปราการ'), null)
eq('ลิงก์ย่อที่ไม่มีพิกัด', p('https://maps.app.goo.gl/tv4h47oqsSBAPjVp9'), null)
eq('ตัวเลขตัวเดียว', p('13.599'), null)
eq('เกินช่วงละติจูด', p('99.9, 100.6'), null)
eq('เกินช่วงลองจิจูด', p('13.6, 200'), null)
eq('ตัวเลข 3 ตัว (คลุมเครือ)', p('13.6, 100.6, 17'), null)

// ── แสดงผล/ปัดเศษ ──
eq('format ปกติ', f(13.599, 100.618), '13.599, 100.618')
eq('format ค่าว่าง', f(null, null), '')
eq('format มีแค่ lat', f(13.599, null), '')
eq('ปัด 6 ตำแหน่ง', r({ lat: 13.5991234567, lng: 100.6181234567 }), { lat: 13.599123, lng: 100.618123 })

// ── ไป-กลับต้องได้ค่าเดิม ──
eq('format → parse ได้ค่าเดิม', p(f(BKK.lat, BKK.lng)), BKK)

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ ช่องพิกัดช่องเดียว: ผ่านทั้ง ${pass} ข้อ`)
