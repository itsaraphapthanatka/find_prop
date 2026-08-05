// ทดสอบ "จำการเข้าสู่ระบบในเครื่องนี้" (src/lib/authStorage.ts) — รัน: npm run test:auth
// ติ๊กจำไว้ = localStorage (ปิดเบราว์เซอร์แล้วยังล็อกอินอยู่)
// ไม่ติ๊ก    = sessionStorage (ปิดแท็บ/เบราว์เซอร์ = ออกจากระบบ — เครื่องสาธารณะ)
import { build } from 'esbuild'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'auth-test-'))
const out = join(dir, 'bundle.mjs')
await build({
  entryPoints: ['src/lib/authStorage.ts'],
  outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
})
const { makeAuthStorage } = await import(pathToFileURL(out).href)

const fails = []
let pass = 0
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want) ? pass++ : fails.push(`${name} — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`))

/** ที่เก็บปลอมแบบง่าย (เลียน Storage API) */
const fakeStore = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _map: m,
  }
}
const KEY = 'sb-auth-token'

// ── ติ๊ก "จำการเข้าสู่ระบบ" → session ลง localStorage ──
{
  const local = fakeStore(); const session = fakeStore()
  const st = makeAuthStorage(local, session, () => true)
  st.setItem(KEY, 'TOKEN')
  eq('จำไว้: เขียนลง localStorage', local.getItem(KEY), 'TOKEN')
  eq('จำไว้: ไม่เขียนลง sessionStorage', session.getItem(KEY), null)
  eq('จำไว้: อ่านกลับได้', st.getItem(KEY), 'TOKEN')
}

// ── ไม่ติ๊ก → session อยู่แค่ในแท็บ และต้องไม่ทิ้งของค้างใน localStorage ──
{
  const local = fakeStore(); const session = fakeStore()
  const st = makeAuthStorage(local, session, () => false)
  st.setItem(KEY, 'TOKEN')
  eq('ไม่จำ: เขียนลง sessionStorage', session.getItem(KEY), 'TOKEN')
  eq('ไม่จำ: ไม่ทิ้ง session ค้างใน localStorage', local.getItem(KEY), null)
  eq('ไม่จำ: อ่านกลับได้', st.getItem(KEY), 'TOKEN')
}

// ── สลับจาก "จำไว้" เป็น "ไม่จำ" ต้องล้างของเดิมออกจาก localStorage ──
{
  const local = fakeStore(); const session = fakeStore()
  let keep = true
  const st = makeAuthStorage(local, session, () => keep)
  st.setItem(KEY, 'OLD')
  keep = false
  st.setItem(KEY, 'NEW')
  eq('สลับเป็นไม่จำ: localStorage ต้องว่าง (ไม่มี token ค้างในเครื่อง)', local.getItem(KEY), null)
  eq('สลับเป็นไม่จำ: ใช้ค่าใหม่จาก sessionStorage', st.getItem(KEY), 'NEW')
}

// ── สลับจาก "ไม่จำ" เป็น "จำไว้" ──
{
  const local = fakeStore(); const session = fakeStore()
  let keep = false
  const st = makeAuthStorage(local, session, () => keep)
  st.setItem(KEY, 'OLD')
  keep = true
  st.setItem(KEY, 'NEW')
  eq('สลับเป็นจำไว้: อยู่ใน localStorage', local.getItem(KEY), 'NEW')
  eq('สลับเป็นจำไว้: ไม่เหลือใน sessionStorage', session.getItem(KEY), null)
}

// ── ออกจากระบบต้องลบทั้งสองที่ ──
{
  const local = fakeStore(); const session = fakeStore()
  local.setItem(KEY, 'A'); session.setItem(KEY, 'B')
  const st = makeAuthStorage(local, session, () => true)
  st.removeItem(KEY)
  eq('ออกจากระบบ: ลบจาก localStorage', local.getItem(KEY), null)
  eq('ออกจากระบบ: ลบจาก sessionStorage', session.getItem(KEY), null)
}

// ── อ่านค่า: sessionStorage มาก่อน (โหมดไม่จำในแท็บนี้) ──
{
  const local = fakeStore(); const session = fakeStore()
  local.setItem(KEY, 'FROM_LOCAL'); session.setItem(KEY, 'FROM_SESSION')
  eq('อ่าน: ยึด sessionStorage ก่อน', makeAuthStorage(local, session, () => true).getItem(KEY), 'FROM_SESSION')
}
{
  const local = fakeStore(); const session = fakeStore()
  local.setItem(KEY, 'FROM_LOCAL')
  eq('อ่าน: ไม่มีใน session → ใช้ของ local (ล็อกอินค้างจากรอบก่อน)',
    makeAuthStorage(local, session, () => false).getItem(KEY), 'FROM_LOCAL')
}

// ── เบราว์เซอร์ปิด storage (โหมดส่วนตัวบางตัว) ต้องไม่ throw ──
{
  const boom = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
    removeItem: () => { throw new Error('blocked') },
  }
  const st = makeAuthStorage(boom, boom, () => true)
  let threw = false
  try { st.setItem(KEY, 'X'); st.getItem(KEY); st.removeItem(KEY) } catch { threw = true }
  eq('storage ใช้ไม่ได้ → ไม่ throw (แอปไม่ขาว)', threw, false)
  eq('storage ใช้ไม่ได้ → อ่านได้ null', st.getItem(KEY), null)
}

// ── ฝั่ง client ต้องต่อสายไว้จริง ──
const sb = readFileSync('src/lib/supabase.ts', 'utf8')
eq('supabase client ใช้ storage adapter นี้', /storage: makeAuthStorage\(\)/.test(sb), true)
const login = readFileSync('src/pages/LoginPage.tsx', 'utf8')
eq('หน้าเข้าสู่ระบบมีช่องติ๊กจำการเข้าสู่ระบบ', /จำการเข้าสู่ระบบในเครื่องนี้/.test(login), true)
eq('ตั้งค่า remember ก่อนเรียกล็อกอิน',
  login.indexOf('setRememberMe(remember)') < login.indexOf("signIn(email.trim(), password)"), true)

// ── ลืมรหัสผ่าน ──
eq('มีลิงก์ "ลืมรหัสผ่าน?"', /ลืมรหัสผ่าน\?/.test(login), true)
eq('ส่งลิงก์รีเซ็ตด้วย resetPasswordForEmail', /resetPasswordForEmail\(/.test(login), true)
eq('ลิงก์ในอีเมลกลับมาที่หน้า login พร้อมธง reset', /\/#\/login\?reset=1/.test(login), true)
eq('ไม่บอกว่าอีเมลมีในระบบหรือไม่ (กันไล่เดาลูกค้า)', /ถ้ามีบัญชีของ/.test(login), true)
eq('มีหน้าตั้งรหัสผ่านใหม่', /export function ResetPasswordScreen/.test(login), true)
eq('ตั้งรหัสใหม่ด้วย updateUser', /updateUser\(\{ password/.test(login), true)
eq('ยืนยันรหัส 2 ช่องและเช็คตรงกัน', /รหัสผ่านทั้งสองช่องไม่ตรงกัน/.test(login), true)
eq('ลิงก์หมดอายุแล้วบอกให้ขอใหม่', /ลิงก์หมดอายุหรือถูกใช้ไปแล้ว/.test(login), true)

const auth = readFileSync('src/lib/auth.tsx', 'utf8')
eq('ดักเหตุการณ์ PASSWORD_RECOVERY', /event === 'PASSWORD_RECOVERY'/.test(auth), true)
const app = readFileSync('src/App.tsx', 'utf8')
eq('บังคับตั้งรหัสใหม่ก่อนเข้าแอป', /if \(recovery\) return <ResetPasswordScreen \/>/.test(app), true)

rmSync(dir, { recursive: true, force: true })

if (fails.length) {
  console.error(`❌ ไม่ผ่าน ${fails.length} ข้อ (ผ่าน ${pass}):`)
  for (const x of fails) console.error(`   - ${x}`)
  process.exit(1)
}
console.log(`✅ จำการเข้าสู่ระบบ + ลืมรหัสผ่าน: ผ่านทั้ง ${pass} ข้อ`)
