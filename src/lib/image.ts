// บีบอัดรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด — ย่อด้านยาวสุดเหลือ 1920px + encode JPEG คุณภาพสูง
// รูปจากมือถือ 4-12 MB จะเหลือราว 300-700 KB โดยดูด้วยตาแทบไม่ต่างจากเดิม
// ปลอดภัยเสมอ: บีบแล้วไม่เล็กลง / ไฟล์ไม่ใช่รูป / เบราว์เซอร์ไม่รองรับ → คืนไฟล์เดิม

const MAX_EDGE = 1920        // พอสำหรับจอ + พิมพ์เอกสารเปรียบเทียบ
const QUALITY = 0.82         // จุดที่ขนาดลดมากแต่ตายังแยกไม่ออก
const SKIP_BELOW = 300 * 1024 // ไฟล์เล็กอยู่แล้ว ไม่ต้องเสียเวลาบีบ

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // gif (ภาพเคลื่อนไหว) / svg บีบเป็น JPEG ไม่ได้โดยไม่เสียของ
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  if (file.size <= SKIP_BELOW) return file
  try {
    // createImageBitmap หมุนภาพตาม EXIF ให้ (มือถือถ่ายแนวตั้งไม่กลับหัว)
    const bmp = await createImageBitmap(file).catch(() => null)
    if (!bmp) return file
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // JPEG ไม่มีความโปร่งใส — รองพื้นขาวกัน PNG โปร่งกลายเป็นพื้นดำ
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
