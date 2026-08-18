// จัดการ photo_url ที่เพี้ยนจาก migration (AppSheet):
//  • บางแถวเก็บ "หลายลิงก์" ต่อกันด้วย " | " หรือขึ้นบรรทัดใหม่ → เอาเฉพาะลิงก์แรก
//  • เป็นลิงก์หน้า Google Drive (/file/d/<id>/view) ซึ่งไม่ใช่ไฟล์รูปตรง → แปลงเป็น endpoint รูปย่อ
// ถ้าไม่แปลงจะเอาทั้งก้อนไปใส่ <img src> → เบราว์เซอร์มองเป็น URL relative → ยิง 404 ทุกการ์ด

const DRIVE_ID = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)|[?&]id=)([-\w]{20,})/

/** แปลง 1 ลิงก์ → URL รูปที่แสดงได้ (Google Drive → รูปย่อ) หรือ null */
function toImageUrl(first: string, size: number): string | null {
  const m = first.match(DRIVE_ID)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size}`
  return /^https?:\/\//i.test(first) ? first : null
}

/** คืน URL รูปแรกที่แสดงได้ (แปลงลิงก์ Google Drive → รูปย่อ) หรือ null ถ้าไม่มี */
export function photoThumb(raw: string | null | undefined, size = 320): string | null {
  if (!raw) return null
  const first = String(raw).split(/[|\n\r]+/).map((s) => s.trim()).find(Boolean)
  return first ? toImageUrl(first, size) : null
}

/** คืน URL รูป "ทุกอัน" จากค่าที่อาจมีหลายลิงก์ต่อกันด้วย " | " (แปลง Google Drive ให้ด้วย) */
export function photoList(raw: string | null | undefined, size = 1024): string[] {
  if (!raw) return []
  return String(raw)
    .split(/[|\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u) => toImageUrl(u, size))
    .filter((u): u is string => Boolean(u))
}
