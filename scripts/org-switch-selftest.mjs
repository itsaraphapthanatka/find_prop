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
const {
  urlAfterOrgSwitch: u, orgSwitchOptions, orgSwitchValue, needsExitImpersonation, IMPERSONATED_OPTION,
} = await import(pathToFileURL(out).href)

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

// ── ตัวสลับองค์กรตอน super admin สวมสิทธิ์องค์กรอื่น ──
const MY = [{ org_id: 'o1', name: 'Demo Estate' }, { org_id: 'o2', name: 'ทีมผม' }]
const checkB = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

checkB('ปกติ (ไม่สวมสิทธิ์): ตัวเลือก = องค์กรของตัวเอง',
  orgSwitchOptions(MY, { id: 'o1', name: 'Demo Estate' }, false).map((o) => o.value), ['o1', 'o2'])
checkB('ปกติ: ค่าที่เลือกอยู่ = องค์กรปัจจุบัน',
  orgSwitchValue(MY, { id: 'o2' }, false), 'o2')

// สวมสิทธิ์องค์กรที่ตัวเองไม่ได้เป็นสมาชิก (เช่น JKP Property) → ต้องมีตัวเลือกนั้นโชว์เป็นค่าที่เลือกอยู่
const IMP = { id: 'o9', name: 'JKP Property' }
checkB('สวมสิทธิ์: เพิ่มตัวเลือกขององค์กรที่สวมไว้เป็นตัวแรก',
  orgSwitchOptions(MY, IMP, true).map((o) => o.value), [IMPERSONATED_OPTION, 'o1', 'o2'])
checkB('สวมสิทธิ์: ป้ายบอกว่ากำลังสวมสิทธิ์',
  orgSwitchOptions(MY, IMP, true)[0].label, 'JKP Property (สวมสิทธิ์)')
checkB('สวมสิทธิ์: ค่าที่เลือกอยู่ต้องไม่เด้งไปองค์กรอื่น',
  orgSwitchValue(MY, IMP, true), IMPERSONATED_OPTION)
checkB('สวมสิทธิ์องค์กรที่ตัวเองเป็นสมาชิกอยู่แล้ว: ไม่ต้องเพิ่มตัวเลือกซ้ำ',
  orgSwitchOptions(MY, { id: 'o1', name: 'Demo Estate' }, true).map((o) => o.value), ['o1', 'o2'])

checkB('สวมสิทธิ์ + เลือกองค์กรจริง → ต้องออกจากสิทธิ์ก่อน',
  needsExitImpersonation(true, 'o2'), true)
checkB('สวมสิทธิ์ + เลือกตัวเลือก "สวมสิทธิ์" → ไม่ต้องทำอะไร',
  needsExitImpersonation(true, IMPERSONATED_OPTION), false)
checkB('ไม่ได้สวมสิทธิ์ → ไม่ต้องออกจากสิทธิ์',
  needsExitImpersonation(false, 'o2'), false)

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const f of fails) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✅ ปลายทางหลังสลับองค์กร: ผ่านทั้ง ${pass} ข้อ`)
