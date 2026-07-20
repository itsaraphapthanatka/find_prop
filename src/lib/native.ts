import { Capacitor, registerPlugin } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Geolocation } from '@capacitor/geolocation'

// ปลั๊กอิน local ฝั่ง android/ (WebPrintPlugin.java) — พิมพ์หน้าปัจจุบันผ่านระบบพิมพ์เครื่อง
const WebPrint = registerPlugin<{ print(): Promise<void> }>('WebPrint')

/** true เมื่อรันเป็นแอปมือถือ (Capacitor) — ใช้สลับพฤติกรรม native/เว็บ */
export const isNativeApp = Capacitor.isNativePlatform()

/** 'android' | 'ios' | 'web' — ใช้แยกพฤติกรรมเฉพาะแพลตฟอร์ม
    (เช่น แถบดาวน์โหลด APK เด้งเฉพาะ Android — iOS อัปเดตผ่าน App Store/TestFlight) */
export const platform = Capacitor.getPlatform()

/** ฐาน URL ของเว็บ prod สำหรับเรียก API / เช็คอัปเดตจากในแอป
    ⚠️ ในแอปห้ามปล่อยว่างเด็ดขาด: bundle ที่ถูก live-update มาจากเว็บถูก build บน Vercel
    ซึ่งไม่มีค่า VITE_API_BASE — ถ้าไม่มี fallback แอปจะหยุดเช็คอัปเดตถาวร (ค้างกับ
    bundle เก่าตลอดกาล — เกิดขึ้นจริง 2026-07-19) และ AI จะเรียก /api/ai ไม่ได้ */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (isNativeApp ? 'https://hob-alpha.vercel.app' : '')

/** true เมื่อรัน "แบบแอปที่ติดตั้งไว้" — แอป Capacitor หรือ PWA ที่ปักหน้าจอโฮม (standalone)
    ใช้ตัดหน้า landing: คนที่ติดตั้งถึงขั้นนี้คือทีมงาน ไม่ใช่ลูกค้าที่เพิ่งหลงเข้ามาดูเว็บ */
export const isInstalledApp =
  isNativeApp ||
  (typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true))

export type PositionResult =
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'failed' }

/** หาตำแหน่งปัจจุบัน — ในแอปใช้ปลั๊กอิน native (ขอสิทธิ์ระบบให้เอง เสถียรกว่า WebView)
    บนเว็บใช้ navigator.geolocation ตามเดิม */
export async function getPosition(): Promise<PositionResult> {
  if (isNativeApp) {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 })
      return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, reason: /denied|permission/i.test(msg) ? 'denied' : 'failed' }
    }
  }
  if (!('geolocation' in navigator)) return { ok: false, reason: 'unsupported' }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'failed' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  })
}

/** สั่งพิมพ์หน้าปัจจุบัน — เว็บใช้ dialog ของเบราว์เซอร์
    ในแอปเรียกระบบพิมพ์ Android (เลือกเครื่องพิมพ์หรือ "บันทึกเป็น PDF" ได้)
    เพราะ window.print() ใน WebView เป็น no-op เงียบๆ */
export async function printPage() {
  if (isNativeApp) {
    try {
      await WebPrint.print()
      return
    } catch {
      // ปลั๊กอินยังไม่มีในแอปตัวเก่า (ลงก่อน build นี้) — ปล่อยไหลไป window.print เผื่อไว้
    }
  }
  window.print()
}

/** เปิดกล้องถ่ายรูป (มีผลเฉพาะในแอป) — คืน File พร้อมส่งเข้า flow อัปโหลดรูปเดิม
    คืน null เมื่อผู้ใช้ยกเลิก */
export async function takePhoto(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 82,
      width: 1600, // ย่อรูปฝั่งเครื่องก่อนอัปโหลด — รูปทรัพย์ไม่จำเป็นต้องละเอียดระดับต้นฉบับ
      correctOrientation: true,
      saveToGallery: false,
    })
    if (!photo.webPath) return null
    const blob = await (await fetch(photo.webPath)).blob()
    const ext = photo.format || 'jpeg'
    return new File([blob], `camera-${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` })
  } catch {
    return null // ผู้ใช้กดยกเลิกกล้อง — ไม่ใช่ข้อผิดพลาด
  }
}
