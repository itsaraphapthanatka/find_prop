// แปล error จาก Supabase Storage เป็นข้อความที่บอกได้ว่าต้องไปแก้อะไร
// เดิมเด้ง message ดิบภาษาอังกฤษ ("mime type image/jpeg is not supported")
// ซึ่งผู้ใช้หน้างานอ่านแล้วทำอะไรต่อไม่ได้ และไม่รู้ว่าเป็นค่าตั้งของถัง ไม่ใช่ไฟล์เสีย

const FIX_SQL = 'supabase/storage-mime.sql'

/** ข้อความบอกผู้ใช้ว่าอัปโหลดไม่ผ่านเพราะอะไร (ชี้ทางแก้เมื่อเป็นค่าตั้งของถังเก็บไฟล์) */
export function uploadErrorText(message: string): string {
  const m = message.toLowerCase()

  // ถังตั้ง allowed_mime_types ไว้ไม่ครบ — แอปบีบรูปเป็น image/jpeg เสมอ จึงพังทุกใบ
  if (m.includes('mime type') || m.includes('invalidmimetype')) {
    return `ถังเก็บไฟล์ยังไม่อนุญาตชนิดไฟล์นี้ — ให้ผู้ดูแลระบบรัน ${FIX_SQL}`
      + ' (หรือแก้ Allowed MIME types ของถัง property-photos ให้มี image/jpeg, image/png, application/pdf)'
  }
  // ขนาดเกินเพดานของถัง (ไม่ใช่เพดานของแอป)
  if (m.includes('exceeded the maximum allowed size') || m.includes('payload too large')
      || m.includes('entity too large')) {
    return `ไฟล์ใหญ่เกินเพดานของถังเก็บไฟล์ — ให้ผู้ดูแลระบบรัน ${FIX_SQL} เพื่อขยายเป็น 20 MB`
  }
  if (m.includes('bucket not found') || m.includes('nosuchbucket')) {
    return `ยังไม่ได้สร้างถังเก็บรูป — ให้ผู้ดูแลระบบรัน ${FIX_SQL}`
  }
  // สิทธิ์ (RLS ของ storage.objects)
  if (m.includes('new row violates row-level security') || m.includes('403')
      || m.includes('unauthorized')) {
    return 'ไม่มีสิทธิ์อัปโหลดไฟล์ — ให้ผู้ดูแลระบบตรวจ policy ของ storage.objects'
  }
  // ชื่อไฟล์ซ้ำ (กันเคสกดซ้ำเร็วๆ ในวินาทีเดียว)
  if (m.includes('already exists') || m.includes('duplicate')) {
    return 'มีไฟล์ชื่อนี้อยู่แล้ว ลองอัปโหลดอีกครั้ง'
  }
  return message
}
