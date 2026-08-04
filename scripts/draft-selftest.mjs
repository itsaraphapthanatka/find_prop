// ทดสอบตัวเองของ "ร่างฟอร์มอัตโนมัติ" (src/lib/draft.ts) — รัน: node scripts/draft-selftest.mjs
// รันได้โดยไม่ต้องมีเบราว์เซอร์/ไม่ต้องล็อกอิน เพราะ draft.ts รับ store จากข้างนอก (ฉีด store ปลอมได้)
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'draft-test-'))
const out = join(dir, 'draft.mjs')
await build({
  entryPoints: ['src/lib/draft.ts'],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
})
const D = await import(pathToFileURL(out).href)

// ── store ปลอมแทน localStorage ──
function fakeStore({ failWrite = false } = {}) {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrite) throw new Error('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k) => map.delete(k),
  }
}

const EMPTY = {
  code: '',
  record_date: '2026-08-04',
  property_type: null,
  lessor_name: null,
  notes: null,
  photos: [],
  zones: [],
  features: [],
  appliances: [],
  documents: [],
  appliance_counts: null,
  nearby_places: null,
}

let pass = 0
const fails = []
function check(name, cond) {
  if (cond) pass++
  else fails.push(name)
}

// 1. ฟอร์มเปล่า = ไม่มีอะไรให้เก็บ
{
  const s = fakeStore()
  const d = D.saveDraft(s, { ...EMPTY }, EMPTY, 0)
  check('ฟอร์มเปล่าไม่เขียนร่าง', d === null && s.map.size === 0)
  check('ฟอร์มเปล่าโหลดร่างได้ null', D.loadDraft(s) === null)
}

// 2. กรอกแล้วเก็บ/โหลดกลับได้ครบ (รวมค่าซ้อนอย่าง documents/appliance_counts)
{
  const s = fakeStore()
  const form = {
    ...EMPTY,
    code: 'WH-009',
    property_type: 'โกดัง',
    lessor_name: 'คุณสมชาย',
    features: ['ใกล้ถนนหลัก'],
    appliance_counts: { 'แอร์': 3 },
    documents: [{ name: 'โฉนดหน้า', url: 'https://x/y.jpg' }],
  }
  const saved = D.saveDraft(s, form, EMPTY, 2, new Date('2026-08-04T14:35:00Z'))
  check('เขียนร่างสำเร็จ', saved !== null && saved.step === 2)
  const back = D.loadDraft(s)
  check('โหลดร่างได้ค่าเดิมครบ', JSON.stringify(back.form) === JSON.stringify(form))
  check('โหลดสเต็ปที่ค้างไว้ถูก', back.step === 2)
  check('savedAt เป็นเวลาที่ส่งเข้าไป', back.savedAt === '2026-08-04T14:35:00.000Z')

  // 3. ล้างฟอร์มกลับเป็นเปล่า → ร่างเดิมต้องหาย (ไม่ค้างเป็นซากให้ทับของใหม่)
  const after = D.saveDraft(s, { ...EMPTY }, EMPTY, 0)
  check('ฟอร์มถูกล้าง → ลบร่างเดิม', after === null && D.loadDraft(s) === null)
}

// 4. clearDraft ลบจริง
{
  const s = fakeStore()
  D.saveDraft(s, { ...EMPTY, code: 'A' }, EMPTY, 0)
  D.clearDraft(s)
  check('clearDraft ลบร่างจริง', D.loadDraft(s) === null)
}

// 5. ข้อมูลใน storage เพี้ยน → ไม่ throw และไม่เอามาใช้
{
  const s = fakeStore()
  const key = [...(() => { D.saveDraft(s, { ...EMPTY, code: 'A' }, EMPTY, 0); return s.map.keys() })()][0]
  s.map.set(key, '{ไม่ใช่ json')
  check('JSON เพี้ยน → null', D.loadDraft(s) === null)
  s.map.set(key, JSON.stringify({ savedAt: 'x', step: 1 })) // ไม่มี form
  check('รูปแบบร่างไม่ครบ → null', D.loadDraft(s) === null)
  s.map.set(key, JSON.stringify({ form: { code: 'B' } })) // ไม่มี savedAt/step
  const d = D.loadDraft(s)
  check('ร่างขาด savedAt/step ยังใช้ได้แบบปลอดภัย', d !== null && d.step === 0 && d.savedAt === '')
}

// 6. localStorage ปิด (store = null) — ต้องไม่ throw
{
  check('store null: save คืน null', D.saveDraft(null, { ...EMPTY, code: 'A' }, EMPTY, 0) === null)
  check('store null: load คืน null', D.loadDraft(null) === null)
  let threw = false
  try { D.clearDraft(null) } catch { threw = true }
  check('store null: clear ไม่ throw', !threw)
}

// 7. localStorage เต็ม (setItem โยน error) — ต้องไม่ throw ให้ฟอร์มพัง
{
  const s = fakeStore({ failWrite: true })
  let threw = false
  let r
  try { r = D.saveDraft(s, { ...EMPTY, code: 'A' }, EMPTY, 0) } catch { threw = true }
  check('เขียนไม่ได้ก็ไม่ throw', !threw && r === null)
}

// 8. changedFields — วันที่บันทึกไม่นับ, ค่าว่างคนละแบบไม่นับ
{
  check('record_date ไม่นับเป็นการกรอก',
    D.changedFields({ ...EMPTY, record_date: '2026-01-01' }, EMPTY).length === 0)
  check('null vs [] ไม่นับว่าต่าง',
    D.changedFields({ ...EMPTY, zones: null, appliance_counts: {} }, EMPTY).length === 0)
  check('กรอก 2 ฟิลด์ = เจอ 2 ฟิลด์',
    D.changedFields({ ...EMPTY, code: 'X', province: 'สมุทรปราการ' }, EMPTY).length === 2)
}

// 9. ข้อความเวลา
{
  const now = new Date('2026-08-04T15:00:00Z')
  check('อายุร่าง: เมื่อครู่นี้', D.draftAgeText('2026-08-04T14:59:40Z', now) === 'เมื่อครู่นี้')
  check('อายุร่าง: นาที', D.draftAgeText('2026-08-04T14:30:00Z', now) === 'เมื่อ 30 นาทีที่แล้ว')
  check('อายุร่าง: ชั่วโมง', D.draftAgeText('2026-08-04T10:00:00Z', now) === 'เมื่อ 5 ชั่วโมงที่แล้ว')
  check('อายุร่าง: วัน', D.draftAgeText('2026-08-01T15:00:00Z', now) === 'เมื่อ 3 วันที่แล้ว')
  check('อายุร่าง: เวลาเพี้ยน', D.draftAgeText('ไม่ใช่เวลา', now) === 'ไม่ทราบเวลา')
  check('เวลาสั้น: เพี้ยน → null', D.draftTimeText('xxx') === null)
  check('เวลาสั้น: ใช้ได้', typeof D.draftTimeText('2026-08-04T14:35:00Z') === 'string')
}

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const f of fails) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✅ ร่างฟอร์มอัตโนมัติ: ผ่านทั้ง ${pass} ข้อ`)
