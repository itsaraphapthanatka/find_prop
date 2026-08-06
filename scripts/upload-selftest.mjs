// ทดสอบการอัปโหลดรูป/เอกสาร — รัน: npm run test:upload
// เคสต้นเรื่อง: อัปโหลดรูปแล้วได้ 415 "mime type image/jpeg is not supported"
// (ถัง property-photos ตั้ง Allowed MIME types ไว้ไม่มี image/jpeg — มักกรอกเป็น "jpg")
import { build } from 'esbuild'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'upload-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/upload.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
})
const { uploadErrorText } = await import(pathToFileURL(out).href)

const sql = readFileSync('supabase/storage-mime.sql', 'utf8')
const img = readFileSync('src/lib/image.ts', 'utf8')
const form = readFileSync('src/pages/FormPage.tsx', 'utf8')
const steps = readFileSync('src/pages/form/steps.tsx', 'utf8')

const fails = []
let pass = 0
const ok = (name, cond) => (cond ? pass++ : fails.push(name))
const has = (name, msg, needle) => {
  const got = uploadErrorText(msg)
  return got.includes(needle)
    ? pass++
    : fails.push(`${name} — ได้ "${got}" ควรมีคำว่า "${needle}"`)
}

// ── 1) ถังต้องรับชนิดที่แอปส่งขึ้นจริง ────────────────────────────
// แอปบีบรูปทุกใบเป็น jpeg ก่อนอัปโหลด → ถังไม่รับ image/jpeg = พังทั้งระบบ
ok('แอปบีบรูปเป็น image/jpeg ก่อนอัปโหลด (ที่มาของเคสนี้)',
  /type: 'image\/jpeg'/.test(img))
ok('ฟอร์มเอกสารสิทธิ์รับ PDF ด้วย', /accept="image\/\*,application\/pdf"/.test(steps))

// ⚠️ ต้องเช็คใน "ค่าที่เขียนลงถัง" เท่านั้น — ชื่อ MIME โผล่ในคอมเมนต์และในบล็อกตรวจตัวเอง
// ของ SQL ด้วย ถ้าค้นทั้งไฟล์จะผ่านทั้งที่ลบออกจากรายการจริงไปแล้ว
const insertStmt = sql.slice(sql.indexOf('insert into storage.buckets'), sql.indexOf('on conflict'))
const allowed = insertStmt.slice(insertStmt.indexOf('array['), insertStmt.indexOf(']', insertStmt.indexOf('array[')))
ok('อ่านรายการ allowed_mime_types จากคำสั่ง insert ได้', allowed.includes('array['))
for (const t of ['image/jpeg', 'image/png', 'application/pdf']) {
  ok(`ถังอนุญาต ${t}`, allowed.includes(`'${t}'`))
}
// ไอโฟนส่ง heic เมื่อบีบในเบราว์เซอร์ไม่ได้
for (const t of ['image/heic', 'image/heif', 'image/webp']) {
  ok(`ถังอนุญาต ${t} (รูปจากมือถือที่บีบไม่ได้)`, allowed.includes(`'${t}'`))
}
ok('ไม่อนุญาต SVG (ถังเป็น public · SVG ฝัง script ได้)', !allowed.includes("'image/svg+xml'"))
ok('ทุกค่าในรายการเป็น MIME type จริง (ไม่ใช่ jpg/png เปล่าๆ)',
  allowed.match(/'[^']+'/g).every((t) => t.includes('/')))
ok('ไม่ปล่อยรับทุกชนิด (allowed_mime_types ต้องไม่เป็น null)',
  !/allowed_mime_types\s*=\s*null/.test(sql))

// ── 2) รันซ้ำได้ และแก้ค่าที่ตั้งผิดไว้แล้วได้จริง ─────────────────
ok('มี on conflict do update (ถังมีอยู่แล้วก็แก้ค่าให้)', /on conflict \(id\) do update/.test(sql))
ok('เขียนทับ allowed_mime_types ที่ตั้งผิดไว้', /allowed_mime_types = excluded\.allowed_mime_types/.test(sql))
ok('ไม่ลดเพดานขนาดไฟล์ที่ตั้งไว้สูงกว่า (ใช้ greatest)',
  /file_size_limit = greatest\(/.test(sql))
ok('บังคับให้ถังเป็น public (ไม่งั้นรูปไม่ขึ้นในแอป)', /set public = true/.test(sql))

// ── 3) SQL ต้องตรวจตัวเองและพังเสียงดัง ──────────────────────────
ok('ตรวจว่าอนุญาต image/jpeg จริง', /image\/jpeg[\s\S]{0,400}raise exception|raise exception[\s\S]{0,200}InvalidMimeType/.test(sql))
ok('ตรวจว่าไม่ได้กรอกเป็นนามสกุลไฟล์ (jpg แทน image/jpeg)',
  /t not like '%\/%'/.test(sql))
ok('ตรวจเพดานขนาดไฟล์ไม่เล็กเกินไป', /v_limit, 0\) < 5242880/.test(sql))
ok('ตรวจว่าถังเป็น public', /if not v_pub then/.test(sql))
ok('ท้ายไฟล์โชว์ค่าที่ตั้งไว้ให้ตรวจด้วยตา',
  /select id, public, file_size_limit, allowed_mime_types/.test(sql))

// ── 4) ข้อความ error ต้องบอกทางแก้ ไม่ใช่ message ดิบภาษาอังกฤษ ────
ok('หน้าฟอร์มไม่เด้ง error ดิบตอนอัปโหลดรูป',
  /อัปโหลดรูปไม่สำเร็จ: \$\{uploadErrorText\(error\.message\)\}/.test(form))
ok('หน้าฟอร์มไม่เด้ง error ดิบตอนแนบเอกสาร',
  /ไม่สำเร็จ: \$\{uploadErrorText\(error\.message\)\}/.test(form))

has('415 mime type', 'mime type image/jpeg is not supported', 'storage-mime.sql')
has('415 บอกว่าเป็นค่าตั้งของถัง ไม่ใช่ไฟล์เสีย', 'mime type image/jpeg is not supported', 'ถังเก็บไฟล์')
has('415 บอก MIME ที่ต้องใส่', 'mime type image/jpeg is not supported', 'image/jpeg')
has('ไฟล์ใหญ่เกิน', 'The object exceeded the maximum allowed size', 'ใหญ่เกินเพดาน')
has('payload too large', 'Payload too large', 'ใหญ่เกินเพดาน')
has('ยังไม่สร้างถัง', 'Bucket not found', 'ยังไม่ได้สร้างถัง')
has('ไม่มีสิทธิ์', 'new row violates row-level security policy', 'ไม่มีสิทธิ์')
has('ชื่อไฟล์ซ้ำ', 'The resource already exists', 'ชื่อนี้อยู่แล้ว')
// error ที่ไม่รู้จักต้องไม่ถูกกลืน — ต้องเห็นข้อความเดิมเพื่อ debug ต่อได้
ok('error ที่ไม่รู้จักยังแสดงข้อความเดิม',
  uploadErrorText('Something odd happened') === 'Something odd happened')
ok('เทียบข้อความแบบไม่สนตัวพิมพ์ใหญ่เล็ก',
  uploadErrorText('MIME TYPE image/jpeg IS NOT SUPPORTED').includes('storage-mime.sql'))

console.log(`\nอัปโหลดรูป/เอกสาร: ผ่าน ${pass} · ไม่ผ่าน ${fails.length}`)
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('✓ ถังรับชนิดไฟล์ที่แอปส่งจริง · ตั้งค่าผิดแล้วรันซ้ำแก้ได้ · error บอกทางแก้')
