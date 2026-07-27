// เขตการปกครองไทย (จังหวัด → เขต/อำเภอ → แขวง/ตำบล) จากข้อมูลทางการ
// ไฟล์ข้อมูล ~210KB — โหลดแบบ lazy (dynamic import) เฉพาะตอนเปิดหน้าฟอร์ม ไม่ถ่วง bundle หลัก
// ที่มา: kongvut/thai-province-data (กทม.ตัดคำนำหน้า "เขต" ออกให้ตรงกับข้อมูลเดิมในระบบ)

export type ThaiLocations = Record<string, Record<string, string[]>>

let cache: ThaiLocations | null = null

/** โหลดข้อมูลครั้งเดียวแล้ว cache — พลาด (เน็ตหลุดระหว่างโหลด chunk) คืน null ให้ฟอร์มพิมพ์เองได้ */
export async function loadThaiLocations(): Promise<ThaiLocations | null> {
  if (cache) return cache
  try {
    const mod = await import('../data/thai-locations.json')
    cache = mod.default as ThaiLocations
    return cache
  } catch {
    return null
  }
}
