import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { App as NativeApp } from '@capacitor/app'
import { API_BASE, platform } from './native'

// live-update แบบ self-hosted: ทุก deploy เว็บจะแนบ dist ทั้งก้อนเป็น zip + manifest
// (scripts/update-zip.mjs) — แอปเช็ค /app-update.json ตอนเปิด ถ้าเป็นคนละ commit
// กับที่รันอยู่ ให้ดาวน์โหลดแล้วสลับใช้ตอนเปิดแอปครั้งถัดไป
//
// กลไกนิรภัย 2 ชั้น:
// 1) notifyAppReady ทุกบูต — ถ้า bundle ใหม่พังจนบูตไม่ถึงจุดนี้ ปลั๊กอินย้อนกลับ bundle เดิมให้เอง
// 2) kill switch — ลบ app-update.json ออกจากเว็บ = ทุกเครื่องหยุดอัปเดตทันที
//
// ข้อจำกัด: อัปเดตได้เฉพาะส่วนเว็บ — push ที่แตะโฟลเดอร์ android/ หรือเพิ่มปลั๊กอิน
// ยังต้องติดตั้ง APK รอบใหม่ (ดู docs/MOBILE.md)
const APPLIED_KEY = 'hob-bundle-version'

export async function initAppUpdate() {
  await CapacitorUpdater.notifyAppReady()
  if (!API_BASE) return
  // เช็คหลังแอปเปิดเสร็จสักพัก — ไม่แย่งเน็ตช่วงโหลดข้อมูลแรก
  setTimeout(() => {
    void check().catch(() => {}) // พลาดก็เงียบไว้ เปิดแอปครั้งหน้าลองใหม่เอง
  }, 3000)
}

interface Manifest {
  version?: string
  url?: string
  builtAt?: number
  apkVersion?: string
  apkUrl?: string
}

async function check() {
  const res = await fetch(`${API_BASE}/app-update.json`, { cache: 'no-store' })
  if (!res.ok) return
  const manifest = (await res.json()) as Manifest
  // เช็ค APK ใหม่แยกอิสระจาก web bundle — live-update ส่งโค้ด native ไม่ได้
  // ถ้ามีเวอร์ชันใหม่ App.tsx จะเด้งแถบชวนดาวน์โหลด (ผู้ใช้ติดตั้งทับได้เลย กุญแจเดียวกัน)
  void checkApk(manifest).catch(() => {})
  if (!manifest.version || !manifest.url) return
  // ข้ามเมื่อ: เว็บเป็น commit เดียวกับโค้ดที่รันอยู่ หรือเคยโหลดเวอร์ชันนี้ไปแล้ว
  // (กรณี bundle ใหม่พังแล้วถูกย้อนกลับ ค่า APPLIED_KEY จะกันไม่ให้วนโหลดตัวที่พังซ้ำ)
  const applied = localStorage.getItem(APPLIED_KEY)
  if (manifest.version === __BUILD_ID__ || manifest.version === applied) return
  // กันดาวน์เกรด: โหลดเฉพาะของที่ "ใหม่กว่า" โค้ดที่รันอยู่เท่านั้น — ไม่งั้น APK
  // ที่เพิ่ง build สดกว่าเว็บจะโดนเว็บเวอร์ชันเก่าดึงถอยหลัง
  if (!manifest.builtAt || manifest.builtAt <= __BUILT_AT__) return
  const bundle = await CapacitorUpdater.download({
    url: new URL(manifest.url, API_BASE).toString(),
    version: manifest.version,
  })
  await CapacitorUpdater.next(bundle)
  localStorage.setItem(APPLIED_KEY, manifest.version)
}

/** true เมื่อ a ใหม่กว่า b (เทียบตัวเลขทีละท่อน — "1.10" ชนะ "1.9") */
function newerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

async function checkApk(manifest: Manifest) {
  // iOS ลง .apk ไม่ได้ (อัปเดตผ่าน App Store/TestFlight) — เด้งแถบดาวน์โหลดเฉพาะ Android
  if (platform !== 'android') return
  if (!manifest.apkVersion || !manifest.apkUrl) return
  // เวอร์ชันของ APK ที่ "ติดตั้งอยู่จริง" ต้องถามจากระบบ ห้ามใช้ค่า compile-time
  // (bundle ที่ live-update มาจะถูก build จากโค้ดใหม่กว่า APK เสมอ)
  const info = await NativeApp.getInfo().catch(() => null)
  if (!info?.version) return // APK รุ่นเก่ามากที่ไม่มีปลั๊กอิน App — ต้องลงมือเองรอบสุดท้าย
  if (!newerVersion(manifest.apkVersion, info.version)) return
  window.dispatchEvent(
    new CustomEvent('hob-apk-update', {
      detail: { version: manifest.apkVersion, url: manifest.apkUrl },
    }),
  )
}
