import { CapacitorUpdater } from '@capgo/capacitor-updater'

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

export async function initAppUpdate(apiBase: string) {
  await CapacitorUpdater.notifyAppReady()
  if (!apiBase) return
  // เช็คหลังแอปเปิดเสร็จสักพัก — ไม่แย่งเน็ตช่วงโหลดข้อมูลแรก
  setTimeout(() => {
    void check(apiBase).catch(() => {}) // พลาดก็เงียบไว้ เปิดแอปครั้งหน้าลองใหม่เอง
  }, 3000)
}

async function check(apiBase: string) {
  const res = await fetch(`${apiBase}/app-update.json`, { cache: 'no-store' })
  if (!res.ok) return
  const manifest = (await res.json()) as { version?: string; url?: string }
  if (!manifest.version || !manifest.url) return
  // ข้ามเมื่อ: เว็บเป็น commit เดียวกับโค้ดที่รันอยู่ หรือเคยโหลดเวอร์ชันนี้ไปแล้ว
  // (กรณี bundle ใหม่พังแล้วถูกย้อนกลับ ค่า APPLIED_KEY จะกันไม่ให้วนโหลดตัวที่พังซ้ำ)
  const applied = localStorage.getItem(APPLIED_KEY)
  if (manifest.version === __BUILD_ID__ || manifest.version === applied) return
  const bundle = await CapacitorUpdater.download({
    url: new URL(manifest.url, apiBase).toString(),
    version: manifest.version,
  })
  await CapacitorUpdater.next(bundle)
  localStorage.setItem(APPLIED_KEY, manifest.version)
}
