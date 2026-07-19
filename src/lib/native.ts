import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Geolocation } from '@capacitor/geolocation'

/** true เมื่อรันเป็นแอปมือถือ (Capacitor) — ใช้สลับพฤติกรรม native/เว็บ */
export const isNativeApp = Capacitor.isNativePlatform()

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
