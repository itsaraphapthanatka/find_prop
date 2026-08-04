// ทดสอบปลายทางหลังสลับองค์กร (src/lib/orgSwitch.ts) — รัน: npm run test:nav
// เคสที่มาจากการใช้จริง: อยู่หน้า "สรุปภาพรวม" แล้วสลับองค์กร ต้องอยู่หน้าเดิม ไม่เด้งไปหน้ารายการ
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'orgswitch-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/orgSwitch.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
})
const { urlAfterOrgSwitch: u } = await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const check = (name, got, want) => (got === want ? pass++ : fails.push(`${name} — ได้ "${got}" ควรเป็น "${want}"`))

check('สรุปภาพรวม → อยู่หน้าเดิม', u('/dashboard'), '/dashboard')
check('แผนที่ → อยู่หน้าเดิม', u('/map'), '/map')
check('นัดติดตาม → อยู่หน้าเดิม', u('/followups'), '/followups')
check('แผนเยี่ยมชม → อยู่หน้าเดิม', u('/plans'), '/plans')
check('หน้ารายการ → คงเดิม', u('/'), '/')
check('คงตัวกรองในหน้ารายการ', u('/', '?type=โกดัง'), '/?type=โกดัง')
check('คงพารามิเตอร์ของแผนที่', u('/map', '?focus=abc'), '/map?focus=abc')
// หน้าที่ผูกกับทรัพย์ชิ้นเดียว: องค์กรใหม่ไม่มีทรัพย์นั้น ถ้าค้างอยู่จะขึ้น error "โหลดข้อมูลไม่สำเร็จ"
check('แก้ไขทรัพย์ → กลับไปหน้ารายการ', u('/edit/9f3a-uuid'), '/')
check('แก้ไขทรัพย์ (มี query) → กลับไปหน้ารายการ', u('/edit/9f3a-uuid', '?x=1'), '/')
check('เพิ่มทรัพย์ใหม่ → อยู่หน้าเดิม (ร่างยังอยู่)', u('/new'), '/new')
check('path ว่าง → หน้ารายการ', u(''), '/')
check('path ผิดรูป → หน้ารายการ', u('dashboard'), '/')

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const f of fails) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✅ ปลายทางหลังสลับองค์กร: ผ่านทั้ง ${pass} ข้อ`)
