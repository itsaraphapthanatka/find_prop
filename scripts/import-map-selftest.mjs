// ทดสอบการจับคู่หัวคอลัมน์ตอนนำเข้าไฟล์ (src/lib/importProps.ts)
// รัน: node scripts/import-map-selftest.mjs
// เหตุผลที่ต้องมี: ป้ายชื่อฟิลด์ถูกเปลี่ยนเป็นภาษาอ่านรู้เรื่อง (เลิกใช้ขีดล่างยุค AppSheet)
// ไฟล์/เทมเพลตที่ลูกค้าดาวน์โหลดไปก่อนหน้านี้ต้องยังนำเข้าได้เหมือนเดิม
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'import-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['scripts/_import-map-entry.js'],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const { autoMapColumns, convertValue, IMPORT_FIELDS, LABELS, buildTemplateCsv } =
  await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const check = (name, cond) => (cond ? pass++ : fails.push(name))
const mapOf = (header) => autoMapColumns([header])[header]

// 1. ป้ายใหม่ทุกฟิลด์ต้องจับคู่กลับมาเป็นฟิลด์เดิมได้ (round-trip)
for (const f of IMPORT_FIELDS) {
  check(`ป้ายใหม่ "${LABELS[f]}" → ${f}`, mapOf(LABELS[f]) === f)
}

// 2. ชื่อฟิลด์อังกฤษก็ยังใช้เป็นหัวคอลัมน์ได้
check('หัวคอลัมน์อังกฤษ rent_per_month', mapOf('rent_per_month') === 'rent_per_month')

// 3. ป้ายเก่า (ยุคขีดล่าง) ต้องยังนำเข้าได้
const LEGACY = {
  'วันที่': 'record_date',
  'รูป': 'photo_url',
  'PIC': 'pic',
  'สถานะ_เจ้าของทรัพย์': 'lessor_status',
  'ชื่อเจ้าของทรัพย์': 'lessor_name',
  'ชื่อบริษัท_เจ้าของทรัพย์': 'lessor_company',
  'เช่า_หรือ_ขาย': 'listing_type',
  'พื้นที่สี': 'color_zone',
  'โซน': 'zones',
  'ขนาด_ที่ดิน_รวม': 'land_area',
  'ขนาด_อาคาร (ตร.ม.)': 'building_area',
  'กว้าง x ลึก ที่ดิน': 'land_wxd',
  'กว้าง x ลึก อาคาร': 'building_wxd',
  'จำนวน_ชั้น_ออฟฟิศ': 'office_floors',
  'ขนาด_ออฟฟิศ_ชั้น 1': 'office_area_fl1',
  'ขนาด_ออฟฟิศ_รวม': 'office_area_total',
  'ขนาด_อาคาร_รวม': 'building_area_total',
  'ราคา_เช่า/เดือน': 'rent_per_month',
  'ราคา/ตร.ม.': 'price_per_sqm',
  'ภาษีหัก_ณ_ที่จ่าย': 'withholding_tax',
  'ภาษีที่ดิน_และ_สิ่งปลูกสร้าง': 'land_building_tax',
  'ค่าไฟฟ้า': 'electricity_rate',
  'ค่าน้ำประปา': 'water_rate',
  'จำนวน_ประตู': 'door_count',
  'ประตู_กว้าง x ยาว': 'door_wxh',
  'ความสูง_อาคาร': 'building_height',
  'รับน้ำหนัก (ตัน)': 'floor_load',
  'ระบบ_ไฟฟ้า': 'power_system',
  'จำนวนน้ำ_ที่ใช้ได้ต่อวัน': 'water_per_day',
  'ระยะ_เวลา_สัญญา': 'contract_period',
  'ค่าประกัน': 'deposit',
  'ค่าเช่า_ล่วงหน้า': 'advance_rent',
  'การใช้งาน': 'usages',
  'ห้องนอน': 'bedrooms',
  'ห้องน้ำ': 'bathrooms',
  'ห้องครัว': 'kitchens',
  'วิดีโอ (ลิงก์)': 'video_url',
  'แผนที่ (ลิงก์)': 'map_url',
  'หมายเหตุ_ถ้ามี': 'notes',
  // ป้ายยุคแรกสุด "ผู้ให้เช่า"
  'สถานะ_ผู้ให้เช่า': 'lessor_status',
  'ชื่อผู้ให้เช่า': 'lessor_name',
}
for (const [header, field] of Object.entries(LEGACY)) {
  check(`ป้ายเก่า "${header}" → ${field}`, mapOf(header) === field)
}

// 4. ชื่อเรียกที่คนพิมพ์กันเองต้องยังใช้ได้
const ALIAS = {
  'เบอร์โทร': 'phone', 'ค่าเช่า': 'rent_per_month', 'ราคา': 'sale_price',
  'ตำบล': 'subdistrict', 'อำเภอ': 'district', 'latitude': 'lat', 'สำหรับ': 'listing_type',
}
for (const [header, field] of Object.entries(ALIAS)) {
  check(`ชื่อเรียกอื่น "${header}" → ${field}`, mapOf(header) === field)
}

// 5. หัวคอลัมน์ที่ไม่รู้จัก = ไม่นำเข้า (ไม่เดาสุ่ม)
check('หัวคอลัมน์ไม่รู้จัก → ไม่นำเข้า', mapOf('คอลัมน์อะไรก็ไม่รู้') === '')

// 6. หัวคอลัมน์เก่า+ใหม่ในไฟล์เดียวกัน → ไม่แย่งฟิลด์กัน (ตัวแรกได้ไป)
{
  const m = autoMapColumns(['ค่าเช่า/เดือน (บาท)', 'ราคา_เช่า/เดือน'])
  check('ป้ายซ้ำความหมาย → ฟิลด์เดียวเท่านั้น',
    m['ค่าเช่า/เดือน (บาท)'] === 'rent_per_month' && m['ราคา_เช่า/เดือน'] === '')
}

// 7. แปลงค่าตามชนิดฟิลด์
check('ตัวเลขมีคอมมา', convertValue('rent_per_month', '85,000') === 85000)
check('ใช่ → true', convertValue('has_crane', 'ใช่') === true)
check('ไม่มี → false', convertValue('container_access', 'ไม่มี') === false)
check('ค่าอื่นในฟิลด์ใช่/ไม่ → null', convertValue('has_crane', 'อาจจะ') === null)
check('array คั่นด้วยจุลภาค', JSON.stringify(convertValue('zones', 'A, B')) === '["A","B"]')
check('วันที่ พ.ศ. → ค.ศ.', convertValue('record_date', '4/8/2569') === '2026-08-04')

// 8. เทมเพลต CSV ใช้ป้ายใหม่ + ไม่มีขีดล่างค้าง
{
  const csv = buildTemplateCsv()
  const header = csv.split('\n')[0]
  check('เทมเพลตมีป้ายใหม่', header.includes('ค่าเช่า/เดือน (บาท)') && header.includes('ระบบไฟฟ้า'))
  check('เทมเพลตไม่มีป้ายขีดล่างเดิม', !header.includes('_'))
}

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const f of fails) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✅ จับคู่หัวคอลัมน์นำเข้า: ผ่านทั้ง ${pass} ข้อ`)
