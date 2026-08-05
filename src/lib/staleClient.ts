// กู้คืนกรณี "แอปในเครื่องเป็นเวอร์ชันเก่า" หลังฐานข้อมูลเปลี่ยนกฎสิทธิ์
//
// ที่มา: supabase/roles.sql ถอนสิทธิ์ select บนตาราง properties (อ่านได้ทาง properties_view เท่านั้น)
// เบราว์เซอร์ที่ยังใช้บันเดิลเก่าจาก service worker จะยิงไปที่ตารางตรงๆ แล้วได้
// "permission denied for table properties" ซึ่งอ่านแล้วไม่มีใครเดาได้ว่าต้องรีเฟรช

/** error นี้เกิดเพราะโค้ดในเครื่องเก่ากว่าฐานข้อมูล (ไม่ใช่ผู้ใช้ไม่มีสิทธิ์จริง) หรือไม่ */
export function isStaleClientError(message?: string | null): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  // ตารางที่ถูกถอนสิทธิ์อ่าน — เวอร์ชันใหม่ไม่ยิงไปที่นี่แล้ว
  return m.includes('permission denied') && m.includes('table properties') && !m.includes('properties_view')
}

/** ทิ้ง service worker + แคชทั้งหมด แล้วโหลดหน้าใหม่ให้ได้บันเดิลล่าสุด */
export async function reloadLatestVersion(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
  } catch { /* บางเบราว์เซอร์ไม่มี SW — ข้าม */ }
  try {
    const keys = (await caches?.keys()) ?? []
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch { /* ไม่มี Cache API — ข้าม */ }
  // reload(true) ถูกยกเลิกไปแล้วในเบราว์เซอร์ยุคนี้ — ล้างแคชข้างบนแล้วโหลดปกติก็ได้ของใหม่
  window.location.reload()
}
